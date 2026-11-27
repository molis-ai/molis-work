import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { TestContext } from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext, PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { installHostUiText, registeredBuiltinText, LocalProjectDatabase, MolisWorkLocalHost, openHomePluginStore, openProjectVersionStores, partitionPluginScope, startPartitionPluginInstance,
  type PartitionPluginInstance, type PartitionPluginScope } from "@molis-ai/molis-work-app-local-host";
import { partitionRoot } from "@molis-ai/molis-work-module-projects";
import { HOST_BUILD_TRUST, installIdentity } from "@molis-ai/molis-work-plugin-runtime";
import { pluginActions } from "./plugin-actions.js";
import { createImagesPlugin, imagesManifest, IMAGES_ACTION_PERMISSIONS,
  imagesActions, type ImageJob } from "@molis-ai/molis-work-plugin-images";

export const IMAGE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
export const imageReply = (response: ServerResponse) => { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ data: [{ b64_json: IMAGE_PNG }] })); };
/**
 * Images in two partitions, "project-a" and "project-b" (batch 108: one instance per plugin and partition, each on its own library and files),
 * started the way the Host's per-partition assembly starts them, with the Home's one install table. The connections follow the person
 * (`services.personSettings`), so every partition sees the same ones. `clearProject` does what deleting a project does to it: its instance
 * stops, its library and files go, and the next use starts a fresh instance there.
 */
export async function imageRuntimeFixture(t: TestContext, options: {
  home?: string;
  respond?: (input: Record<string, unknown>, response: ServerResponse, request: IncomingMessage) => void | Promise<void>;
  context?: (context: PluginStartContext) => PluginStartContext;
  definition?: (definition: PluginDefinition) => PluginDefinition;
  /** False when the test binds its own Prologue inference for this Home (no resident Host then). */
  inference?: false;
} = {}) {
  // The Host installs its text when it starts its plugins; this fixture starts the instances itself.
  installHostUiText();
  const home = options.home ?? await realpath(await mkdtemp(join(tmpdir(), "images-runtime-"))), contexts: PluginStartContext[] = [], calls: Record<string, unknown>[] = [];
  // The resident Host owns the actual Prologue inference; the instances below are started from the Images entry under test.
  const inferenceOwner = options.inference === false ? null : new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const installs = openHomePluginStore(home);
  const definitionFor = () => {
    const definition = createImagesPlugin(), original = definition.start;
    definition.start = context => { contexts.push(context); return original(options.context?.(context) ?? context); };
    return options.definition?.(definition) ?? definition;
  };
  const running = new Map<string, Promise<{ store: LocalProjectDatabase; registry: ActionService; instance: PartitionPluginInstance; scope: PartitionPluginScope }>>();
  const partition = (id: string) => {
    let started = running.get(id);
    if (!started) {
      started = (async () => {
        mkdirSync(partitionRoot(home, id), { recursive: true });
        const store = new LocalProjectDatabase(join(partitionRoot(home, id), "molis-work.db")), definition = definitionFor();
        const actions = pluginActions(store, id);
        const ports = { store, ...openProjectVersionStores(store), projectId: id, actorId: LOCAL_PERSON_ACTOR_ID, homeDirectory: home, actions };
        const scope = partitionPluginScope(home, id, imagesManifest.plugin_id, installIdentity(definition.manifest));
        const instance = await startPartitionPluginInstance(ports, scope, { definition, trust: HOST_BUILD_TRUST, localePacks: () => registeredBuiltinText(imagesManifest) }, installs.db);
        return { store, registry: actions.registry, instance, scope };
      })();
      running.set(id, started);
    }
    return started;
  };
  const stopAll = async () => {
    for (const started of running.values()) { const { instance, store } = await started; await instance.stop(); store.close(); }
    running.clear();
  };
  const provider = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    const input = JSON.parse(raw) as Record<string, unknown>; calls.push(input);
    await (options.respond ? options.respond(input, response, request) : imageReply(response));
  });
  t.after(async () => {
    try { await stopAll(); installs.db.close(); } finally {
      try { await inferenceOwner?.close(); } finally {
        provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve()));
        await rm(home, { recursive: true, force: true });
      }
    }
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  const address = provider.address(); assert.ok(address && typeof address === "object");
  const first = await partition("project-a");
  await partition("project-b");
  const platform = first.instance.platform;
  assert.equal(platform.supervisor.state(imagesManifest.plugin_id)?.status, "running");
  // A partition's instance, as the old Home supervisor answered for the one instance there was.
  const supervisor = { installation: (pluginId: string) => {
    const installId = platform.supervisor.state(pluginId)?.install_id;
    return installId ? platform.runtime.get(installId) : undefined;
  } };
  // `null` was the Home; the connections it held now follow the person and are read and written from any partition Images is in.
  const where = (projectId: string | null) => projectId ?? "project-a";
  const caller = (projectId: string | null = "project-a", extra: Partial<ActionCallContext> = {}): ActionCallContext => ({
    actor_id: LOCAL_PERSON_ACTOR_ID, project_id: where(projectId), audience: "user", permissions: IMAGES_ACTION_PERMISSIONS, ...extra,
  });
  // The partition's instance is started again on first use after `clearProject`, as the Host opens a partition again.
  const service = (projectId: string): ActionClient => ({
    discover: async context => (await partition(projectId)).registry.discover(context),
    discoverOne: async (context, reference) => (await partition(projectId)).registry.discoverOne(context, reference),
    invoke: async (context, reference, input) => (await partition(projectId)).registry.invoke(context, reference, input),
  });
  const client = (projectId: string | null = "project-a", extra: Partial<ActionCallContext> = {}) => bindActionClient(service(where(projectId)), () => caller(projectId, extra));
  const input = { name: "本机受控生图", api_format: "openai-images" as const, base_url: `http://127.0.0.1:${address.port}/v1`, model: "fixture-image" };
  const scopeOf = (projectId: string) => partitionPluginScope(home, projectId, imagesManifest.plugin_id, first.scope.install_id);
  return { home, contexts, calls, provider, supervisor, platform, registry: first.registry, caller, client, input,
    /** Starts (or returns) the partition's instance, as the Host does when the partition is opened. */
    start: partition,
    /** The partition's Images library file. */
    library: (projectId = "project-a") => scopeOf(projectId).libraryPath("images"),
    /** The partition's generated picture files, by name. */
    assets: (projectId = "project-a") => { const path = join(partitionRoot(home, projectId), "plugin-files", first.scope.install_id, "images", "assets"); return existsSync(path) ? readdirSync(path) : []; },
    assetsDirectory: (projectId = "project-a") => join(partitionRoot(home, projectId), "plugin-files", first.scope.install_id, "images", "assets"),
    clearProject: async (projectId: string) => {
      const started = running.get(projectId);
      running.delete(projectId);
      if (started) { const { instance, store } = await started; await instance.stop(); store.close(); }
      await rm(partitionRoot(home, projectId), { recursive: true, force: true });
      return true;
    },
    connection: () => client(null).invoke(imagesActions.saveConnection, input),
  };
}

export async function imageTerminal(client: ReturnType<Awaited<ReturnType<typeof imageRuntimeFixture>>["client"]>, id: string): Promise<ImageJob> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const { job } = await client.invoke(imagesActions.get, { id });
    if (job.status !== "running") return job;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("Image job did not reach a terminal status");
}
export async function imageUntil(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!await check()) {
    if (Date.now() >= deadline) assert.fail("Image operation did not settle");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

/** Bind the actual Runtime library and owner-file service, retaining the caller's current lease. */
/** The sync binding of one partition's Images instance (each partition syncs its own library). */
export async function imageSyncFixture(runtime:Awaited<ReturnType<typeof imageRuntimeFixture>>,projectId='project') {
 await runtime.start(projectId);const context=runtime.contexts.findLast(item=>item.project_id===projectId)!;assert.ok(context);let closed=false;
 const binding=createImagesSyncBindings(context)[0]!;
 const check=()=>{if(closed)throw new Error('同步接口已关闭');context.sync?.assertActive();};
 return {binding,close(){closed=true;},replica(scope:AggregateReplicaContext){
  check();if(!context.sync||scope.spaceId!==context.sync.spaceId)throw new Error('同步空间不匹配');
  return new Proxy(binding.replica,{get(target,key){const method=Reflect.get(target,key);return typeof method==='function'? (...args:unknown[])=>{
   check();return withPluginSyncAuthority({home:runtime.home,context:scope,assertCollection(identity){check();const declared=imagesManifest.sync!.collections[0]!;assert.equal(identity.plugin_id,imagesManifest.plugin_id);assert.equal(identity.schema_version,declared.schema_version);assert.equal(identity.collection_id,declared.id);}},()=>Reflect.apply(method,target,args));
  }:method;}});
 },async prepare(key:string,value:unknown){check();await binding.content?.prepare?.(key,value);check();}};
}
import {createImagesSyncBindings} from '@molis-ai/molis-work-plugin-images';
import {withPluginSyncAuthority,openRuntimeProjectCopyDirectory} from '@molis-ai/molis-work-app-local-host';
import type {AggregateReplicaContext,AggregateCopyContext} from '@molis-ai/molis-work-contracts/platform/plugin-registration';
/** The copy owner of one partition's Images instance: the source project's partition, or the copy's own. */
export async function imageCopyFixture(runtime:Awaited<ReturnType<typeof imageRuntimeFixture>>,context:AggregateCopyContext,projectId:string){
 const {instance}=await runtime.start(projectId);
 const directory=await openRuntimeProjectCopyDirectory({home:runtime.home,platform:instance.platform,direction:context.direction,context});
 const item=directory.owners.find(row=>row.ownerId===imagesManifest.plugin_id);assert.ok(item);return {owner:item.owner,close:()=>directory.close()};
}
