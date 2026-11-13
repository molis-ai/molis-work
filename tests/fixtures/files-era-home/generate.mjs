// A Files-era Home, made by the build that still has Files (merge-base 54a12642c), for the Files retirement's readback gate
// (specs/batch-06-shared-tools/current-version-adoption.md, M3; read back by tests/files-era-adoption.test.ts). It runs only on that
// build: copy it to `scripts/files-era-home.mjs` of a checkout at 54a12642c, `pnpm build` there, then
//   node scripts/files-era-home.mjs <out>
// and put <out> here. Ids and times differ from run to run; the test reads them from manifest.json.
// It drives the web core and its own Host the way the person does (projects, folders, Files reading and fixing snapshots, a consent taken back),
// writes the one thing no route of that build writes without a model (a Coding round's materials in the earlier `{kind,id,title}`
// shape), then dumps only the stores the adoption reads. No route of that build writes a person's own binding of a Files output, so
// the Home holds the default bindings only.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createTemporaryHome } from "./golden/layout.mjs";
import { enterHome, refuseNetwork, root } from "./golden/session.mjs";

const storage = await import("@molis-ai/molis-work-storage");
const { createDesktopWebCore } = await import("@molis-ai/molis-work-app-desktop");
const TOKEN = "files-era-control-token-0123456789abcdef";
/** The web core with its own Host, as the Files product test of this build starts it. */
async function openHome(home) {
  const server = createDesktopWebCore({ ptyClientFilePath: () => path.join(root, "dist/web/pty-client.js") })({ homeDirectory: home, controlToken: TOKEN });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(() => resolve()); }) };
}
const { LocalProjectDatabase } = await import("@molis-ai/molis-work-app-local-host");

const out = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("usage: node scripts/files-era-home.mjs <out>");
refuseNetwork();
const temp = createTemporaryHome("files-era-");
const facts = { projects: [] };
try {
  enterHome(temp.home);
  let session = await openHome(temp.home);
  const http = async (route, body, method = body === undefined ? "GET" : "POST") => {
    const token = TOKEN, origin = session.origin;
    const response = await fetch(origin + route, { method, headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": crypto.randomUUID() },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${route} ${response.status} ${text.slice(0, 400)}`);
    return text ? JSON.parse(text) : null;
  };
  const files = (projectId, suffix) => `/projects/${projectId}/api/plugins/io.molis.work.files${suffix}`;
  const directories = projectId => `/projects/${encodeURIComponent(projectId)}/api/project-settings/directories`;
  const change = async (projectId, name, input) => {
    const { revision } = await http(directories(projectId));
    return http(directories(projectId), { change: name, input: { ...input, expected_revision: revision } });
  };

  for (const [index, display_name] of ["文件时代甲", "文件时代乙"].entries()) {
    const created = await http("/api/settings/projects", { display_name, user_confirmed: true });
    const projectId = created.project.project_id;
    await http(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "coding" });
    const folder = path.join(temp.scratch, `folder-${index}`);
    mkdirSync(folder);
    writeFileSync(path.join(folder, "note.txt"), "中文🙂\nfirst\n");
    const set = await change(projectId, "set_output", { workspace_path: folder });
    const workspace_id = set.directories.find(item => item.roles.includes("output")).workspace_id;
    const open = async () => (await http(files(projectId, "/open"), { workspace_id, path: ["note.txt"] })).result;
    const capture = (port, fingerprint, range = {}) => http(files(projectId, "/capture"), { workspace_id, path: ["note.txt"], port, fingerprint, ...range });
    await http(files(projectId, "/state"));
    await http(files(projectId, `/directory?path=[]&workspace_id=${workspace_id}`));
    const first = await open();
    await capture("before", first.fingerprint);
    if (index === 0) {
      await capture("selection", first.fingerprint, { start: 2, end: 4 });
      writeFileSync(path.join(folder, "note.txt"), "中文🙂\nsecond\n");
      const second = await open();
      await capture("after", second.fingerprint);
      // The same port fixed again: the before snapshot gets its second version.
      await capture("before", second.fingerprint);
    }
    facts.projects.push({ project_id: projectId, display_name });
  }

  // Files kept no agreements of its own: Diff and Text Stats did, each naming a Files port as its default source. The person took
  // one of them back before the retirement; the rest stay current.
  const consents = [];
  for (const plugin_id of ["io.molis.work.files", "io.molis.work.diff", "io.molis.work.text-stats"]) consents.push(...(await http("/api/settings/plugin-consents/list", { plugin_id })).consents);
  const taken = consents.find(row => row.plugin_id === "io.molis.work.diff" && row.subject === "before<-io.molis.work.files:before@official-files-binding" && !row.revoked_at);
  if (!taken) throw new Error("Diff has no current agreement naming the Files before port");
  await http("/api/settings/plugin-consents/revoke", { consent_id: taken.consent_id });
  facts.revoked = taken.consent_id;
  await session.close();
  session = null;

  // What no route of this build writes without a model: a Coding round's materials, and a queued round, in the earlier shape.
  const catalog = new DatabaseSync(path.join(temp.home, "projects/catalog.db"), { readOnly: true });
  const libraries = catalog.prepare("SELECT * FROM projects").all();
  catalog.close();
  for (const project of facts.projects) {
    const row = libraries.find(item => item.project_id === project.project_id);
    if (!row) throw new Error(`${project.project_id} is not in the catalog`);
    project.database = `projects/${project.project_id}/molis-work.db`;
  }
  {
    const [first] = facts.projects, file = path.join(temp.home, first.database);
    const source = new LocalProjectDatabase(file);
    try {
      const snapshot = { artifact_id: "io.molis.work.files:before" };
      const coding = source.db.prepare("SELECT install_id FROM plugin_runtime_installs WHERE json_extract(record_json,'$.plugin_id')='io.molis.work.coding'").get();
      const put = source.db.prepare("INSERT INTO plugin_private_values(install_id,item_key,item_value) VALUES (?,?,?)");
      const pieces = [{ kind: "artifact", id: JSON.stringify([snapshot.artifact_id, 1]), title: "note.txt 修改前" }, { kind: "goal", id: "goal-files-era", title: "一个目标" }];
      put.run(coding.install_id, "materials:files-era-session", JSON.stringify(pieces));
      put.run(coding.install_id, "queued:files-era-session", JSON.stringify({ work_id: "files-era-work", body: { prompt: "继续", materials: pieces.slice(0, 1) } }));
    } finally { source.close(); }
  }

  // Only what the adoption reads: the space, the catalog, each library, the Home plugin store.
  mkdirSync(path.join(out, "stores"), { recursive: true });
  const manifest = { generated_by: "scripts/files-era-home.mjs at 54a12642c", projects: facts.projects, revoked_consent: facts.revoked, stores: [], files: [], left_out: [] };
  // A Host starts on it too (to read the adopted lines through the materials service), so the memory library comes along.
  const relatives = ["projects/catalog.db", ...facts.projects.map(project => project.database), "plugin-runtime/plugin-runtime.db", "memory/memory.db"];
  for (const relative of relatives) {
    const db = new DatabaseSync(path.join(temp.home, relative), { readOnly: true });
    let dump;
    try { dump = storage.dumpSqliteText(db, relative); } finally { db.close(); }
    if (dump.sql.includes(temp.home)) throw new Error(`${relative} records the generating Home's path`);
    // The code each install ran (megabytes per library) is not read by the adoption; its rows are left out and counted.
    const lines = dump.sql.split("\n"), kept = lines.filter(line => !line.startsWith('INSERT INTO "plugin_runtime_release_artifacts"'));
    if (kept.length !== lines.length) manifest.left_out.push({ path: relative, table: "plugin_runtime_release_artifacts", rows: lines.length - kept.length });
    dump.sql = kept.join("\n");
    // The project folders sat beside the Home; a fixed name keeps the dump the same from run to run.
    dump.sql = dump.sql.replaceAll(temp.scratch, "/files-era");
    const payload = `stores/${relative.replaceAll("/", "__")}.sql`;
    writeFileSync(path.join(out, payload), dump.sql);
    manifest.stores.push({ path: relative, payload, sha256: createHash("sha256").update(dump.sql).digest("hex") });
  }
  copyFileSync(path.join(temp.home, "storage-space.json"), path.join(out, "storage-space.json"));
  manifest.files.push({ path: "storage-space.json", payload: "storage-space.json", sha256: createHash("sha256").update(readFileSync(path.join(out, "storage-space.json"))).digest("hex") });
  writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
} finally { if (process.env.FILES_ERA_KEEP) process.stderr.write(`kept ${temp.home}\n`); else temp.remove(); }
