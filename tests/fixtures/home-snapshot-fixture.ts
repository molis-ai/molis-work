import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkLocalHost, LocalProjectDatabase, molisWorkHostProjectReference, sealRuntimeConfigBackup, ALCHEMIST_SEARCH_BASELINE } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { ALCHEMIST_STUDIO_BASELINE } from "@molis-ai/molis-work-plugin-alchemist";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { applySqliteBaseline, createEvidenceContentStore, createLazyFileSecretStore, createSearchOpaqueBlobStore, LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import type { AgentMemoryCaller } from "@molis-ai/molis-work-contracts/services/agent-host";
import { currentMemoryOptions } from "./current-memory.js";
import { managementGoals } from "../goal-management-caller.js";
import { connectedPrivateCli } from "./connector-private-state.js";
import { pinnedArtifact } from "./artifacts.js";
import { seedSnapshotLibraries } from "./home-snapshot-facts.js";

const at = "2026-10-24T00:00:00.000Z";
const app = { appId: "io.molis.snapshot-proof", appVersion: "1.0.0" };
type SnapshotMemoryActor = "snapshot-person" | "snapshot-builder";
export function snapshotMemoryCaller(actor_id: SnapshotMemoryActor): AgentMemoryCaller {
  return { actor_id, project_id: null, consumer: "ui", current_scene: "coding", purpose: "management", person: true };
}
export function snapshotSdk(storageRoot: string, actor: SnapshotMemoryActor) {
  return createPrologueNodeAdapter({ storageRoot, app, modelConfiguration: async () => null,
    memory: currentMemoryOptions({ appId: app.appId, scopesFor: () => [{ scope: "user", owner: actor }],
      allowed: caller => caller.actor_id === actor && caller.project_id === null && caller.person === true }) });
}

/** A real prepared/connected CLI, Catalog/Goals/Artifacts and SDK memory, plus persisted facts in each registered owner. */
export async function populatedSnapshotHome(t: TestContext) {
  const cli = await connectedPrivateCli(t), home = cli.home;
  // The installer test package, archive and probe trace are test instrumentation, not Home-owned data.
  for (const name of ["package", "cli.tgz", "cli-version-probe-events"]) await rm(join(home, name), { recursive: true, force: true });
  const directory = await realpath(await mkdtemp(join(tmpdir(), "molis-snapshot-result-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const workspace = join(directory, "workspace"); await mkdir(workspace);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const projects = [];
  try {
    for (const name of ["Retained project A", "Retained project B"]) projects.push(await catalog.createProject({ display_name: name, actor_id: "snapshot-person" }));
  } finally { catalog.close(); }
  const first = projects[0]!, host = createMolisWorkLocalHost({ instanceId: "snapshot-source", homeDirectory: home, completeText: null });
  try {
    await managementGoals(host.actionClient(molisWorkHostProjectReference({ databasePath: first.database_path, projectId: first.project_id })), first.project_id)
      .invoke(goalsActions.create, { goal_id: "snapshot-goal", title: "Retained goal", outcome: "Keep the actual history", why: "Offline capture", business_logic: "Preserve owner facts", priority: 50, idempotency_key: "snapshot-goal-create" });
  } finally { await host.close(); }
  const project = new LocalProjectDatabase(first.database_path);
  try {
    const artifacts = new ArtifactsModule({ db: project.db, appendEvent: event => project.appendEvent(event), eventCursor: id => project.eventCursor(id) });
    for (const version of [1, 2]) artifacts.commands.registerVersion({ ...pinnedArtifact("Kept report " + version, { kind: "item", id: "snapshot-report" }, String(version)),
      project_id: first.project_id, artifact_id: "snapshot-report", version, actor_id: "snapshot-person", artifact_type_id: "example.report", schema_version: 1,
      producer: { plugin_id: "example.writer", plugin_version: "1.0.0", binding_signature: "snapshot-fixture" }, content: { kind: "inline", payload: { text: "Kept report " + version } } });
  } finally { project.close(); }
  const facts = seedSnapshotLibraries(home, first.project_id), binary = new Map<string, Buffer>();
  async function file(path: string, contents: string | Buffer, mode = 0o640, retained = true) {
    await mkdir(dirname(join(home, path)), { recursive: true, mode: 0o700 });
    const bytes = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
    await writeFile(join(home, path), bytes); await chmod(join(home, path), mode);
    if (retained) binary.set(path, bytes);
  }
  const privateText = "test-only-snapshot-value", runtimeText = '[mcp_servers.fixture]\napi_key = "' + privateText + '"\n';
  await file("runtime/connectors/installs/" + cli.installationId + "/.home/client-credential.json", JSON.stringify({ bearer: privateText }), 0o640, false);
  const secrets = createLazyFileSecretStore(home); secrets.put("snapshot:api", privateText);
  const descriptor = await sealRuntimeConfigBackup(home, "codex", "snapshot-config", runtimeText, 0o640);
  await file("runtime-config-backups/codex/snapshot-config.bak", JSON.stringify(descriptor) + "\n");
  const bookmark = JSON.stringify({ documents: { path: workspace, bookmark: "fixture opaque directory authorization" } }) + "\n";
  await file("directory-access/bookmarks.json", bookmark, 0o640, false);
  for (const path of ["config/onboarding.json", "config/project-arrival.json", "config/mcp-tools.json", "config/external-mcp-tools.json", "config/connector-mcp-tools.json",
    "git-operation-details.json", "runtime-integrations/fixture.json", "runtime-integration-attempts/fixture.json", "browser/sites.json"]) {
    // These are retained byte examples; no runtime configuration reader or authorization is fabricated by snapshotting them.
    await file(path, JSON.stringify({ schema_version: 1, note: "Retained " + path }) + "\n");
  }
  for (const path of ["images/assets/retained.bin", "shelf/files/retained.bin", "artifacts/files/retained.bin", "plugin-files/install/retained.bin",
    "plugin-builder/project/design/retained.bin", "plugin-originals/files/retained.bin"]) await file(path, Buffer.from([0, 255, 17, 0, 3, 128, 10]));
  for (const path of ["logs/fixture.log", "cache/derived.bin", "search/rebuildable.bin", "images/runners/fixture.db", "lingguang/models/rebuildable.bin",
    "browser/profile/private-state", "browser/downloads/private-state", "browser/uploads/private-state", "browser/fixture.pid"]) await file(path, "Excluded transient content", 0o600, false);
  const content = createEvidenceContentStore({ secretStore: secrets, rootDirectory: join(home, "feed", "evidence") });
  const evidence = content.write("Retained evidence body").contentRef;
  for (const [position, item] of projects.entries()) {
    const directory = "alchemist/projects/" + encodeURIComponent(item.project_id).replaceAll(".", "%2E");
    await mkdir(join(home, directory), { recursive: true, mode: 0o700 });
    const studio = new DatabaseSync(join(home, directory, "studio.sqlite"));
    try {
      studio.exec(ALCHEMIST_STUDIO_BASELINE.schema); studio.exec("PRAGMA user_version = " + ALCHEMIST_STUDIO_BASELINE.version);
      studio.prepare("INSERT INTO workspaces (id,name,created_at) VALUES (?,?,?)").run(item.project_id, "Studio " + position, at);
      studio.prepare("INSERT INTO directions (id,workspace_id,title,description,source_kind,source_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
        .run("direction", item.project_id, "Retained direction " + position, "Kept research context", "user_input", "{}", "active", at, at);
    } finally { studio.close(); }
    const search = new LocalSqliteStorage(join(home, directory, "search.sqlite"));
    try {
      applySqliteBaseline(search.db, search.path, ALCHEMIST_SEARCH_BASELINE);
      await createSearchOpaqueBlobStore(search.db).createIfAbsent({ namespace: "snapshot", key: "operation", opaque: "Kept opaque operation " + position });
    } finally { search.close(); }
    const searchContent = createEvidenceContentStore({ secretStore: secrets, rootDirectory: join(home, directory, "search-content") });
    searchContent.write("Retained studio evidence " + position);
  }
  const sdkRoot = join(home, "agent-runtime"), creating = snapshotSdk(sdkRoot, "snapshot-person");
  let memoryId: string;
  try {
    const adapter = await creating;
    const memory = await adapter.memory!.withCaller(snapshotMemoryCaller("snapshot-person")).write({ scope: "user", owner: "snapshot-person", text: "Retained SDK memory", origin: "test" });
    memoryId = memory.memory_id;
    await adapter.createSession({ project_id: first.project_id, plugin_id: "io.molis.work.coding", install_id: "snapshot-install", actor_id: "snapshot-person", title: "Retained SDK session", directory: { canonical_path: workspace, realpath_verified: true } });
  } finally { await creating.close(); }
  const builderRoot = join(home, "plugin-builder", "project", "runs", "build"), builder = snapshotSdk(builderRoot, "snapshot-builder");
  try { await (await builder).memory!.withCaller(snapshotMemoryCaller("snapshot-builder")).write({ scope: "user", owner: "snapshot-builder", text: "Retained builder memory", origin: "test" }); }
  finally { await builder.close(); }
  const sessionKey = randomBytes(32), nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", sessionKey, nonce);
  const encrypted = Buffer.concat([cipher.update("Retained retired Session body"), cipher.final()]);
  await file("sessions/content/content.key", sessionKey, 0o600, false);
  await file("sessions/content/blobs/fixture.blob", JSON.stringify({ v: 1, iv: nonce.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ct: encrypted.toString("base64") }));
  const retired = new DatabaseSync(join(home, "sessions", "sessions.db"));
  try {
    retired.exec("CREATE TABLE session_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE sessions (session_id TEXT PRIMARY KEY, runtime_id TEXT NOT NULL, title TEXT, metadata_json TEXT NOT NULL);");
    retired.prepare("INSERT INTO session_meta VALUES (?,?)").run("owner", "molis-work-session-registry-v1");
    retired.prepare("INSERT INTO session_meta VALUES (?,?)").run("schema_version", "7");
    retired.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run("retired-before", "codex", "Retained retired Session", "{}");
  } finally { retired.close(); }
  const sdkKey = await readFile(join(sdkRoot, "storage.key")), builderKey = await readFile(join(builderRoot, "storage.key"));
  assert.equal(sdkKey.length, 32); assert.equal(builderKey.length, 32);
  return { ...cli, directory, workspace, projects, facts, binary, evidence, memoryId: memoryId!, privateText, runtimeText, bookmark, sdkRoot, builderRoot,
    forbidden: [Buffer.from(privateText), Buffer.from("fixture opaque directory authorization"), Buffer.from("Retained SDK memory"), Buffer.from("Retained builder memory"),
      cli.key, sessionKey, sdkKey, builderKey], snapshot: join(directory, "snapshot") };
}
