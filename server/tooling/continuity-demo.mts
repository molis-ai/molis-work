/** Isolated QA only. No personal Home, model, Connector or public network. */
import { mkdir, writeFile, access, unlink, realpath } from "node:fs/promises";
import { resolve, join, dirname, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { openServerDatabase, Identity, ServerEvents, ContinuityService, startServer, memberClientId, CONTINUITY_ACTIONS, createImDomain, type ActionFactory } from "@molis-ai/molis-work-server";
import { renderImPage, IM_STYLES, IM_CLIENT_SCRIPT } from "@molis-ai/molis-work-im-ui";
import { PAGES_ARTIFACT_SCHEMA_VERSION, PAGES_ARTIFACT_TYPE_ID, PAGES_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/pages";

const { values, positionals } = parseArgs({ options: { port: { type: "string", default: "4189" } }, allowPositionals: true });
if (positionals.length !== 1) throw Error("Pass one explicit isolated QA directory and optionally --port 0");
const directory = resolve(positionals[0]!);
const port = Number(values.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error("Invalid QA port");

// Check the existing ancestor before making or writing anything. A symlink cannot turn /tmp into a real Home.
let ancestor = directory, actual: string;
while (true) {
  try { actual = await realpath(ancestor); break; }
  catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT") || ancestor === dirname(ancestor)) throw error;
    ancestor = dirname(ancestor);
  }
}
const scratchRoots = await Promise.all([tmpdir(), "/tmp"].map(path => realpath(path)));
if (!scratchRoots.some(root => {
  const path = relative(root, actual);
  return !isAbsolute(path) && path !== ".." && !path.startsWith("../") && (path !== "" || ancestor !== directory);
})) throw Error("QA requires a dedicated directory inside the system temporary directory");
await mkdir(directory, { recursive: true, mode: 0o700 });

// This QA process owns its scratch Home and file-backed keys; it must not ask the user's Keychain or use an ambient key.
process.env.MOLIS_WORK_HOME = directory;
process.env.MOLIS_WORK_SECRET_BACKEND = "file";
delete process.env.MOLIS_WORK_ENCRYPTION_KEY;
const { MolisWorkLocalHost, molisWorkHostProjectReference, LocalProjectDatabase, GoalProjectApplication, openProjectVersionStores } = await import("@molis-ai/molis-work-app-local-host");

const host = new MolisWorkLocalHost({ homeDirectory: directory, completeText: null });
const databasePath = join(directory, "project.sqlite"), projectId = "continuity-qa", goalId = "mobile-handoff";
const db = new LocalProjectDatabase(databasePath), app = new GoalProjectApplication(db), library = openProjectVersionStores(db);
try {
  app.initializeBoard({ project_id: projectId, actor_id: "desktop", idempotency_key: "init" });
  app.goalEvents.createIntent({ project_id: projectId, goal_id: goalId, title: "让工作在手机上继续", outcome: "查看桌面成果，记录下一步，再回桌面接续。", actor_id: "desktop", idempotency_key: "goal" });
  library.artifacts.commands.registerVersion({
    project_id: projectId, artifact_id: "handoff-guide", version: 2, actor_id: "desktop", artifact_type_id: PAGES_ARTIFACT_TYPE_ID, schema_version: PAGES_ARTIFACT_SCHEMA_VERSION,
    origin: { kind: "pinned", subject: { kind: "document", id: "handoff-guide" }, revision: "2" }, title: "跨设备接续 · 操作说明", media_type: "text/markdown",
    // A saved version needs a producer the Host knows (A3): the QA project's document is the one Pages, which ships with the Host, writes.
    producer: { plugin_id: PAGES_PLUGIN_ID, plugin_version: "1.0.0", binding_signature: "qa-writer" },
    content: { kind: "inline", payload: "跨设备接续操作说明\n\n桌面整理固定成果 → 手机核对并留下下一步 → 桌面继续。\n\n这是隔离项目中的真实保存，不读取私人账号。" },
    metadata: { title: "跨设备接续 · 操作说明" }, scope: "team_project", team_share_authorized: true,
  });
} finally { db.close(); }
const ref = molisWorkHostProjectReference({ projectId, databasePath });
const factory: ActionFactory = ({ memberId, projectId, validate, signal }) => {
  const client = host.actionClient(ref);
  return {
    caller: { actor_id: memberClientId(memberId), project_id: projectId, audience: "user", actor_kind: "user", permissions: ["goals:read", "goals:write", "artifacts:read"], allowed_actions: CONTINUITY_ACTIONS, validate_authority: validate, signal },
    client: {
      discover: caller => client.discover(caller),
      invoke: async (caller, action, input) => {
        const result = await client.invoke(caller, action, input);
        if (action.capability_id === "goals.progress.record") {
          try { await access(join(directory, "lose-next-response")); }
          catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") return result;
            throw error;
          }
          await unlink(join(directory, "lose-next-response"));
          throw Object.assign(new Error("QA response lost after real commit"), { code: "actions.delivery_unknown" });
        }
        return result;
      },
    },
  };
};
const storage = openServerDatabase(join(directory, "server")), identity = new Identity(storage.db), events = new ServerEvents(storage.db);
const continuity = new ContinuityService(storage.db, identity, events, factory);
const owner = continuity.projectOwner(projectId) ?? identity.createMember("一骏 · 隔离实操");
continuity.registerProject({ id: projectId, title: "设备接续 · 隔离实操", goal_ids: [goalId], artifacts: [{ artifact_id: "handoff-guide", version: 2 }] }, owner.id);
await writeFile(join(directory, "connect.json"), JSON.stringify(identity.code("bootstrap", owner.id)), { mode: 0o600 });
let running: Awaited<ReturnType<typeof startServer>> | undefined;
let closing: Promise<void> | undefined;
const close = () => closing ??= (async () => { await running?.close(); storage.close(); await host.close(); })();
try {
  running = await startServer({ identity, continuity, events, im: createImDomain({ db: storage.db, identity, events }), imAssets: { html: renderImPage({ embedded: false }), css: IM_STYLES, script: IM_CLIENT_SCRIPT }, port });
} catch (error) { await close(); throw error; }
console.log(`Molis Work QA: ${running.origin}/continuity\nPairing code in ${join(directory, "connect.json")}`);
const stop = () => { void close().then(() => process.exit(0), error => { process.stderr.write(String(error) + "\n"); process.exit(1); }); };
process.once("SIGINT", stop); process.once("SIGTERM", stop);
