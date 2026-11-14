import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { bindActionHandler, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { definePresentationOverviewAction } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { SurfaceDescription } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { pluginLocaleReader, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { dualPlugin } from "./fixtures/dual-plugin.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

// surface-composition §14.6: a protected home response's words, read in another language without composing again.
const route = "/api/host/surface-home";
type Text = { ref: string; owner: string; positions: string[] };
type Locales = { texts?: { ref: string; owner: string; packs: { owner: string; locale: string; messages: Record<string, string> }[] }[] };

const words = (half: string) => (locale: string) => ({
  "surface-dual.project-summary": locale === "en" ? `Project ${half} in {project}` : `${half} 项目 {project}`,
  "surface-dual.note": locale === "en" ? `Note from ${half}` : `${half} 的说明`,
  "surface-dual.unshown": "never shown",
});

function withLocales(definition: PluginDefinition, half: string) {
  const manifest = { ...definition.manifest, ui: { ...definition.manifest.ui, locales: { default: "zh", available: ["zh", "en"] } } };
  const messages = words(half);
  return { definition: { ...definition, manifest }, localePacks: () => pluginLocaleReader(manifest, path => {
    const locale = /^locales\/(zh|en)\.json$/u.exec(path)?.[1];
    return locale ? JSON.stringify({ format_version: 1, owner: manifest.plugin_id, locale, messages: messages(locale) }) : null;
  }) };
}

async function fixture(t: TestContext) {
  const dual = dualPlugin("surface-dual", true);
  const overview = definePresentationOverviewAction("surface-dual.overview", 1, "Project overview", [dual.read]);
  const start = { capability_id: dual.actions.project.capability_id, version: dual.actions.project.version };
  dual.manifest.actions = [...dual.manifest.actions ?? [], overview];
  dual.manifest.presentation = { objects: [], overview: { capability_id: overview.capability_id, version: overview.version,
    note: { key: "surface-dual.note" }, start: [start] } };
  let reads = 0;
  const project = dual.half("project", () => ({ actions: [bindActionHandler(overview, async (_input, caller) => {
    reads++;
    return { summary: { key: "surface-dual.project-summary", args: [{ name: "project", kind: "text", text: caller.project_id! }] }, subjects: [], start: [start] };
  })] }));
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [{ ...withLocales(dual.home, "home"), dual_instance: true }], project: [withLocales(project, "project")] } });
  const created = await f.project("Words"), prefix = "/projects/" + created.project_id;
  const shell = await fetch(f.origin + prefix + "/");
  const cookie = shell.headers.getSetCookie().find(value => value.startsWith("molis-work-web-"))?.split(";")[0];
  const proof = /<meta name="molis-work-page-session" content="([^"]+)"/u.exec(await shell.text())?.[1];
  assert.ok(cookie && proof);
  const headers = { cookie, "x-molis-work-page-session": proof };
  await f.host.inspectActions({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: created.project_id, permissions: [], audience: "user" }, created.reference);
  const read = async () => {
    const response = await f.request(prefix + route, { method: "POST", body: {}, authorized: false, headers });
    assert.equal(response.status, 200, await response.clone().text());
    return await response.json() as SurfaceDescription & { surface_text?: Text[] };
  };
  const locales = (query: Record<string, string | string[]>, extra: Record<string, string> = {}) => {
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) for (const item of [value].flat()) parameters.append(key, item);
    return f.request(prefix + "/api/ui/locales?" + parameters, { authorized: false, headers: { ...headers, ...extra } });
  };
  return { ...f, dual, created, prefix, headers, read, locales, reads: () => reads };
}

test("SCS-12 the home's own words switch language from their exact source, with no second composition or overview read", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  const home = await f.read();
  assert.equal(f.reads(), 1);
  const text = home.surface_text?.filter(item => item.owner === f.dual.id) ?? [];
  assert.equal(text.length, 1, JSON.stringify(home.surface_text));
  assert.deepEqual(text[0]!.positions, ["group:" + f.dual.id]);
  for (const [locale, summary, note] of [["en", "Project project in {project}", "Note from project"], ["zh", "project 项目 {project}", "project 的说明"]] as const) {
    const answer = await f.locales({ locale, surface_text: text[0]!.ref });
    assert.equal(answer.status, 200, await answer.clone().text());
    const { texts } = await answer.json() as Locales;
    assert.equal(texts?.length, 1);
    const pack = texts![0]!.packs.find(item => item.locale === locale);
    assert.deepEqual(pack?.messages, { "surface-dual.project-summary": summary, "surface-dual.note": note },
      "the project half's overview supplied the card: its shown keys only, never the Home half's words of the same owner and key");
  }
  assert.equal(f.reads(), 1, "switching languages read no overview again");
});

test("SCS-12 a home word grant is refused once forged, misused, replaced, released or its source changed", { timeout: 60_000 }, async t => {
  const f = await fixture(t);
  const ref = (await f.read()).surface_text!.find(item => item.owner === f.dual.id)!.ref;
  const ok = async () => assert.equal((await f.locales({ locale: "en", surface_text: ref })).status, 200);
  await ok();
  assert.equal((await f.locales({ locale: "en", surface_text: randomUUID() })).status, 403, "a guessed grant reads nothing");
  assert.equal((await f.locales({ locale: "en", page: ref })).status, 403, "a word grant is not a page");
  assert.equal((await f.request(f.prefix + route, { method: "POST", body: {}, authorized: false, headers: { ...f.headers, "x-molis-plugin-page": ref } })).status, 403,
    "nor a page credential on another route");
  const other = await f.project("Elsewhere");
  assert.equal((await f.request("/projects/" + other.project_id + "/api/ui/locales?" + new URLSearchParams({ locale: "en", surface_text: ref }),
    { authorized: false, headers: f.headers })).status, 403, "another project cannot read it");
  assert.equal((await f.request(f.prefix + "/api/ui/locales?" + new URLSearchParams({ locale: "en", surface_text: ref }))).status, 403,
    "a caller without the original browser session cannot read it");

  const records = await f.host.withProject(f.created.reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db));
  const original = records.list().find(item => item.plugin_id === f.dual.id)!;
  records.save({ ...original, installation_generation: original.installation_generation + 1 });
  try { assert.equal((await f.locales({ locale: "en", surface_text: ref })).status, 403, "a replaced installation keeps none of the old words"); }
  finally { records.save(original); }
  await ok();

  const newer = (await f.read()).surface_text!.find(item => item.owner === f.dual.id)!.ref;
  assert.notEqual(newer, ref);
  const released = await f.request(f.prefix + route, { method: "POST", body: { release_text: [ref] }, authorized: false, headers: f.headers });
  assert.equal(released.status, 200, await released.clone().text());
  assert.equal((await f.locales({ locale: "en", surface_text: ref })).status, 403, "a released response's words are gone");
  assert.equal((await f.locales({ locale: "en", surface_text: newer })).status, 200, "releasing the old response leaves the newer one");

  await f.host.closeProject(f.created.reference);
  await f.host.inspectActions({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: f.created.project_id, permissions: [], audience: "user" }, f.created.reference);
  assert.equal((await f.locales({ locale: "en", surface_text: newer })).status, 403, "the same release started again is another activation");
});
