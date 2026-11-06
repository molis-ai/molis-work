import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { providerHealth, type ModelProviderHealth, type ModelProviderRecord } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { renderModelSettingsDocument, type ModelSettingsModel, type ModelSettingsPrimitives } from "@molis-ai/molis-work-app-workbench";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";

/**
 * The model settings page as the service-connection decision's plan A (specs/assistant-service-connections §13.1, batch 13 ④b):
 * a draft asks for one key and says where to get it, the technical fields fold into 高级 unless nothing fills them, a saved provider
 * reads as four plain rows, and a check the service refuses is coded so the page can say it where it belongs.
 */

const p: ModelSettingsPrimitives = {
  L: (text, values) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values?.[key] ?? "")),
  escape: (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  icon: (name) => `<i data-icon="${name}"></i>`,
};

const templates = [
  { template_id: "alpha", display_name: "Alpha", fills_base_url: true, fills_model: true },
  { template_id: "beta", display_name: "Beta 兼容", fills_base_url: false, fills_model: false },
];

function provider(overrides: Partial<ModelProviderRecord> = {}): ModelProviderRecord {
  return { provider_id: "alpha-1", display_name: "Alpha", base_url: "https://api.alpha.test/v1", api_format: "anthropic-messages",
    credential_ref: "connector-connection:alpha:token", enabled: true, models: [{ model_id: "alpha-large", enabled: true }],
    created_at: "2026-11-06T00:00:00.000Z", updated_at: "2026-11-06T00:00:00.000Z", ...overrides };
}

const render = (model: Omit<ModelSettingsModel, "primitives" | "templates"> & { templates?: ModelSettingsModel["templates"] }) =>
  renderModelSettingsDocument({ templates, ...model, primitives: p });
/** Whatever sits inside the folded 高级, and whatever comes before it. */
const advanced = (html: string) => html.slice(html.indexOf('class="mw-collapsible model-advanced"'));
const before = (html: string) => html.slice(0, html.indexOf('class="mw-collapsible model-advanced"'));
const draft = (templateId: string | null) => render({ providers: [], health: [], selected_provider_id: null,
  draft_provider: provider({ provider_id: "draft-1", credential_ref: "" }), draft_template_id: templateId,
  key_hint: "在 Alpha 控制台的 API Keys 里新建一把" });

test("ASC-60 a draft asks for one key and says where to get it; what its template fills in folds into 高级", () => {
  const filled = draft("alpha");
  assert.match(before(filled), /<label for="model-api-key">Alpha 的 API 密钥<\/label>/, "the key is asked by the provider's name");
  assert.match(before(filled), /在 Alpha 控制台的 API Keys 里新建一把。加密存在这台电脑，保存后不再显示。/, "where to get the key, and where it is kept");
  assert.match(before(filled), /data-model-rows/, "the models stay on the default path (§13.2)");
  assert.doesNotMatch(before(filled), /data-model-base-url|data-model-api-format|data-model-prompt-cache|data-model-thinking|data-model-name/, "nothing technical before 高级");
  for (const hook of ["data-model-base-url", "data-model-api-format", "data-model-prompt-cache", "data-model-thinking", "data-model-name"]) {
    assert.match(advanced(filled), new RegExp(hook), `${hook} is in 高级`);
  }
  assert.doesNotMatch(filled, /class="mw-collapsible model-advanced"[^>]*open/, "高级 starts folded");
  assert.match(filled, /data-connection-progress data-state="running"/, "the first key shows its steps");
  assert.match(filled, /第 1 步，共 3 步：填密钥/);
  assert.match(filled, /data-model-save=""[^>]*>[\s\S]*?保存并检查[\s\S]*?mw-btn__key/, "one primary action that checks before it saves, with its key");

  const compatible = draft("beta");
  assert.match(before(compatible), /data-model-base-url/, "a template that cannot know the address asks for it on the default path");
  assert.match(advanced(compatible), /data-model-api-format/, "its format is known, so it stays in 高级");
  const blank = draft(null);
  assert.match(before(blank), /data-model-base-url[\s\S]*data-model-api-format/, "the blank form asks for address and format");
  assert.doesNotMatch(advanced(blank), /data-model-base-url|data-model-api-format/, "each field is drawn once");
});

test("ASC-61 a saved provider reads as four plain rows: its key, whether it answers and when, what it can do, who uses it", () => {
  const second = provider({ provider_id: "alpha-2", display_name: "Alpha 备用", credential_ref: "connector-connection:alpha:token" });
  const page = (last?: ModelProviderHealth["last_check"], selected = "alpha-1") => render({
    providers: [provider({ models: [{ model_id: "a", enabled: true }, { model_id: "b", enabled: true }, { model_id: "c", enabled: true }] }), second],
    health: [{ ...providerHealth(provider(), true), ...(last ? { last_check: last } : {}) }, providerHealth(second, true)],
    selected_provider_id: selected,
    connections: [{ connection_id: "conn-alpha", service_id: "model-api", display_name: "Alpha 密钥", auth_method: "token", source: "managed", state: "connected", account_label: null }],
    selected_connection_ids: { "alpha-1": "conn-alpha", "alpha-2": "conn-alpha" },
  });
  const never = page();
  const facts = never.slice(never.indexOf('class="mw-card model-facts"'), never.indexOf("</article>"));
  assert.deepEqual([...facts.matchAll(/<strong>([^<]+)<\/strong><span>/g)].map((match) => match[1]), ["用的密钥", "连得上吗", "能做什么", "谁在用"]);
  assert.match(facts, /<strong>Alpha 密钥<\/strong>/, "the key by its connection's name, never its value");
  assert.match(facts, /还没检查过 · 下次保存时检查/, "never verified is not shown as verified");
  assert.match(facts, /用 a、b 等 3 个模型/);
  assert.match(facts, /默认模型：没指定模型的地方都用它/, "the first provider that can run is the default");
  assert.match(facts, /同一把密钥也给 Alpha 备用 用/, "a key two providers share says so");
  assert.match(page(undefined, "alpha-2"), /只在选了它的地方用/);
  assert.match(never, /data-model-saved/, "a provider with a key is told apart from a first connection");
  assert.doesNotMatch(never, /data-connection-progress/, "a saved provider has no first-key steps");

  const at = new Date(2026, 10, 6, 10, 8).toISOString();
  assert.match(page({ at, outcome: "connected", current: true }), /data-mw-state="connected"[\s\S]*?连得上 · 11-06 10:08 检查/);
  assert.match(page({ at, outcome: "connected", current: false }), /改过之后还没检查 · 上次 11-06 10:08 连得上/);
  assert.match(page({ at, outcome: "failed", code: "model_provider.key_rejected", current: true }), /data-mw-state="failed"[\s\S]*?密钥被拒 · 11-06 10:08/);
  const limited = page({ at, outcome: "failed", code: "model_provider.rate_limited", retry_at: new Date(2026, 10, 6, 10, 9).toISOString(), current: true });
  assert.match(limited, /data-mw-state="retrying"[\s\S]*?请求太多或额度用完 · 11-06 10:08 · 11-06 10:09 后再查/, "a 429 says both causes and when it checks again");
  assert.match(advanced(limited), /model_provider\.rate_limited/, "the raw check is in 高级's diagnostics, not in the rows");
  assert.doesNotMatch(before(limited), /model_provider\./);
});

test("ASC-62 a save whose check the service refuses is coded, writes nothing, and the page reads the provider's last check", { timeout: 60_000 }, async (t) => {
  const good = "stand-in-good-key-0123456789", wrong = "stand-in-wrong-key-0123456789", throttled = "stand-in-throttled-key-0123456789";
  const standIn = await startModelStandIn(good, "MOLIS_OK", { throttledKey: throttled });
  t.after(() => standIn.close());
  const root = await mkdtemp(path.join(tmpdir(), "molis-model-plan-a-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const controlToken = "model-plan-a-control-token-0123456789abcdef";
  const server: Server = createMolisWorkWebServer({ homeDirectory: path.join(root, "home"), controlToken });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const save = (apiKey: string) => fetch(`${origin}/api/settings/models/stand-in`, {
    method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() },
    body: JSON.stringify({ display_name: "Stand-in", base_url: standIn.baseUrl, api_format: "openai-chat-completions", enabled: true, prompt_cache: "off",
      models: [{ model_id: "stand-in-model", enabled: true }], api_key: apiKey, check_connection: true }),
  });
  const providers = async () => ((await (await fetch(`${origin}/api/settings/models`)).json()) as { providers: unknown[] }).providers;

  for (const [key, code] of [[wrong, "model_provider.key_rejected"], [throttled, "model_provider.rate_limited"]] as const) {
    const refused = await save(key);
    assert.equal(refused.status, 400);
    const body = await refused.json() as { error: string; code?: string };
    assert.equal(body.code, code, "the page is told why, so it can say it where it belongs");
    assert.match(body.error, /连接检查没有通过，所以没有保存/);
    assert.equal(body.error.includes(key), false, "the reason never quotes the key");
    assert.deepEqual(await providers(), [], "a refused check saves nothing");
  }
  const saved = await save(good);
  assert.equal(saved.status, 200);
  assert.equal(((await saved.json()) as { checked: boolean }).checked, true);
  const html = await (await fetch(`${origin}/settings/models?provider=stand-in`)).text();
  assert.match(html, /class="mw-card model-facts"/, "the saved provider reads as its four rows");
  assert.match(html, /连得上 · \d\d-\d\d \d\d:\d\d 检查/, "with the check the save just ran, and when");
  assert.match(html, /在你用的服务的控制台里找 API 密钥|data-model-connection/, "the key field says where to get a key, or offers the saved one");
  assert.equal(html.includes(good), false, "the key is nowhere in the page");
});
