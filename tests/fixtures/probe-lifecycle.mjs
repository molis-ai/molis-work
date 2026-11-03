// W4-01 (specs/repository-anti-corruption/slices/w5-02-registry.md §6): one phase of the probe's lifecycle, run by
// tests/probe-plugin.test.ts inside a copy of the repository where the probe is a built-in. Every import resolves to that copy's
// builds, so the Host here is the one the generator and the build produced from the probe's own package. The phase prints one
// JSON line of what it saw; the test asserts on it.
//
//   node probe-lifecycle.mjs first <home>                 enable, discover, invoke (route and action), undo, search, files, methods
//   node probe-lifecycle.mjs after-upgrade <home> <id>    the upgraded version and the notes it kept; disable, revoke, uninstall
import { randomUUID } from "node:crypto";
import { createDesktopWebHost } from "@molis-ai/molis-work-app-desktop";
import { homeAgentDefinitions, MolisWorkLocalHost, molisWorkHostProjectReference, runningProjectPlatform } from "@molis-ai/molis-work-app-local-host";

const [phase, home, givenProject] = process.argv.slice(2);
const PLUGIN_ID = "io.molis.work.probe", KEY = "probe";
const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
const token = randomUUID();
const server = createDesktopWebHost({ ptyClientFilePath: () => "" })({ homeDirectory: home, localHost: host, controlToken: token });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const request = async (path, method = "GET", body) => {
  const response = await fetch(origin + path, { method, headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token,
    "x-molis-work-idempotency-key": randomUUID() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { text }; }
  return { status: response.status, body: json };
};
const out = {};
try {
  let projectId = givenProject, databasePath;
  if (phase === "first") {
    const created = await request("/api/settings/projects", "POST", { display_name: "Probe project", user_confirmed: true });
    out.created = created.status;
    projectId = created.body.project.project_id;
    databasePath = created.body.project.database_path;
    out.project_id = projectId;
    out.database_path = databasePath;
  } else {
    databasePath = process.argv[5];
  }
  const ref = molisWorkHostProjectReference({ databasePath, projectId });
  const prefix = `/projects/${encodeURIComponent(projectId)}`, routes = `${prefix}/api/plugins/${PLUGIN_ID}`;
  const owner = async () => await host.localPersonContext(ref);
  const discovered = async () => (await host.actionClient(ref).discover(await owner()))
    .filter(view => view.provider.plugin_id === PLUGIN_ID).map(view => view.capability_id).sort();
  const methods = () => homeAgentDefinitions(home).methods().filter(method => method.owner_id === PLUGIN_ID).map(method => `${method.skill_id}@${method.version}`);
  const platform = () => host.withProject(ref, runtime => runningProjectPlatform(runtime.store, projectId));
  const installation = async () => {
    const record = (await platform()).runtime.list().find(item => item.plugin_id === PLUGIN_ID);
    return record ? { install_id: record.install_id, state: record.state, error: record.last_error_code, version: record.version, trust: typeof record.publisher_trust === "string" ? record.publisher_trust : record.publisher_trust?.level ?? null } : null;
  };

  if (phase === "first") {
    out.before_enable = { discovered: await discovered(), route: (await request(`${routes}/notes`)).status };
    out.enable = (await request(`/api/settings/projects/${encodeURIComponent(projectId)}/plugins`, "POST", { plugin_id: KEY })).status;
    out.installation = await installation();
    out.discovered = await discovered();
    const first = await request(`${routes}/notes`, "POST", { title: "first probe note" });
    out.create_route = { status: first.status, title: first.body.note?.title };
    out.list_route = (await request(`${routes}/notes`)).body.notes?.map(note => note.title);
    // The undo the create declares: its output mapped onto the remove command's input.
    const note = first.body.note;
    const undone = await host.actionClient(ref).invoke(await owner(), { capability_id: "probe.notes.remove", version: 1 }, { id: note.id, expected_updated_at: note.updated_at });
    out.undo = { result: undone, left: (await request(`${routes}/notes`)).body.notes?.length };
    out.kept = (await request(`${routes}/notes`, "POST", { title: "kept probe note" })).status;
    let search = null;
    for (let attempt = 0; attempt < 40 && !search?.includes("kept probe note"); attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 250));
      search = JSON.stringify((await request(`${prefix}/api/search/query`, "POST", { query: "kept probe note" })).body);
    }
    out.search_finds_note = search.includes("kept probe note");
    const sources = (await request(`${prefix}/api/side/files/sources`)).body.sources ?? [];
    const source = sources.find(item => item.kinds.some(kind => kind.kind === "probe_note"));
    out.file_source = source ? { plugin_id: source.plugin_id,
      titles: (await request(`${prefix}/api/side/files/entries?source=${encodeURIComponent(source.id)}`)).body.page?.entries.map(entry => entry.title) } : null;
    out.methods = methods();
  } else {
    // The first request starts the project's plugins on this Host, as a page would.
    const upgraded = await request(`${routes}/notes`);
    out.notes_after_upgrade = upgraded.body.notes?.map(note => note.title) ?? upgraded.body;
    out.installation = await installation();
    out.methods_after_upgrade = methods();

    const disable = await request(`/api/settings/projects/${encodeURIComponent(projectId)}/plugins`, "DELETE", { plugin_id: KEY });
    out.disable = disable.status === 200 ? 200 : disable;
    const disabled = await request(`${routes}/notes`);
    out.disabled = { route: disabled.status, code: disabled.body.code ?? null, discovered: await discovered(), methods: methods(), state: (await installation())?.state };
    out.reenable = (await request(`/api/settings/projects/${encodeURIComponent(projectId)}/plugins`, "POST", { plugin_id: KEY })).status;
    out.reenabled = { notes: (await request(`${routes}/notes`)).body.notes?.map(note => note.title), state: (await installation())?.state };

    // Revoke: without the write permission the probe does not start (it requires every permission it declares).
    const running = await platform(), { install_id } = await installation();
    const grants = running.runtime.list().find(item => item.install_id === install_id).grants;
    await running.runtime.stop(install_id);
    running.runtime.grant(install_id, grants.filter(permission => permission !== "probe:write"));
    let refused = null;
    try { await running.runtime.start(install_id); } catch (error) { refused = error?.code ?? String(error); }
    out.revoked = { start: refused, route: (await request(`${routes}/notes`)).status, discovered: await discovered() };
    running.runtime.grant(install_id, grants);
    await running.runtime.start(install_id);
    out.restored = (await request(`${routes}/notes`)).status;

    await running.runtime.stop(install_id);
    await running.runtime.uninstall(install_id, { retain_private_data: false });
    out.uninstalled = { state: (await installation())?.state ?? null, route: (await request(`${routes}/notes`)).status, discovered: await discovered(), methods: methods() };
  }
} catch (error) {
  out.error = error?.stack ?? String(error);
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(() => resolve()));
  await host.close();
}
process.stdout.write(`${JSON.stringify(out)}\n`);
