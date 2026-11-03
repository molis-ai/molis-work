import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { PluginInstalledView } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { homeProbe, serveHomeRuntime } from "./fixtures/home-runtime.js";

// PG-002, S-94: the project settings page's door for switching one optional permission of a plugin installed in that project, over the real
// Host HTTP composition. RAC-950 the route takes only the control token and the page's origin, one POST of its three fields, reads nothing the
// body says about the project or who the person is, and refuses a plugin's own page; RAC-940 switching off keeps the installation and leaves it
// running on the grants that remain; RAC-941 a required permission cannot be switched off and one the Manifest does not declare cannot be switched
// on; RAC-953 asking for what is already so changes nothing; RAC-949 the plugin list reflects the switch; RAC-958 the plugins that run as the Home's
// own instance have the same switch behind the Host settings door (BL-700); RAC-959 the page lists them and sends their switch to that door.

const SET = "/api/plugin-trust/permissions/set";
interface Overview { plugins: PluginInstalledView[] }
const timeout = 90_000;

async function setup(t: TestContext) {
  const f = await serveHomeRuntime(t), project = await f.project("权限开关");
  const prefix = `/projects/${project.project_id}`;
  const post = (path: string, body: unknown, init: { authorized?: boolean; headers?: Record<string, string> } = {}) => f.request(prefix + path, { method: "POST", body, ...init });
  const overview = async () => (await (await f.request(prefix + "/api/plugin-trust/overview")).json()) as Overview;
  const subject = async () => {
    const plugin = (await overview()).plugins.find(item => item.manifest_available && item.permissions.some(permission => !permission.required));
    assert.ok(plugin, "a plugin that ships with Molis Work asks for an optional permission");
    return { plugin, optional: plugin.permissions.find(permission => !permission.required)!, required: plugin.permissions.find(permission => permission.required) };
  };
  return { ...f, project, prefix, post, overview, subject };
}

test("RAC-950 S-94 the permission route needs the control token and the page's origin, takes one POST of its three fields, and reads nothing the body says about the project or the person", { timeout }, async t => {
  const f = await setup(t), { plugin, optional } = await f.subject();
  const body = { install_id: plugin.install_id, permission: optional.permission, granted: optional.granted };
  assert.equal((await f.post(SET, body, { authorized: false })).status, 403, "no control token");
  assert.equal((await f.post(SET, body, { headers: { origin: "http://127.0.0.1:1" } })).status >= 400, true, "another origin");
  assert.equal((await f.request(f.prefix + SET)).status >= 400, true, "a read of it");
  for (const extra of [{ project_id: "another-project" }, { user_action: { source: "web", conversation_ref: "a", message_ref: "b" } }, { actor_id: "someone" }]) {
    const refused = await f.post(SET, { ...body, ...extra });
    assert.equal(refused.status, 400, JSON.stringify(extra)); assert.equal((await refused.json()).code, "actions.input_invalid");
  }
  assert.deepEqual((await f.overview()).plugins.find(item => item.install_id === plugin.install_id)!.permissions, plugin.permissions, "none of those changed anything");
});

test("RAC-950 S-94 a plugin's own page cannot use the permission route", { timeout }, async t => {
  const f = await setup(t), { plugin, optional } = await f.subject();
  const opened = await f.post("/api/host/plugin-pages", { plugin_id: "io.molis.work.cognia" });
  assert.equal(opened.status, 200, await opened.clone().text());
  const headers = { "x-molis-plugin-page": (await opened.json()).page_id as string };
  const refused = await f.post(SET, { install_id: plugin.install_id, permission: optional.permission, granted: !optional.granted }, { headers });
  assert.equal(refused.status, 403, await refused.clone().text());
  assert.equal((await f.overview()).plugins.find(item => item.install_id === plugin.install_id)!.permissions.find(item => item.permission === optional.permission)!.granted, optional.granted, "the switch did not move");
});

test("RAC-940 RAC-953 RAC-949 S-94 switching an optional permission off keeps the installation and leaves it running, asking again changes nothing, switching it on restores it", { timeout }, async t => {
  const f = await setup(t), { plugin, optional } = await f.subject();
  const set = async (granted: boolean) => {
    const response = await f.post(SET, { install_id: plugin.install_id, permission: optional.permission, granted });
    assert.equal(response.status, 200, await response.clone().text());
    return await response.json() as { install_id: string; changed: boolean; permissions: Array<{ permission: string; granted: boolean }> };
  };
  const held = async () => {
    const now = (await f.overview()).plugins.find(item => item.install_id === plugin.install_id)!;
    return { state: now.state, granted: now.permissions.find(item => item.permission === optional.permission)!.granted };
  };
  const off = await set(false);
  assert.deepEqual([off.install_id, off.changed === optional.granted, off.permissions.find(item => item.permission === optional.permission)!.granted], [plugin.install_id, true, false]);
  assert.deepEqual(await held(), { state: "running", granted: false }, "the same installation, running without it");
  assert.equal((await set(false)).changed, false, "already off");
  const on = await set(true);
  assert.deepEqual([on.changed, on.permissions.find(item => item.permission === optional.permission)!.granted], [true, true]);
  assert.deepEqual(await held(), { state: "running", granted: true });
  assert.equal((await set(true)).changed, false, "already on");
});

test("RAC-941 S-94 a required permission cannot be switched off, one the Manifest does not declare cannot be switched on, and an unknown installation is not there", { timeout }, async t => {
  const f = await setup(t), { plugin, optional, required } = await f.subject();
  assert.ok(required, "the plugin has a required permission");
  const before = JSON.stringify((await f.overview()).plugins.find(item => item.install_id === plugin.install_id)!.permissions);
  const code = async (input: Record<string, unknown>) => (await (await f.post(SET, input)).json()).code;
  assert.equal(await code({ install_id: plugin.install_id, permission: required.permission, granted: false }), "plugin.grant_denied");
  assert.equal(await code({ install_id: plugin.install_id, permission: "nowhere:declared", granted: true }), "plugin.grant_denied");
  assert.equal(await code({ install_id: "no-such-install", permission: optional.permission, granted: false }), "plugin.definition_missing");
  assert.equal(JSON.stringify((await f.overview()).plugins.find(item => item.install_id === plugin.install_id)!.permissions), before, "nothing moved");
});

test("RAC-951 RAC-952 the 插件 page gives each optional permission a switch, asks first only for the four that reach out or spend, and marks a job whose permission is off as paused", { timeout }, async t => {
  const f = await setup(t);
  const html = await (await f.request(f.prefix + "/settings/plugins")).text();
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(found => found[1]!).find(body => body.includes("molisWorkBindPluginTrustSettings"));
  assert.ok(script, "the page carries the plugin settings program");
  assert.doesNotThrow(() => new Function(script), "the program parses");
  const wide = new Function(`${script.match(/const WIDE = [^\n]*;/)![0]}; return WIDE;`)() as (permission: string) => boolean;
  for (const permission of ["actions:delegate", "model:invoke", "network:api.example.com", "secret:weather-key"]) assert.equal(wide(permission), true, `${permission} is confirmed`);
  for (const permission of ["storage:private", "model:read", "surface:browser", "issues:write", "networkx", "secretly"]) assert.equal(wide(permission), false, `${permission} takes one click`);
  const grants = script.slice(script.indexOf("const grants = "), script.indexOf("const draw = "));
  assert.match(grants, /setAttribute\("role", "switch"\)/, "a switch per permission");
  assert.match(grants, /if \(item\.required\) return line;/, "a required permission has none");
  assert.ok(grants.indexOf("WIDE(item.permission) && !await ask(") < grants.indexOf("await send("), "the confirmation comes before the call");
  assert.match(script, /send = \(payload\) => api\("\/permissions\/set", payload\)/, "a project's plugin sends to the project's route unless the caller gives another");
  assert.match(grants, /catch \(failure\) \{ toggle\.checked = !on; fail\(failure\); \}/, "a refused switch goes back");
  assert.match(script, /!view\.granted && item\.permissions\.includes\(view\.permission\)/, "a job is paused by a permission that is off");
  assert.match(script, /L\("已暂停：缺少 \{permissions\} 的授权"/);
});

const HOME_SET = "/api/settings/plugin-permissions/set";

test("RAC-958 S-94 the Home's own plugins are listed and switched through the Host settings door: guarded like the project's, restarted on the new grants, and not reachable from the project's door", { timeout }, async t => {
  const probe = homeProbe("switchprobe");
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await f.host.homePlugins!.ready();
  const project = await f.project("个人空间开关"), prefix = `/projects/${project.project_id}`;
  const list = async () => ((await (await f.request("/api/settings/plugin-permissions/list", { method: "POST", body: {} })).json()) as Overview).plugins;
  const mine = async () => (await list()).find(item => item.plugin_id === probe.id)!;
  const read = "switchprobe:read";
  const before = await mine();
  assert.deepEqual(before.permissions.map(item => [item.permission, item.required, item.granted]).filter(([name]) => name === "storage:private" || name === read), [["storage:private", true, true], [read, false, false]]);
  const set = (body: unknown, init: { authorized?: boolean; headers?: Record<string, string> } = {}) => f.request(HOME_SET, { method: "POST", body, ...init });
  const body = { install_id: before.install_id, permission: read, granted: true };
  assert.equal((await set(body, { authorized: false })).status, 403, "no control token");
  assert.equal((await set(body, { headers: { origin: "http://127.0.0.1:1" } })).status >= 400, true, "another origin");
  assert.equal((await f.request(HOME_SET)).status >= 400, true, "a read of it");
  for (const extra of [{ project_id: project.project_id }, { user_action: { source: "web", conversation_ref: "a", message_ref: "b" } }, { actor_id: "someone" }]) {
    const refused = await set({ ...body, ...extra });
    assert.equal(refused.status, 400, JSON.stringify(extra)); assert.equal((await refused.json()).code, "actions.input_invalid");
  }
  assert.equal((await mine()).permissions.find(item => item.permission === read)!.granted, false, "none of those changed anything");
  // A plugin's own page is not the person.
  const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: probe.id } });
  assert.equal(opened.status, 200, await opened.clone().text());
  const page = { "x-molis-plugin-page": (await opened.json()).page_id as string };
  assert.equal((await set(body, { headers: page })).status, 403, "the plugin's page");
  assert.equal((await mine()).permissions.find(item => item.permission === read)!.granted, false);
  // The project's door does not reach the Home's instance.
  const viaProject = await f.request(prefix + SET, { method: "POST", body });
  assert.equal((await viaProject.json()).code, "plugin.definition_missing", "the project's door finds no such installation in the project");
  // The switch: the plugin is started again on the new grants, and the list says so.
  const starts = probe.contexts.length;
  const on = await set(body);
  assert.equal(on.status, 200, await on.clone().text());
  const done = await on.json() as { changed: boolean; permissions: Array<{ permission: string; granted: boolean }> };
  assert.deepEqual([done.changed, done.permissions.find(item => item.permission === read)!.granted], [true, true]);
  assert.equal(probe.contexts.length, starts + 1, "started once more");
  assert.equal(probe.contexts.at(-1)!.grants.includes(read), true, "the new activation holds it");
  assert.deepEqual([(await mine()).state, (await mine()).permissions.find(item => item.permission === read)!.granted], ["running", true]);
  assert.equal(((await (await set(body)).json()) as { changed: boolean }).changed, false, "already on");
  const off = await set({ ...body, granted: false });
  assert.equal(((await off.json()) as { changed: boolean }).changed, true);
  assert.equal(probe.contexts.at(-1)!.grants.includes(read), false, "and off again");
  const code = async (input: Record<string, unknown>) => ((await (await set(input)).json()) as { code: string }).code;
  assert.equal(await code({ ...body, permission: "storage:private", granted: false }), "plugin.grant_denied", "a required permission stays");
  assert.equal(await code({ ...body, permission: "nowhere:declared" }), "plugin.grant_denied", "an undeclared one is not there");
  assert.equal(await code({ ...body, install_id: "no-such-install" }), "plugin.definition_missing");
});

test("RAC-959 the 插件 page has a section for the Home's own plugins, reads it from the Host settings door and sends its switch there", { timeout }, async t => {
  const f = await setup(t);
  const html = await (await f.request(f.prefix + "/settings/plugins")).text();
  assert.match(html, /data-plugin-trust-home/);
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(found => found[1]!).find(body => body.includes("molisWorkBindPluginTrustSettings"))!;
  assert.match(script, /^const homeApi = \(name, payload = \{\}\) => molisWorkRequest\("\/api\/settings\/plugin-permissions\/" \+ name, \{ body: payload \}\);$/m, "the shared Home helper uses the absolute Host door and forwards its payload");
  assert.match(script, /^personal = \(await homeApi\("list"\)\)\.plugins;$/m, "the Home rows come from that door's list");
  assert.match(script, /^const homeSend = \(payload\) => homeApi\("set", payload\);$/m, "the permission switch forwards its payload through that door's set");
  assert.match(script, /^draw\(\$\("home"\), L\("个人空间里没有插件"\), personal\.map\(\(plugin\) => installed\(plugin, homeSend, revoked, homeApi\)\)\);$/m, "the Home's rows send their switch to the Home door, and their lifecycle too (BL-715)");
  assert.match(script, /const installed = \(plugin, send = \(payload\) => api\("\/permissions\/set", payload\), revoked = null, act\)/, "a project's rows send theirs to the project's route");
});

test("RAC-2604 S-94 the Host settings door's disable, enable and uninstall are guarded like its switch, and reach only a package installed in the Home: a plugin of the Host's build keeps running, and the project's door cannot reach the Home's", { timeout }, async t => {
  const probe = homeProbe("lifecycleprobe");
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await f.host.homePlugins!.ready();
  const project = await f.project("个人空间停用"), prefix = `/projects/${project.project_id}`;
  const state = () => f.host.homePlugins!.installation(probe.id)?.state;
  assert.equal(state(), "running");
  for (const step of ["disable", "enable", "uninstall"] as const) {
    const path = `/api/settings/plugin-permissions/${step}`, body = { plugin_id: probe.id, ...(step === "uninstall" ? { keep_data: true } : {}) };
    const call = (input: unknown, init: { authorized?: boolean; headers?: Record<string, string> } = {}) => f.request(path, { method: "POST", body: input, ...init });
    assert.equal((await call(body, { authorized: false })).status, 403, `${step}: no control token`);
    assert.equal((await call(body, { headers: { origin: "http://127.0.0.1:1" } })).status >= 400, true, `${step}: another origin`);
    assert.equal((await f.request(path)).status >= 400, true, `${step}: a read of it`);
    for (const extra of [{ project_id: project.project_id }, { user_action: { source: "web", conversation_ref: "a", message_ref: "b" } }, { actor_id: "someone" }]) {
      const refused = await call({ ...body, ...extra });
      assert.equal(refused.status, 400, `${step}: ${JSON.stringify(extra)}`); assert.equal((await refused.json()).code, "actions.input_invalid");
    }
    // A plugin's own page is not the person.
    const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: probe.id } });
    assert.equal(opened.status, 200, await opened.clone().text());
    const page = { "x-molis-plugin-page": (await opened.json()).page_id as string };
    assert.equal((await call(body, { headers: page })).status, 403, `${step}: the plugin's page`);
    // The probe is a plugin of the Host's build, not a signed package installed in the Home: the door does not reach it.
    const reached = await call(body);
    assert.equal((await reached.json()).code, "plugin.state_invalid", `${step}: a plugin that is not an installed package`);
    // The project's door does not reach the Home's package either.
    const viaProject = await f.request(`${prefix}/api/plugin-trust/installed/${step}`, { method: "POST", body });
    assert.equal((await viaProject.json()).code, "plugin.state_invalid", `${step}: the project's door`);
    assert.equal(state(), "running", `${step}: it is still running`);
  }
});

test("RAC-2606 the 插件 page sends a Home row's switch-off, switch-on and uninstall to the Host settings door, a project row's to the project's route, and draws the recovery error and the revoked publisher with textContent, a revoked publisher's row with its one sentence", { timeout }, async t => {
  const f = await setup(t);
  const html = await (await f.request(f.prefix + "/settings/plugins")).text();
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(found => found[1]!).find(body => body.includes("molisWorkBindPluginTrustSettings"))!;
  assert.match(script, /^draw\(\$\("home"\), L\("个人空间里没有插件"\), personal\.map\(\(plugin\) => installed\(plugin, homeSend, revoked, homeApi\)\)\);$/m, "a Home row is given the revoked publishers and the shared Home door's act");
  assert.match(script, /^const homeApi = \(name, payload = \{\}\) => molisWorkRequest\("\/api\/settings\/plugin-permissions\/" \+ name, \{ body: payload \}\);$/m, "its act goes to the absolute Host settings door with its payload");
  assert.match(script, /act = \(name, payload\) => api\("\/installed\/" \+ name, payload\)/, "a project row's act defaults to the project's route");
  assert.match(script, /body\.append\(controls\(plugin, revoked, act\)\)/, "the row hands its act to the buttons");
  assert.match(script, /el\("span", "settings-form-error", L\("没能启动：\{error\}"/, "the recovery error is drawn by el");
  assert.match(script, /el\("span", "settings-muted", L\("发布者的信任已撤销：它不再运行，只能卸载"\)\)/, "so is the revoked publisher");
  // A publisher taken back stops the package and the Host puts its own sentence into recovery_error: the row says the revoked sentence only, not it twice and not "没能启动".
  assert.match(script, /if \(revoked && revoked\.has\(plugin\.publisher_signature\)\) body\.append\([^\n]*\);\s*else if \(plugin\.recovery_error\) body\.append\(el\("span", "settings-form-error"/, "the revoked sentence is chosen first, the recovery error only when the publisher stands");
  // The page's script carries the shared workbench code too, which writes markup elsewhere; this program is the one that draws the rows: from its binder (found by the flag only it sets) to the end of its closure.
  const begin = script.lastIndexOf("const bind = (root) => {", script.indexOf("root.dataset.pluginTrustBound"));
  const program = script.slice(begin, script.indexOf("})();", script.indexOf("molisWorkBindPluginTrustSettings(document)", begin)));
  assert.ok(program.includes("const controls = ") && program.includes("const load = "), "the slice holds the rows, their buttons and the loader");
  assert.doesNotMatch(program, /innerHTML/);
});
