import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { PluginInstalledView } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

// PG-002, S-93: the project settings page's door for switching one optional permission of a plugin installed in that project, over the real
// Host HTTP composition. RAC-950 the route takes only the control token and the page's origin, one POST of its three fields, reads nothing the
// body says about the project or who the person is, and refuses a plugin's own page; RAC-940 switching off keeps the installation and leaves it
// running on the grants that remain; RAC-941 a required permission cannot be switched off and one the Manifest does not declare cannot be switched
// on; RAC-953 asking for what is already so changes nothing; RAC-949 the plugin list reflects the switch.

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

test("RAC-950 S-93 the permission route needs the control token and the page's origin, takes one POST of its three fields, and reads nothing the body says about the project or the person", { timeout }, async t => {
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

test("RAC-950 S-93 a plugin's own page cannot use the permission route", { timeout }, async t => {
  const f = await setup(t), { plugin, optional } = await f.subject();
  const opened = await f.post("/api/host/plugin-pages", { plugin_id: "io.molis.work.cognia" });
  assert.equal(opened.status, 200, await opened.clone().text());
  const headers = { "x-molis-plugin-page": (await opened.json()).page_id as string };
  const refused = await f.post(SET, { install_id: plugin.install_id, permission: optional.permission, granted: !optional.granted }, { headers });
  assert.equal(refused.status, 403, await refused.clone().text());
  assert.equal((await f.overview()).plugins.find(item => item.install_id === plugin.install_id)!.permissions.find(item => item.permission === optional.permission)!.granted, optional.granted, "the switch did not move");
});

test("RAC-940 RAC-953 RAC-949 S-93 switching an optional permission off keeps the installation and leaves it running, asking again changes nothing, switching it on restores it", { timeout }, async t => {
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

test("RAC-941 S-93 a required permission cannot be switched off, one the Manifest does not declare cannot be switched on, and an unknown installation is not there", { timeout }, async t => {
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
  assert.ok(grants.indexOf("WIDE(item.permission) && !await ask(") < grants.indexOf('api("/permissions/set"'), "the confirmation comes before the call");
  assert.match(grants, /catch \(failure\) \{ toggle\.checked = !on; fail\(failure\); \}/, "a refused switch goes back");
  assert.match(script, /!view\.granted && item\.permissions\.includes\(view\.permission\)/, "a job is paused by a permission that is off");
  assert.match(script, /L\("已暂停：缺少 \{permissions\} 的授权"/);
});
