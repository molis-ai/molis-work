import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { MODEL_PROVIDER_TEMPLATES, modelProviderTemplate } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";

/**
 * First-time model setup, through the production routes: the templates the settings page offers, and the one connectivity
 * check a save runs. The provider is a stand-in on 127.0.0.1 that the Host's real check (the Prologue path a Run takes)
 * talks to; nothing here reaches the internet.
 */

const controlToken = "model-first-setup-control-token-0123456789abcdef";
const goodKey = "stand-in-good-key-0123456789";
const wrongKey = "stand-in-wrong-key-0123456789";

interface SettingsList { providers: { provider_id: string; display_name: string; models: { model_id: string }[] }[]; health: { provider_id: string; status: string }[] }

async function withHost(run: (host: {
  origin: string;
  root: string;
  html(search: string, locale?: string): Promise<string>;
  save(id: string, body: Record<string, unknown>): Promise<{ status: number; text: string; json: Record<string, unknown> }>;
  providers(): Promise<SettingsList>;
  connections(): Promise<{ connection_id: string }[]>;
}) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), "molis-first-model-"));
  const server: Server = createMolisWorkWebServer({ homeDirectory: path.join(root, "home"), controlToken });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    await run({
      origin, root,
      html: async (search, locale) => (await fetch(`${origin}/settings/models${search}`, { headers: locale ? { cookie: `molis_work_locale=${locale}` } : {} })).text(),
      save: async (id, body) => {
        const response = await fetch(`${origin}/api/settings/models/${id}`, {
          method: "POST",
          headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(), "x-molis-work-control-token": controlToken },
          body: JSON.stringify(body),
        });
        const text = await response.text();
        return { status: response.status, text, json: JSON.parse(text) as Record<string, unknown> };
      },
      providers: async () => (await (await fetch(`${origin}/api/settings/models`)).json()) as SettingsList,
      connections: async () => ((await (await fetch(`${origin}/api/settings/connectors/connections?service_id=model-api`)).json()) as { connections: { connection_id: string }[] }).connections,
    });
  } finally {
    await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); });
    await rm(root, { recursive: true, force: true });
  }
}

const form = (baseUrl: string, models: { model_id: string; enabled: boolean }[], extra: Record<string, unknown> = {}) => ({
  display_name: "测试供应商", base_url: baseUrl, api_format: "openai-chat-completions", enabled: true, prompt_cache: "off", models, ...extra,
});

test("没有模型时设置页给出一键模板；模板只预填地址、格式和稳定的模型名，不带密钥", async () => {
  await withHost(async ({ html }) => {
    const empty = await html("");
    for (const template of MODEL_PROVIDER_TEMPLATES) assert.match(empty, new RegExp(`data-model-template="${template.template_id}"`), template.template_id);
    assert.equal((empty.match(/data-model-template=/g) ?? []).length, MODEL_PROVIDER_TEMPLATES.length, "每个模板一个按钮，没有别的");
    assert.match(empty, /data-model-add-provider/, "空状态下仍可以手填一个");
    assert.match(empty, /还没有配置供应商/);
    assert.ok(MODEL_PROVIDER_TEMPLATES.some((t) => t.api_format === "anthropic-messages") && MODEL_PROVIDER_TEMPLATES.some((t) => t.api_format === "openai-chat-completions"), "Prologue 支持的两种格式都有模板");
    // 模板只写供应商现行文档列出的名字和地址：停用的名字在一键流程里要到保存时才被发现，太晚。
    const retired = new Set(["deepseek-chat", "deepseek-reasoner"]);
    for (const template of MODEL_PROVIDER_TEMPLATES) {
      for (const id of template.model_ids) assert.ok(!retired.has(id), `${template.template_id}: ${id} 已被供应商停用`);
      assert.match(template.base_url, /^(https:\/\/[^/]+(\/.*[^/])?)?$/, `${template.template_id}: https，末尾没有斜杠`);
    }
    assert.equal(modelProviderTemplate("minimax")?.base_url, "https://api.minimax.cn/anthropic", "MiniMax 国内端点按它自己现行文档写");
    // 预填的模型名只有供应商文档当作现行名字列出的才留（2026-10-09 核对）：通义千问的文档只把 qwen-plus 当示例和系列名，
    // 现行列表是带版本号的名字，所以那一行留空让人填。新增一个预填名要先对照文档，再改这张表。
    assert.deepEqual(Object.fromEntries(MODEL_PROVIDER_TEMPLATES.filter((t) => t.model_ids.length > 0).map((t) => [t.template_id, [...t.model_ids]])),
      { deepseek: ["deepseek-flash"], minimax: ["MiniMax-M3"] });

    const deepseek = await html("?new=1&template=deepseek");
    assert.match(deepseek, /data-model-base-url="deepseek-[0-9a-f]{8}"/, "模板每次换一个新 id，选两次不会覆盖已有的供应商");
    assert.match(deepseek, /value="https:\/\/api\.deepseek\.com"/);
    assert.match(deepseek, /value="openai-chat-completions" selected/);
    assert.match(deepseek, /data-model-id value="deepseek-flash"/);
    assert.match(deepseek, /aria-pressed="true"[^>]*data-model-template="deepseek"/, "选中的模板亮着");
    assert.equal((deepseek.match(/aria-pressed="true"[^>]*data-model-template=/g) ?? []).length, 1);
    assert.match(deepseek, /还差 API Key。/);
    assert.doesNotMatch(deepseek, /type="password"[^>]*value=/, "密钥框是空的");
    const again = await html("?new=1&template=deepseek");
    assert.notEqual(deepseek.match(/data-model-base-url="([^"]+)"/)?.[1], again.match(/data-model-base-url="([^"]+)"/)?.[1]);

    const anthropic = await html("?new=1&template=anthropic");
    assert.match(anthropic, /value="anthropic-messages" selected/);
    assert.match(anthropic, /data-model-id value=""/, "没有稳定模型名的模板留一行空的，让缺的东西看得见");
    assert.match(anthropic, /还差 API Key 和模型 ID。/);

    const generic = await html("?new=1&template=openai-compatible");
    assert.match(generic, /value="" data-model-base-url="openai-compatible-[0-9a-f]{8}"/, "通用格式不带地址");
    assert.match(generic, /还差 Base URL、API Key 和模型 ID。/);

    const unknown = await html("?new=1&template=nope");
    assert.doesNotMatch(unknown, /aria-pressed="true"[^>]*data-model-template=/, "不认识的模板按空白表单打开，不报错");
    assert.match(unknown, /data-model-base-url="custom-/);

    const english = await html("?new=1&template=deepseek", "en");
    assert.match(english, /address, format and model are filled in\. Still needed: API key\./);
    assert.match(english, /Start from a common provider/);
  });
});

test("每个模板都是一份存得下的供应商配置", async () => {
  await withHost(async ({ save, providers }) => {
    for (const template of MODEL_PROVIDER_TEMPLATES) {
      assert.equal(modelProviderTemplate(template.template_id), template);
      assert.match(template.template_id, /^[a-z][a-z0-9-]*$/);
      assert.ok(template.base_url === "" || template.base_url.startsWith("https://"), `${template.template_id}：只用 HTTPS 地址`);
      if (template.base_url === "") continue;
      const saved = await save(`${template.template_id}-fixture`, form(template.base_url, template.model_ids.map((model_id) => ({ model_id, enabled: true })), {
        api_format: template.api_format, api_key: "template-fixture-key-0123456789",
      }));
      assert.equal(saved.status, 200, `${template.template_id}：${saved.text}`);
    }
    const named = MODEL_PROVIDER_TEMPLATES.filter((t) => t.base_url !== "");
    assert.equal((await providers()).providers.length, named.length);
    assert.equal(new Set(MODEL_PROVIDER_TEMPLATES.map((t) => t.template_id)).size, MODEL_PROVIDER_TEMPLATES.length, "模板 id 不重复");
    assert.equal(new Set(named.map((t) => t.base_url)).size, named.length, "一个地址一个模板");
  });
});

test("保存时检查连接：没通过什么都不留；通过才保存，并告诉页面这是第一个能用的模型", async () => {
  const standIn = await startModelStandIn(goodKey);
  try {
    await withHost(async ({ save, providers, connections, root }) => {
      const models = [{ model_id: "stand-in-model", enabled: true }];
      // The key the provider rejects: a reason the person can act on, and nothing saved as working.
      const failed = await save("first", form(standIn.baseUrl, models, { api_key: wrongKey, check_connection: true }));
      assert.equal(failed.status, 400);
      const message = String(failed.json.error);
      assert.match(message, /连接检查没有通过，所以没有保存/);
      assert.match(message, /服务拒绝了这个 API Key（401）/);
      assert.match(message, /填写的内容还在/);
      assert.equal(failed.text.includes(wrongKey), false, "错误里不带密钥");
      assert.deepEqual((await providers()).providers, [], "供应商没有保存");
      assert.deepEqual(await connections(), [], "输入的密钥没有变成连接");
      const secretsFile = path.join(root, "home/feed/secrets.json");
      assert.equal((await readFile(secretsFile, "utf8").catch(() => "")).includes(wrongKey), false, "密钥没有落到密钥库");
      assert.equal(standIn.requests.length, 1, "只检查一次");
      assert.equal(standIn.requests[0]!.model, "stand-in-model");
      assert.equal(standIn.requests[0]!.offeredKey, wrongKey, "检查用的就是输入框里的密钥");

      // The right key: saved, and this is the first provider that can run.
      const passed = await save("first", form(standIn.baseUrl, models, { api_key: goodKey, check_connection: true }));
      assert.equal(passed.status, 200, passed.text);
      assert.equal(passed.json.checked, true);
      assert.equal(passed.json.first_model_ready, true);
      assert.equal(passed.text.includes(goodKey), false, "响应里不带密钥");
      const saved = await providers();
      assert.equal(saved.health.find((entry) => entry.provider_id === "first")?.status, "ready");
      assert.equal((await connections()).length, 1);
      assert.equal(standIn.requests.length, 2);

      // A second provider is not "the first": the page does not take anyone anywhere.
      const second = await save("second", form(standIn.baseUrl, models, { api_key: goodKey, check_connection: true }));
      assert.equal(second.status, 200, second.text);
      assert.equal(second.json.first_model_ready, false);
      assert.equal(second.json.checked, true);
    });
  } finally { await standIn.close(); }
});

test("检查只在到达供应商的方式变了的时候做：改名、关掉一个模型不联网；新加或重新打开一个模型只试那一个", async () => {
  const standIn = await startModelStandIn(goodKey);
  try {
    await withHost(async ({ save, providers }) => {
      const base = form(standIn.baseUrl, [{ model_id: "model-a", enabled: true }], { api_key: goodKey, check_connection: true });
      assert.equal((await save("p", base)).status, 200);
      assert.equal(standIn.requests.length, 1);

      const renamed = await save("p", { ...base, api_key: undefined, display_name: "改了名字" });
      assert.equal(renamed.status, 200, renamed.text);
      assert.equal(renamed.json.checked, false);
      assert.equal(standIn.requests.length, 1, "只改名字，不联网");

      const both = await save("p", { ...base, api_key: undefined, display_name: "改了名字", models: [{ model_id: "model-a", enabled: true }, { model_id: "model-b", enabled: true }] });
      assert.equal(both.status, 200, both.text);
      assert.equal(both.json.checked, true);
      assert.equal(standIn.requests.length, 2);
      assert.equal(standIn.requests[1]!.model, "model-b", "只试新加的那个");
      assert.equal(standIn.requests[1]!.offeredKey, goodKey, "没填新密钥时用已保存的那把");

      // 开关一个模型：关掉不联网；再打开，它就是新启用的那个，只试它。
      const twoModels = (second: boolean) => [{ model_id: "model-a", enabled: true }, { model_id: "model-b", enabled: second }];
      const modelOff = await save("p", { ...base, api_key: undefined, models: twoModels(false) });
      assert.equal(modelOff.status, 200, modelOff.text);
      assert.equal(modelOff.json.checked, false, "关掉一个模型，不联网");
      assert.equal(standIn.requests.length, 2);
      const modelOn = await save("p", { ...base, api_key: undefined, models: twoModels(true) });
      assert.equal(modelOn.status, 200, modelOn.text);
      assert.equal(modelOn.json.checked, true, "重新打开一个模型，它是新启用的，要检查");
      assert.equal(standIn.requests.length, 3);
      assert.equal(standIn.requests[2]!.model, "model-b", "只试重新打开的那个");

      const off = await save("p", { ...base, api_key: undefined, enabled: false });
      assert.equal(off.json.checked, false, "关掉的供应商不检查");
      const on = await save("p", { ...base, api_key: undefined, enabled: true });
      assert.equal(on.json.checked, true, "重新打开等于重新开始用，要检查");
      assert.equal(standIn.requests.length, 4);
      assert.equal((await providers()).providers.length, 1);
    });
  } finally { await standIn.close(); }
});

test("检查之前先看连接绑定的地址：换了地址，已保存的密钥不会发过去", async () => {
  const pinned = await startModelStandIn(goodKey);
  const other = await startModelStandIn(goodKey);
  try {
    await withHost(async ({ save, providers, connections }) => {
      const models = [{ model_id: "m", enabled: true }];
      assert.equal((await save("p", form(pinned.baseUrl, models, { api_key: goodKey, check_connection: true }))).status, 200);
      const connectionId = (await connections())[0]!.connection_id;
      const moved = await save("p", form(other.baseUrl, models, { connection_id: connectionId, check_connection: true }));
      assert.equal(moved.status, 400);
      assert.match(String(moved.json.error), /已绑定|bound/);
      assert.equal(other.requests.length, 0, "没有任何请求到过新地址");
      assert.equal((await providers()).providers[0]!.provider_id, "p");
      // The pin is still the old address: a refused save did not move it.
      assert.equal((await save("p", form(pinned.baseUrl, models, { connection_id: connectionId, display_name: "原地址", check_connection: true }))).status, 200);
    });
  } finally { await pinned.close(); await other.close(); }
});

test("连不上、没填模型 ID、没要求检查：各自的结果", async () => {
  const closed = createServer();
  await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
  const closedPort = (closed.address() as { port: number }).port;
  await new Promise<void>((resolve) => closed.close(() => resolve()));
  const standIn = await startModelStandIn(goodKey);
  try {
    await withHost(async ({ save, providers }) => {
      const refused = await save("p", form(`http://127.0.0.1:${closedPort}/v1`, [{ model_id: "m", enabled: true }], { api_key: goodKey, check_connection: true }));
      assert.equal(refused.status, 400);
      assert.match(String(refused.json.error), /连不上这个地址：对方没有在监听/);

      const blank = await save("p", form(standIn.baseUrl, [{ model_id: "  ", enabled: true }], { api_key: goodKey, check_connection: true }));
      assert.equal(blank.status, 400);
      assert.match(String(blank.json.error), /请填写模型 ID/);

      const none = await save("p", form(standIn.baseUrl, [], { api_key: goodKey, check_connection: true }));
      assert.equal(none.status, 400);
      assert.match(String(none.json.error), /先添加一个模型 ID/);

      assert.deepEqual((await providers()).providers, [], "以上都没有留下供应商");
      assert.equal(standIn.requests.length, 0, "没填模型 ID 时不联网");

      // Callers that only store a provider (no page) are unchanged: no network, saved as before.
      const stored = await save("api-caller", form("https://provider.invalid/v1", [{ model_id: "m", enabled: true }], { api_key: goodKey }));
      assert.equal(stored.status, 200, stored.text);
      assert.equal(stored.json.checked, false);
      assert.equal(stored.json.first_model_ready, true, "没有检查也照实说这是第一个能用的");
      assert.equal(standIn.requests.length, 0);
    });
  } finally { await standIn.close(); }
});

test("没有连接的供应商不能借检查把旧密钥发到新地址：改了地址就要重新填 API Key，没有任何请求发出", async () => {
  const pinned = await startModelStandIn(goodKey);
  const other = await startModelStandIn(goodKey);
  try {
    await withHost(async ({ save, providers, connections, root }) => {
      // A provider from before connections: its key sits under its own reference and no connection holds it.
      const home = path.join(root, "home");
      const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
      const { runWithMolisWorkHome, createFileSecretStore } = await import("@molis-ai/molis-work-storage");
      await runWithMolisWorkHome(home, () => withMolisWorkProjectCatalog({ homeDirectory: home }, (catalog) => {
        createFileSecretStore().put("legacy-slot-key", goodKey);
        catalog.models.upsert({ credential_ref: "legacy-slot-key", provider_id: "legacy", display_name: "旧供应商", base_url: pinned.baseUrl,
          api_format: "openai-chat-completions", models: [{ model_id: "m", enabled: true }] });
      }));
      assert.deepEqual(await connections(), [], "the provider has no connection");
      const models = [{ model_id: "m", enabled: true }];

      // The address changes and no key is typed: the old key is not read, not sent, and the form says what to do.
      const moved = await save("legacy", form(other.baseUrl, models, { check_connection: true }));
      assert.equal(moved.status, 400);
      assert.match(String(moved.json.error), /读不到已保存的密钥，请重新填写 API Key/);
      assert.equal(moved.text.includes(goodKey), false);
      assert.equal(other.requests.length, 0, "nothing reached the newly typed address");
      assert.equal(pinned.requests.length, 0, "nothing reached the old address either");
      const unchanged = (await providers()).providers.find((entry) => entry.provider_id === "legacy");
      assert.ok(unchanged);

      // Adding a model needs a check too, and a check needs a key that a connection holds.
      const extra = await save("legacy", form(pinned.baseUrl, [...models, { model_id: "m2", enabled: true }], { check_connection: true }));
      assert.equal(extra.status, 400);
      assert.equal(pinned.requests.length, 0);

      // Nothing about reaching the provider changed: a rename saves without a request, as before.
      const renamed = await save("legacy", form(pinned.baseUrl, models, { display_name: "改了名字", check_connection: true }));
      assert.equal(renamed.status, 200, renamed.text);
      assert.equal(renamed.json.checked, false);
      assert.equal(pinned.requests.length, 0);

      // Typing the key again is the way through: it becomes a connection pinned to the address it was checked against.
      const retyped = await save("legacy", form(other.baseUrl, models, { api_key: goodKey, check_connection: true }));
      assert.equal(retyped.status, 200, retyped.text);
      assert.equal(retyped.json.checked, true);
      assert.equal(other.requests.length, 1);
      assert.equal(other.requests[0]!.offeredKey, goodKey);
      assert.equal(withConnectorConnections(home, (store) => store.list("model-api").length), 1);
    });
  } finally { await pinned.close(); await other.close(); }
});

test("模板的名字也是界面文字：中文界面给中文名，英文界面给英文名，存下来的供应商名跟着当时的界面", async () => {
  await withHost(async ({ html }) => {
    const han = /\p{Script=Han}/u;
    const named = MODEL_PROVIDER_TEMPLATES.filter((template) => han.test(template.display_name));
    assert.deepEqual(named.map((template) => template.template_id).sort(), ["anthropic-compatible", "glm", "kimi", "openai-compatible", "qwen"],
      "the names that carry Chinese are the ones that are not brand names alone");
    const choiceLabels = (page: string) => [...page.matchAll(/<span class="mw-choice__label">([^<]*)<\/span>/g)].map((match) => match[1]!);
    const zh = await html("");
    const en = await html("", "en");
    assert.deepEqual(choiceLabels(zh), MODEL_PROVIDER_TEMPLATES.map((template) => template.display_name), "Chinese UI: every choice carries its own Chinese or brand name");
    assert.equal(choiceLabels(en).some((label) => han.test(label)), false, "English UI: no choice label is left in Chinese");
    for (const label of ["Anthropic-compatible", "OpenAI-compatible", "Qwen (Alibaba Cloud)", "Kimi (Moonshot)", "GLM (Zhipu)"]) assert.ok(choiceLabels(en).includes(label), label);
    assert.ok(choiceLabels(zh).includes("Anthropic 兼容") && choiceLabels(zh).includes("OpenAI 兼容"));
    assert.equal(choiceLabels(zh).some((label) => /-compatible|\(/.test(label)), false, "no English-only label in the Chinese UI");

    for (const template of MODEL_PROVIDER_TEMPLATES) {
      const inZh = await html(`?new=1&template=${template.template_id}`);
      const inEn = await html(`?new=1&template=${template.template_id}`, "en");
      const savedName = (page: string) => /data-model-name value="([^"]*)"/.exec(page)?.[1];
      assert.equal(savedName(inZh), template.display_name, `${template.template_id}: the name saved in the Chinese UI`);
      assert.equal(han.test(savedName(inEn) ?? ""), false, `${template.template_id}: the name saved in the English UI is English`);
      assert.match(inEn, /Still needed:/, `${template.template_id}: the note is English`);
    }
    assert.match(await html("?new=1&template=anthropic-compatible"), /Anthropic 兼容 的格式已经选好，还差 Base URL、API Key 和模型 ID。/);
    assert.match(await html("?new=1&template=anthropic-compatible", "en"), /Anthropic-compatible: the format is chosen\. Still needed: Base URL, API key and model ID\./);
    assert.match(await html("?new=1"), /data-model-name value="新供应商"/);
    assert.match(await html("?new=1", "en"), /data-model-name value="New provider"/);
  });
});

test("英文界面里，检查失败的原因也是英文", async () => {
  const standIn = await startModelStandIn(goodKey);
  try {
    await withHost(async ({ origin }) => {
      const response = await fetch(`${origin}/api/settings/models/p`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", cookie: "molis_work_locale=en", "x-molis-work-idempotency-key": randomUUID(), "x-molis-work-control-token": controlToken },
        body: JSON.stringify(form(standIn.baseUrl, [{ model_id: "m", enabled: true }], { api_key: wrongKey, check_connection: true })),
      });
      assert.equal(response.status, 400);
      const { error } = await response.json() as { error: string };
      assert.match(error, /The connection check did not pass, so nothing was saved\. The service rejected this API key \(401\)/);
    });
  } finally { await standIn.close(); }
});
