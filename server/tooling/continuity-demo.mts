/** Isolated QA only. No personal Home, model, Connector or public network. */
import { mkdir, writeFile, access, unlink, realpath } from "node:fs/promises";
import { resolve, join, dirname, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { openServerDatabase, Identity, ServerEvents, ContinuityService, startServer, memberClientId, createImDomain, type ActionFactory } from "@molis-ai/molis-work-server";
import { renderImPage, IM_STYLES, IM_CLIENT_SCRIPT } from "@molis-ai/molis-work-im-ui";
import { documentGenerationRoleOf, workItemPromotionRoleOf, workProgressContinuityRoleOf, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";

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
const { MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard, PLATFORM_PLUGIN_REGISTRATIONS, hostContinuityActions } = await import("@molis-ai/molis-work-app-local-host");

const host = new MolisWorkLocalHost({ homeDirectory: directory, completeText: null });
const databasePath = join(directory, "project.sqlite"), projectId = "continuity-qa", goalId = "mobile-handoff";
// The project's library starts with the platform's root row; Goals makes its board when the Host first opens the project, and the goal below is its own action's.
seedDemoBoard(databasePath, projectId);
const ref = molisWorkHostProjectReference({ projectId, databasePath });
const projectClient = host.actionClient(ref);
const ownerCaller = await host.localPersonContext(ref);
const directoryActions = (await projectClient.discover(ownerCaller)).filter(view => view.availability.available);
function exactlyOne<T>(items: readonly T[], role: string): T {
  if (items.length !== 1) throw Error(`The demo requires one available ${role} (found ${items.length})`);
  return items[0]!;
}
const progress = exactlyOne(directoryActions.filter(view => workProgressContinuityRoleOf(view.action) === "progress.record"), "progress recorder");
const creator = exactlyOne(directoryActions.filter(view => view.provider.provider_id === progress.provider.provider_id && workItemPromotionRoleOf(view.action) === "create"), "work-item creator");
const actionRef = (view: ActionView) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
const permitted = hostContinuityActions();
const memberPermissions = [...new Set(directoryActions.filter(view => permitted.some(action => action.capability_id === view.capability_id && action.version === view.version && action.provider_id === view.provider.provider_id)).flatMap(view => view.action.permissions))];
await projectClient.invoke({ ...ownerCaller, actor_id: "desktop", permissions: creator.action.permissions }, actionRef(creator),
  { goal_id: goalId, title: "让工作在手机上继续", outcome: "查看桌面成果，记录下一步，再回桌面接续。", idempotency_key: "goal" });
const guide = { artifact_id: "handoff-guide", version: 2 };
await host.withProject(ref, async ({ artifacts }) => {
  // Reopening the QA Home keeps the version already shared with its devices.
  if (artifacts.query.getArtifactVersion(projectId, guide)) return;
  const documentOwners = new Set(directoryActions.filter(view => documentGenerationRoleOf(view.action) === "document.get").map(view => view.provider.plugin_id));
  const candidates = PLATFORM_PLUGIN_REGISTRATIONS.filter(entry => documentOwners.has(entry.manifest.plugin_id)).flatMap(({ manifest }) =>
    manifest.artifacts.produces.flatMap(declaration => {
      const pin = declaration.pin;
      const action = pin && directoryActions.find(view => view.provider.plugin_id === manifest.plugin_id && view.capability_id === pin.capability_id && view.version === pin.version);
      const subjectKind = action?.action.subject_kinds[0];
      return subjectKind ? [{ producer: manifest, declaration, subjectKind }] : [];
    }));
  const { producer, declaration, subjectKind } = exactlyOne(candidates, "pinnable document type");
  const title = "跨设备接续 · 操作说明";
  artifacts.commands.registerVersion({
    ...guide, project_id: projectId, actor_id: "desktop",
    artifact_type_id: declaration.artifact_type_id, schema_version: declaration.schema_version,
    origin: { kind: "pinned", subject: { kind: subjectKind, id: guide.artifact_id }, revision: "2" },
    title, media_type: "text/markdown",
    producer: { plugin_id: producer.plugin_id, plugin_version: producer.version, binding_signature: producer.publisher.signature },
    content: { kind: "inline", payload: "跨设备接续操作说明\n\n桌面整理固定成果 → 手机核对并留下下一步 → 桌面继续。\n\n这是隔离项目中的真实保存，不读取私人账号。" },
    metadata: { title }, scope: "team_project", team_share_authorized: true,
  });
});
const factory: ActionFactory = ({ memberId, projectId, validate, signal }) => {
  const client = host.actionClient(ref);
  return {
    caller: { actor_id: memberClientId(memberId), project_id: projectId, audience: "user", actor_kind: "user", permissions: memberPermissions, allowed_actions: permitted, validate_authority: validate, signal },
    client: {
      discover: caller => client.discover(caller),
      invoke: async (caller, action, input) => {
        const result = await client.invoke(caller, action, input);
        if (action.capability_id === progress.capability_id && action.version === progress.version && action.provider_id === progress.provider.provider_id) {
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
continuity.registerProject({ id: projectId, title: "设备接续 · 隔离实操", goal_ids: [goalId], artifacts: [guide] }, owner.id);
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
