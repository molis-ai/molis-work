import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { TestContext } from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext, PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HomePluginHost, MolisWorkLocalHost, projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import { createImagesPlugin, imagesManifest, IMAGES_ACTION_PERMISSIONS,
  imagesActions, type ImageJob } from "@molis-ai/molis-work-plugin-images";

export const IMAGE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
export const imageReply = (response: ServerResponse) => { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ data: [{ b64_json: IMAGE_PNG }] })); };
export async function imageRuntimeFixture(t: TestContext, options: {
  respond?: (input: Record<string, unknown>, response: ServerResponse, request: IncomingMessage) => void | Promise<void>;
  context?: (context: PluginStartContext) => PluginStartContext;
  definition?: (definition: PluginDefinition) => PluginDefinition;
} = {}) {
  const home = await mkdtemp(join(tmpdir(), "images-runtime-")), contexts: PluginStartContext[] = [], calls: Record<string, unknown>[] = [];
  // The resident Host owns the actual Prologue inference; this isolated supervisor supplies the Images entry under test.
  const inferenceOwner = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const registry = new ActionService();
  const supervisor = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry, client: registry, entries: [{ scope: "home",
    manifest: imagesManifest, create: () => {
      const definition = createImagesPlugin(), original = definition.start;
      definition.start = context => { contexts.push(context); return original(options.context?.(context) ?? context); };
      return options.definition?.(definition) ?? definition;
    },
    project_data: { owner_id: "images" }, package_name: "@molis-ai/molis-work-plugin-images", factory_export: "createImagesPlugin" }] });
  const provider = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const input = JSON.parse(raw) as Record<string, unknown>; calls.push(input);
    await (options.respond ? options.respond(input, response, request) : imageReply(response));
  });
  t.after(async () => {
    await supervisor.close(); await inferenceOwner.close(); provider.closeAllConnections();
    await new Promise<void>(resolve => provider.close(() => resolve())); await rm(home, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  const address = provider.address(); assert.ok(address && typeof address === "object");
  const platform = await supervisor.ready();
  assert.equal(supervisor.installation(imagesManifest.plugin_id)?.state, "running");
  const caller = (projectId: string | null = "project-a", extra: Partial<ActionCallContext> = {}): ActionCallContext => ({
    actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, audience: "user", permissions: IMAGES_ACTION_PERMISSIONS, ...extra,
  });
  const client = (projectId: string | null = "project-a", extra: Partial<ActionCallContext> = {}) => bindActionClient(registry, () => caller(projectId, extra));
  const input = { name: "本机受控生图", api_format: "openai-images" as const, base_url: `http://127.0.0.1:${address.port}/v1`, model: "fixture-image" };
  return { home, contexts, calls, provider, supervisor, platform, registry, caller, client, input,
    clearProject: (id: string) => projectDeletedHooksFor(home).clear("images", id),
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
