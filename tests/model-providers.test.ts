import assert from "node:assert/strict";
import test from "node:test";

import {
  modelRequestShape,
  providerHealth,
  type ModelProviderRecord,
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
    credential_ref: "model-provider:minimax",
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

test("设置页从不渲染 API Key，只说有没有", () => {
  const withKey = renderModelSettingsDocument({
    providers: [provider()],
    health: [providerHealth(provider(), true)],
    selected_provider_id: "minimax",
    primitives: p,
  });
  assert.match(withKey, /type="password"/);
  assert.match(withKey, /已保存，留空则不改动/);

  const withoutKey = renderModelSettingsDocument({
    providers: [provider()],
    health: [providerHealth(provider(), false)],
    selected_provider_id: "minimax",
    primitives: p,
  });
  assert.match(withoutKey, /还没有填 API Key，这个供应商用不了/);
  // 两种情况下都不该出现任何像密钥的 value
  for (const html of [withKey, withoutKey]) {
    assert.doesNotMatch(html, /data-model-api-key="[^"]*"\s+value=/, "密钥字段不能带 value");
  }
});

test("两种 API 格式都在下拉里，当前的被选中", () => {
  const html = renderModelSettingsDocument({
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
    providers: [provider()],
    health: [providerHealth(provider(), true)], selected_provider_id: "minimax", primitives: p,
  });
  assert.match(known, /class="model-badge">1M</);
  assert.match(known, /视觉/);

  const unknown = renderModelSettingsDocument({
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
    providers: [nasty], health: [providerHealth(nasty, true)],
    selected_provider_id: "minimax", primitives: p,
  });
  assert.equal(html.includes("<img src=x"), false);
  assert.match(html, /&lt;img src=x/);
});

test("一个供应商都没有时，右边是干净的空状态", () => {
  const html = renderModelSettingsDocument({
    providers: [], health: [], selected_provider_id: null, primitives: p,
  });
  assert.match(html, /还没有配置供应商/);
  assert.match(html, /data-model-add-provider/, "空状态下仍要能添加");
});
