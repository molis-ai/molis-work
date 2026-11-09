import assert from "node:assert/strict";
import test from "node:test";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginPagesFor } from "@molis-ai/molis-work-app-local-host";
import { registerPluginText } from "@molis-ai/molis-work-app-workbench";
import { pluginLocaleReader } from "@molis-ai/molis-work-plugin-runtime";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

const header = "x-molis-work-page-session";
async function pageSession(origin: string, path: string) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie().find(value => value.startsWith("molis-work-web-"))?.split(";")[0];
  const proof = /<meta name="molis-work-page-session" content="([^"]+)"/.exec(await response.text())?.[1];
  assert.ok(cookie && proof);
  return { cookie, [header]: proof };
}

const owner = "io.molis.work.example.text-page";
const manifest = { plugin_id: owner, kind: "app", ui: { contributions: [], locales: { default: "zh", available: ["zh", "en"] } } } as PluginManifest;

function connectText(home: string, projectId: string, title: string) {
  const instance = { install_id: "same-install", installation_generation: "same-generation" };
  const read: string[] = [];
  const reader = pluginLocaleReader(manifest, path => {
    read.push(path);
    const locale = path.endsWith("en.json") ? "en" : "zh";
    return JSON.stringify({ format_version: 1, owner, locale, messages: { "text-page.stage.title": locale === "en" ? title : "界面词" } });
  });
  const disposeText = registerPluginText(reader!, { activation: instance, t: false });
  const disposePage = pluginPagesFor(home).connect({ manifest, install_id: instance.install_id, instance, project_id: projectId, actor_id: "web-user", assertCurrent() {} });
  return { read, close() { disposePage(); disposeText(); } };
}

test("S-ui-text-page FSS-09 FSS-37 only the originating shell can batch exact running mounts", { timeout: 30_000 }, async t => {
  const f = await serveHomeRuntime(t), first = await f.project("Text owner"), second = await f.project("Different project");
  const prefix = `/projects/${first.project_id}`, wrongProject = `/projects/${second.project_id}`;
  const start = connectText(f.home, first.project_id, "First view"), other = connectText(f.home, second.project_id, "Different project view");
  t.after(() => { start.close(); other.close(); });
  const session = await pageSession(f.origin, prefix + "/"), stranger = await pageSession(f.origin, prefix + "/");
  const grant = async () => {
    const reply = await f.request(prefix + "/api/host/plugin-pages", { authorized: false, method: "POST", headers: session, body: { plugin_id: owner } });
    assert.equal(reply.status, 200, await reply.clone().text());
    return (await reply.json()).page_id as string;
  };
  const id = await grant(), otherMount = await grant();
  const locale = (ids: string[], route = prefix, headers: Record<string, string> = session) =>
    f.request(route + "/api/ui/locales?" + new URLSearchParams([["locale", "en"], ...ids.map(id => ["page", id])]), { authorized: false, headers });
  for (const refused of [await locale([id], prefix, stranger), await locale([id], wrongProject),
    await locale([id], prefix, { ...session, "x-molis-plugin-page": id }),
    await locale([id], prefix, { ...session, "x-molis-context-page": id }),
    await locale([id], prefix, { ...session, origin: "https://outside.invalid" }),
    await locale([id, "a0000000-0000-0000-0000-000000000000"])]) {
    assert.equal(refused.status, 403, await refused.text());
  }
  assert.deepEqual(start.read, [], "rejected batches never read an otherwise authorized pack");
  const response = await locale([id, otherMount]);
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.deepEqual(body.owners.map((source: { pages: string[] }) => source.pages), [[id, otherMount]], "both mounts use one pack projection");
  assert.deepEqual(body.owners[0].packs.map((pack: { messages: Record<string, string> }) => pack.messages["text-page.stage.title"]), ["First view"]);
  assert.ok(body.shared.every((pack: { messages: object }) => Object.keys(pack.messages).every(key => key.startsWith("common."))));
  assert.deepEqual(start.read, ["locales/en.json", "locales/zh.json"]);
  assert.deepEqual(other.read, []);
  const closed = await f.request(prefix + "/api/host/plugin-pages/" + id, { authorized: false, method: "DELETE", headers: session, body: {} });
  assert.equal(closed.status, 200);
  assert.equal((await locale([id])).status, 403);
  start.close();
  const replacement = connectText(f.home, first.project_id, "Replacement view");
  try {
    assert.equal((await locale([otherMount])).status, 403, "the old grant cannot borrow the replacement with the same persisted ids");
    const fresh = await locale([await grant()]);
    assert.equal(fresh.status, 200);
    assert.equal((await fresh.json()).owners[0].packs[0].messages["text-page.stage.title"], "Replacement view");
  } finally { replacement.close(); }
});
