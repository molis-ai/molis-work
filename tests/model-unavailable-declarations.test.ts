import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionAudience, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { IMAGES_ACTION_PERMISSIONS, imagesActions } from "@molis-ai/molis-work-plugin-images";
import { MolisWorkLocalHost, molisWorkHostProjectReference, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { partitionLibraryFile } from "./fixtures/plugin-home-stores.js";

// AI entry inventory 7.4: an action that cannot work for want of a model or a connection says so in the directory, so the
// Assistant sees the reason before it calls. The directory says so to the Assistant, MCP clients, workflows and plugins; the
// person's own page keeps its own handling (a message is still saved, a stopped run is still recorded, the chosen connection
// still gets its own reason), so what it does without a model does not change.
const AGENT: ActionAudience = "agent", USER: ActionAudience = "user";
async function fixture(t: test.TestContext) {
  const previousBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file"; resetSecretStoreCache();
  const home = await mkdtemp(join(tmpdir(), "model-unavailable-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  t.after(async () => {
    await host.close(); resetSecretStoreCache();
    if (previousBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previousBackend;
    await rm(home, { recursive: true, force: true });
  });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "a.sqlite"), projectId: "a" });
  const caller = (projectId: string | null, audience: ActionAudience): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, audience,
    permissions: [...IMAGES_ACTION_PERMISSIONS] });
  const availability = async (capabilityId: string, audience: ActionAudience) =>
    (await host.inspectActions(caller("a", audience), ref)).find(view => view.capability_id === capabilityId)!.availability;
  const project = (audience: ActionAudience) => bindActionClient(host.actionClient(ref), () => caller("a", audience));
  // The image services follow the person (batch 108): the person's page sets them up from any partition Images is in, here a.
  const personal = bindActionClient(host.actionClient(ref), () => caller("a", USER));
  return { home, availability, project, personal };
}

test("generating an image is unavailable to the Assistant until an image service can be used, and follows its connection", async t => {
  const f = await fixture(t);
  const none = await f.availability(imagesActions.start.capability_id, AGENT);
  assert.ok(!none.available && none.code === "actions.connection_required" && /生图服务/.test(none.reason), JSON.stringify(none));
  await assert.rejects(f.project(AGENT).invoke(imagesActions.start, { request_id: "r1", connection_id: "missing", prompt: "x" }), { code: "actions.connection_required" });
  assert.deepEqual(await f.availability(imagesActions.start.capability_id, USER), { available: true }, "the person's page still gets the chosen service's own reason");

  // A remote service with no key chosen cannot be used, a local one needs none.
  const remote = (await f.personal.invoke(imagesActions.saveConnection, { name: "Remote", api_format: "openai-images", base_url: "https://images.example.com/v1", model: "m" })).connection;
  assert.equal((await f.availability(imagesActions.start.capability_id, AGENT)).available, false, "a remote service with no key is not usable");
  const local = (await f.personal.invoke(imagesActions.saveConnection, { name: "Local", api_format: "openai-images", base_url: "http://127.0.0.1:9/v1", model: "m" })).connection;
  assert.deepEqual(await f.availability(imagesActions.start.capability_id, AGENT), { available: true });
  await f.personal.invoke(imagesActions.deleteConnection, { id: local.id });
  assert.equal((await f.availability(imagesActions.start.capability_id, AGENT)).available, false);

  // A connected account makes the remote service usable; disconnecting it takes that away again.
  const account = withConnectorConnections(f.home, store => store.createToken({ serviceId: "image-api", displayName: "图片账号", token: "declared-image-key" }));
  await f.personal.invoke(imagesActions.saveConnection, { id: remote.id, name: "Remote", api_format: "openai-images", base_url: "https://images.example.com/v1", model: "m", auth_connection_id: account.connection_id });
  assert.deepEqual(await f.availability(imagesActions.start.capability_id, AGENT), { available: true });
  withConnectorConnections(f.home, store => store.disconnect(account.connection_id));
  assert.equal((await f.availability(imagesActions.start.capability_id, AGENT)).available, false);
});

test("W5-01-IMGPORT-01 Images startup opens its owned store; directory availability does not write business data", async t => {
  const f = await fixture(t);
  await f.availability(imagesActions.start.capability_id, AGENT);
  const path = partitionLibraryFile(f.home, "a", "images");
  assert.ok(existsSync(path), "the partition's instance opens and recovers Images before publishing its actions");
  const contents = () => [path, path + "-wal"].map(file => existsSync(file) ? readFileSync(file) : null);
  const before = contents();
  for (const audience of ["agent", "mcp", "workflow", "plugin", "user"] as const) await f.availability(imagesActions.start.capability_id, audience);
  assert.deepEqual(contents(), before, "directory reads never change Images' store or write-ahead log");
});
