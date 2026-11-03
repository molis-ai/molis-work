import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { TestContext } from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkLocalHost, type MolisWorkLocalHostOptions, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { startProjectPlugins } from "./plugin-callers.js";
import { createMolisWorkWebServer } from "../../apps/desktop/launchers/web/server.js";

export const MANAGEMENT_ROUTE = "/api/internal/management-action";
export const FORGED_CALL = "11111111-2222-4333-8444-555555555555";
export async function residentManagement(t: TestContext, options: MolisWorkLocalHostOptions = {}) {
  const home = await mkdtemp(join(tmpdir(), "resident-management-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "常驻管理", actor_id: LOCAL_PERSON_ACTOR_ID });
  const reference = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const opened: string[] = [];
  const host = createMolisWorkLocalHost({ ...options, homeDirectory: home, onRuntimeOpen: ref => { opened.push(ref.storage_key); options.onRuntimeOpen?.(ref); } });
  await host.withProject(reference, () => undefined);
  // The project is the way the app has it once opened: Goals has started and made the project's board, so "no business write" below means
  // nothing after that.
  await startProjectPlugins(host, reference);
  for (let attempt = 0; attempt < 200 && !(await host.withProject(reference, runtime => runtime.store.readEventsDescending(project.project_id)
    .some(event => event.type === `${GOALS_PLUGIN_ID}:board.created`))); attempt++) await delay(25);
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const token = (await readFile(join(home, "config", "web-control-token"), "utf8")).trim();
  let stopped = false;
  const stop = async () => {
    if (stopped) return; stopped = true;
    server.closeAllConnections();
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    await host.close();
  };
  t.after(async () => { await stop(); catalog.close(); await rm(home, { recursive: true, force: true }); });
  const headers = (overrides: Record<string, string | undefined> = {}) => Object.fromEntries(Object.entries({
    origin, "content-type": "application/json", "x-molis-work-control-token": token,
    "x-molis-work-idempotency-key": randomUUID(), ...overrides }).filter((pair): pair is [string, string] => pair[1] !== undefined));
  const body = (input: unknown = { idempotency_key: randomUUID() }) => ({
    home_id: createHash("sha256").update(resolve(home)).digest("hex"), database_path: project.database_path,
    project_id: project.project_id, call_id: randomUUID(), capability: { capability_id: "goals.board.initialize", version: 2 }, input });
  const post = async (input: unknown, overrides: Record<string, string | undefined> = {}) => {
    const response = await fetch(origin + MANAGEMENT_ROUTE, { method: "POST", headers: headers(overrides), body: JSON.stringify(input) });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  const facts = () => host.withProject(reference, runtime => runtime.store.readEventsDescending(project.project_id));
  return { home, catalog, project, reference, host, server, origin, token, opened, headers, body, post, facts, stop };
}

