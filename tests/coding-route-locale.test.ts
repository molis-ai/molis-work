import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// specs/visual-ui-experience VUX-40 (user decision 2026-10-20): what a plugin's route sends back follows the page's language.
// The Host resolves the language from the request (the page's language cookie, else Accept-Language) and puts it on the
// call; Coding words its route errors and notes from its stable keys in that language. A language named in the body is
// not the page's and changes nothing.
test("VUX-40: a Coding route answers in the language of the page that called it", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "coding-route-locale-"));
  const token = "coding-route-locale-token-0123456789abcdef";
  const server = createMolisWorkWebServer({ homeDirectory: root, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const request = async (url: string, method = "GET", body?: unknown, language: Record<string, string> = {}) => {
    const response = await fetch(origin + url, { method, headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
      "x-molis-work-control-token": token, ...language }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  try {
    const created = await request("/api/settings/projects", "POST", { display_name: "Locale", user_confirmed: true });
    assert.equal(created.status, 201);
    const project = (created.body.project as { project_id: string }).project_id;
    assert.equal((await request(`/api/settings/projects/${project}/plugins`, "POST", { plugin_id: "coding" })).status, 200);
    const coding = `/projects/${project}/api/plugins/io.molis.work.coding`;
    const session = await request(coding + "/sessions", "POST", { title: "Locale" });
    assert.equal(session.status, 200, JSON.stringify(session.body));
    const id = (session.body.session as { session_id: string }).session_id;
    const budget = (language: Record<string, string>, extra: Record<string, unknown> = {}) =>
      request(`${coding}/sessions/${id}`, "PATCH", { budget: { tokens: 5 }, ...extra }, language);

    const english = await budget({ cookie: "molis_work_locale=en" });
    assert.equal(english.status, 400, JSON.stringify(english.body));
    assert.equal(english.body.error, "The budget must be between 1,000 and 10 billion tokens", "the page's language cookie says English");
    assert.equal((await budget({ "accept-language": "en-US,en;q=0.9" })).body.error, "The budget must be between 1,000 and 10 billion tokens", "without a cookie, Accept-Language decides");
    assert.equal((await budget({ cookie: "molis_work_locale=zh", "accept-language": "en" })).body.error, "预算须为 1000 到 100 亿之间的 token 数", "the cookie wins over Accept-Language");
    assert.equal((await budget({ cookie: "molis_work_locale=zh" }, { locale: "en" })).body.error, "预算须为 1000 到 100 亿之间的 token 数", "a language in the body is not the page's");
    assert.equal(english.body.code, (await budget({})).body.code, "the code is the same in every language");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
