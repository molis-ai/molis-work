import assert from "node:assert/strict";
import test from "node:test";

import {
  modelRequestShape,
  providerHealth,
  type ModelProviderRecord,
  type ModelProviderStatus,
} from "@molis-ai/molis-work-contracts/modules/model-providers";
import {
  formatContext,
  renderModelSettingsDocument,
  type ModelSettingsPrimitives,
} from "@molis-ai/molis-work-app-workbench";

const p: ModelSettingsPrimitives = {
  L: (text) => text,
  escape: (value) => String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  icon: (name) => `<i data-icon="${name}"></i>`,
};

function provider(overrides: Partial<ModelProviderRecord> = {}): ModelProviderRecord {
  return {
    provider_id: "minimax",
    display_name: "minimax",
    base_url: "https://api.minimaxi.com/anthropic",
    api_format: "anthropic-messages",
    credential_ref: "connector-connection:fixture:token",
    enabled: true,
    models: [{ model_id: "MiniMax-M3", context_tokens: 1_000_000, vision: true, enabled: true }],
    created_at: "2026-09-19T00:00:00Z",
    updated_at: "2026-09-19T00:00:00Z",
    ...overrides,
  };
}

/** 这两个地址是对着真实服务验证过的，别改坏。 */
test("两种格式的请求地址，就是真实跑通的那两个", () => {
  const anthropic = modelRequestShape(
    { base_url: "https://api.minimaxi.com/anthropic", api_format: "anthropic-messages" }, "k");
  assert.equal(anthropic.url, "https://api.minimaxi.com/anthropic/v1/messages");
  assert.equal(anthropic.headers["x-api-key"], "k");
  assert.equal(anthropic.headers["anthropic-version"], "2023-06-01");
  assert.equal(anthropic.headers.authorization, undefined, "Anthropic 用 x-api-key，不带 Bearer");

  const openai = modelRequestShape(
    { base_url: "https://api.minimaxi.com/v1", api_format: "openai-chat-completions" }, "k");
  assert.equal(openai.url, "https://api.minimaxi.com/v1/chat/completions");
  assert.equal(openai.headers.authorization, "Bearer k");
  assert.equal(openai.headers["x-api-key"], undefined);
});

test("Base URL 末尾的斜杠和已经写全的路径都不会被拼坏", () => {
  assert.equal(
    modelRequestShape({ base_url: "https://x.test/anthropic/", api_format: "anthropic-messages" }, "k").url,
    "https://x.test/anthropic/v1/messages");
  assert.equal(
    modelRequestShape({ base_url: "https://x.test/v1/messages", api_format: "anthropic-messages" }, "k").url,
    "https://x.test/v1/messages", "已经写到 /messages 就不再追加");
});

test("供应商状态分清「没填密钥」「关掉了」「没启用模型」", () => {
  assert.equal(providerHealth(provider(), true).status, "ready");
  assert.equal(providerHealth(provider(), false).status, "needs-credential");
  assert.equal(providerHealth(provider({ enabled: false }), true).status, "disabled");
  assert.equal(providerHealth(provider({ models: [] }), true).status, "no-models");
  // 密钥是问密钥库要的，不是记录里存的——记录说有而实际没有会导致显示一个跑不了的供应商
  assert.equal(providerHealth(provider(), false).detail, "还没有填 API Key");
});

test("模型设置只选择连接，不渲染密钥，并保留失效引用", () => {
  const withKey = renderModelSettingsDocument({
    templates: [],
    providers: [provider()],
    health: [providerHealth(provider(), true)],
    selected_provider_id: "minimax",
    connections: [{ connection_id: "saved-model-account", service_id: "model-api", display_name: "已保存账号", auth_method: "token", source: "managed", state: "connected", account_label: null }],
    selected_connection_ids: { minimax: "saved-model-account" },
    primitives: p,
  });
  assert.doesNotMatch(withKey, /type="password"[^>]*value=/);
  assert.match(withKey, /data-model-key-field hidden/);
  assert.match(withKey, /data-model-connection/);
  assert.match(withKey, /value="saved-model-account" selected>已保存账号/);
  assert.match(withKey, /在 Connectors 管理 API Key/);

  const withoutKey = renderModelSettingsDocument({
    templates: [],
    providers: [provider()],
    health: [providerHealth(provider(), false)],
    selected_provider_id: "minimax",
    primitives: p,
  });
  assert.match(withoutKey, /data-model-api-key/);
  assert.doesNotMatch(withoutKey, /请选择一条已保存的连接/);
  const unavailable = renderModelSettingsDocument({ templates: [], providers: [provider()], health: [providerHealth(provider(), false)],
    selected_provider_id: "minimax", primitives: p, selected_connection_ids: { minimax: "disconnected-account" },
    connections: [{ connection_id: "disconnected-account", service_id: "model-api", display_name: "原有账号", auth_method: "token", source: "managed", state: "disconnected", account_label: null }] });
  assert.match(unavailable, /value="disconnected-account" selected disabled>原有账号 · 连接不可用/);
  const missing = renderModelSettingsDocument({ templates: [], providers: [provider()], health: [], selected_provider_id: "minimax", primitives: p,
    selected_connection_ids: { minimax: "missing-account" } });
  assert.match(missing, /value="missing-account" selected disabled>原连接已不可用，请重新选择/);
  // 两种情况下都不该出现任何像密钥的 value
  for (const html of [withKey, withoutKey]) {
    assert.doesNotMatch(html, /data-model-api-key="[^"]*"\s+value=/, "密钥字段不能带 value");
  }
});

test("两种 API 格式都在下拉里，当前的被选中", () => {
  const html = renderModelSettingsDocument({
    templates: [],
    providers: [provider()],
    health: [providerHealth(provider(), true)],
    selected_provider_id: "minimax",
    primitives: p,
  });
  assert.match(html, /value="anthropic-messages" selected/);
  assert.match(html, /value="openai-chat-completions"(?! selected)/);
  assert.match(html, /OpenAI Chat Completions/);
});

test("上下文徽标只在知道的时候出现，不猜", () => {
  const known = renderModelSettingsDocument({
    templates: [],
    providers: [provider()],
    health: [providerHealth(provider(), true)], selected_provider_id: "minimax", primitives: p,
  });
  assert.match(known, /class="model-badge">1M</);
  assert.match(known, /视觉/);

  const unknown = renderModelSettingsDocument({
    templates: [],
    providers: [provider({ models: [{ model_id: "x", enabled: true }] })],
    health: [providerHealth(provider(), true)], selected_provider_id: "minimax", primitives: p,
  });
  assert.doesNotMatch(unknown, /class="model-badge"/, "不知道上下文就不画徽标");
});

test("上下文数字的写法", () => {
  assert.equal(formatContext(1_000_000), "1M");
  assert.equal(formatContext(200_000), "200K");
  assert.equal(formatContext(128_000), "128K");
  assert.equal(formatContext(512), "512");
});

test("供应商名字里的标记被转义", () => {
  const nasty = provider({ display_name: '<img src=x onerror="alert(1)">' });
  const html = renderModelSettingsDocument({
    templates: [],
    providers: [nasty], health: [providerHealth(nasty, true)],
    selected_provider_id: "minimax", primitives: p,
  });
  assert.equal(html.includes("<img src=x"), false);
  assert.match(html, /&lt;img src=x/);
});

test("一个供应商都没有时，右边是干净的空状态", () => {
  const html = renderModelSettingsDocument({
    templates: [],
    providers: [], health: [], selected_provider_id: null, primitives: p,
  });
  assert.match(html, /还没有配置供应商/);
  assert.match(html, /data-model-add-provider/, "空状态下仍要能添加");
});

test("供应商模板的选项来自页面数据：页面没有自己的目录，给什么画什么，缺什么的提示按页面数据里写的填充情况说", () => {
  const templates = [
    { template_id: "alpha", display_name: "Alpha", fills_base_url: true, fills_model: true },
    { template_id: "middle", display_name: "Middle", fills_base_url: true, fills_model: false },
    { template_id: "beta", display_name: "Beta 兼容", fills_base_url: false, fills_model: false },
  ];
  const choiceIds = (html: string) => [...html.matchAll(/data-model-template="([^"]+)"/g)].map((match) => match[1]);
  // The page fills `{name}` through the translator; the shared stub returns the key as is, so this test fills it.
  const filling: ModelSettingsPrimitives = { ...p, L: (text, values) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values?.[key] ?? "")) };
  const empty = renderModelSettingsDocument({ providers: [], health: [], selected_provider_id: null, templates, primitives: filling });
  assert.deepEqual(choiceIds(empty), ["alpha", "middle", "beta"], "空状态只画页面数据给的选项，一个不多，一个不少");
  assert.match(empty, /class="mw-choice__label">Beta 兼容</);
  assert.deepEqual(choiceIds(renderModelSettingsDocument({ providers: [], health: [], selected_provider_id: null, templates: [], primitives: filling })), [], "页面数据里没有就一个也不画");

  const draftOf = (draftTemplateId: string | null) => renderModelSettingsDocument({
    providers: [], health: [], selected_provider_id: null, templates, primitives: filling,
    draft_provider: provider({ provider_id: "draft-1", display_name: "草稿" }), draft_template_id: draftTemplateId,
  });
  assert.match(draftOf("alpha"), /Alpha 的地址、格式和模型已经填好，还差 API Key。/);
  assert.match(draftOf("middle"), /Middle 的地址和格式已经填好，还差 API Key 和模型 ID。/);
  assert.match(draftOf("beta"), /Beta 兼容 的格式已经选好，还差 Base URL、API Key 和模型 ID。/);
  assert.match(draftOf("beta"), /aria-pressed="true"[^>]*data-model-template="beta"/, "选中的那个亮着");
  const unknown = draftOf("not-offered");
  assert.doesNotMatch(unknown, /aria-pressed="true"[^>]*data-model-template=/, "页面数据里没有的模板不亮，也不写提示");
  assert.doesNotMatch(unknown, /model-field-note">[^<]*还差/);
});

test("RING-07 provider health uses readiness and credential states, not a success dot", () => {
  const cases: Array<[ModelProviderStatus, string]> = [["ready", "ready"], ["needs-credential", "reauth"],
    ["credential-unavailable", "unavailable"], ["no-models", "unavailable"], ["disabled", "disabled"]];
  for (const [status, expected] of cases) {
    const html = renderModelSettingsDocument({ templates: [], providers: [provider()],
      health: [{ ...providerHealth(provider(), true), status, detail: "连接状态说明" }], selected_provider_id: "minimax", primitives: p });
    assert.match(html, new RegExp(`data-mw-state="${expected}"`));
    assert.match(html, /title="连接状态说明"/);
    assert.doesNotMatch(html, /data-icon="dot"/);
  }
});
