import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { INTERACTION_TEXTURE_STYLES } from "@molis-ai/molis-work-design-system";
import { createFileSecretStore, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { renderMolisWorkSettings, renderMolisWorkWorkbenchClientScript } from "./workbench-renderer-fixture.js";
import { renderSettingsDirectorySection } from "../apps/workbench/src/settings-directory.ts";
import {
  FUNCTIONS_CREDENTIAL_REF,
} from "@molis-ai/molis-work-contracts/modules/functions";
import {
  FunctionsError,
  FunctionsPluginRouteTable,
  createFunctionsRouteHandlers,
  createFunctionsService,
  functionsRouteErrorResponse,
  functionsSettingsUiContribution,
  functionsUiContribution,
  hashChoiceConfig,
  openFunctionsStore,
  readChoiceAnswer,
  renderFunctionsSettings,
  renderFunctionsWorkbench,
  type FunctionsSecretPort,
  type TypeSafeProvider,
} from "@molis-ai/molis-work-plugin-functions";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { WORKBENCH_UI_SLOTS } from "../apps/workbench/src/ui-composition.ts";

const primitives = {
  escape: (value: unknown) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;"),
  text: (value: string) => value,
};

function memorySecrets(initial: Record<string, string> = {}): FunctionsSecretPort {
  const map = new Map(Object.entries(initial));
  return {
    put(ref, value) { map.set(ref, value); },
    get(ref) { return map.get(ref) ?? null; },
    delete(ref) { map.delete(ref); },
  };
}

function fixtureProvider(result: { choice: string | null } = { choice: "yes" }, calls: { count: number } = { count: 0 }): TypeSafeProvider {
  return {
    async evaluate() {
      calls.count += 1;
      return { choice: result.choice, probabilities: { yes: 0.9, no: 0.1 }, confidence: 0.8, model: "jev-1.13.0" };
    },
  };
}

async function withHome<T>(run: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "molis-work-functions-"));
  try {
    return await run(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

test("config hash ignores criteria order and changes when instructions change", () => {
  const left = hashChoiceConfig({
    instructions: "Route this.",
    criteria: [{ key: "billing", description: "money" }, { key: "other", description: "else" }],
  });
  const right = hashChoiceConfig({
    instructions: "Route this.",
    criteria: [{ key: "other", description: "else" }, { key: "billing", description: "money" }],
  });
  assert.equal(left, right);
  assert.notEqual(left, hashChoiceConfig({
    instructions: "Route that.",
    criteria: [{ key: "billing", description: "money" }, { key: "other", description: "else" }],
  }));
});

test("a draft Choice can be saved with empty instructions, then published only after a matching preview", async () => {
  await withHome(async (home) => {
    const store = openFunctionsStore(home);
    const created = store.createChoice({ name: "账单分流" });
    assert.equal(created.status, "draft");
    assert.equal(created.version, null);
    assert.match(created.function_key, /^fn_|[a-z]/);
    const updated = store.updateDraft(created.id, {
      instructions: "这是账单吗？",
      criteria: [
        { key: "billing", description: "钱、发票、退款" },
        { key: "other", description: "其他" },
      ],
    });
    assert.equal(updated.instructions, "这是账单吗？");
    assert.equal(updated.last_preview, null);
    assert.throws(() => store.publish(created.id), (error: unknown) => (
      error instanceof FunctionsError && error.code === "functions.preview_required"
    ));
    const previewed = store.savePreview(created.id, {
      input: "请退款",
      outcome: "selected",
      choice: "billing",
      probabilities: { billing: 0.9, other: 0.1 },
      confidence: 0.8,
      model: "jev-1.13.0",
      config_hash: updated.config_hash,
      at: "2026-09-20T00:00:00.000Z",
    });
    const published = store.publish(previewed.id);
    assert.equal(published.status, "published");
    assert.equal(published.version, 1);
    assert.throws(() => store.updateDraft(published.id, { name: "改名" }), (error: unknown) => (
      error instanceof FunctionsError && error.code === "functions.published_immutable"
    ));
    store.close();
    const reopenedStore = openFunctionsStore(home);
    try {
      const reopened = reopenedStore.get(created.id);
      assert.equal(reopened?.status, "published");
      assert.equal(reopened?.function_key, updated.function_key);
    } finally {
      reopenedStore.close();
    }
  });
});

test("preview uses the injected provider once, stores last_preview, and does not retry", async () => {
  await withHome(async (home) => {
    const calls = { count: 0 };
    const secrets = memorySecrets();
    secrets.put(FUNCTIONS_CREDENTIAL_REF, "sk-test");
    const store = openFunctionsStore(home);
    const service = createFunctionsService({
      store,
      secrets,
      provider: fixtureProvider({ choice: "yes" }, calls),
    });
    try {
      const created = service.createChoice({ name: "urgent" });
      service.updateDraft(created.id, {
        instructions: "急吗？",
        criteria: [
          { key: "yes", description: "急" },
          { key: "no", description: "不急" },
        ],
      });
      const previewed = await service.preview(created.id, "三天没人回");
      assert.equal(calls.count, 1);
      assert.equal(previewed.last_preview?.outcome, "selected");
      assert.equal(previewed.last_preview?.choice, "yes");
      assert.equal(previewed.last_preview?.input, "三天没人回");
      const published = service.publish(created.id);
      assert.equal(published.version, 1);
    } finally {
      store.close();
    }
  });
});

test("preview without a key is a configured-state, not a TypeSafe call", async () => {
  await withHome(async (home) => {
    const calls = { count: 0 };
    const service = createFunctionsService({
      store: openFunctionsStore(home),
      secrets: memorySecrets(),
      provider: fixtureProvider({ choice: "yes" }, calls),
    });
    const created = service.createChoice({ name: "urgent" });
    service.updateDraft(created.id, {
      instructions: "急吗？",
      criteria: [{ key: "yes", description: "急" }, { key: "no", description: "不急" }],
    });
    await assert.rejects(() => service.preview(created.id, "hello"), (error: unknown) => (
      error instanceof FunctionsError && error.code === "functions.provider_not_configured"
    ));
    assert.equal(calls.count, 0);
    assert.deepEqual(service.settingsStatus(), { has_credential: false, source: "none" });
  });
});

test("changing instructions invalidates the previous preview", async () => {
  await withHome(async (home) => {
    const secrets = memorySecrets({ [FUNCTIONS_CREDENTIAL_REF]: "sk-test" });
    const service = createFunctionsService({
      store: openFunctionsStore(home),
      secrets,
      provider: fixtureProvider(),
    });
    const created = service.createChoice({ name: "route" });
    service.updateDraft(created.id, {
      instructions: "第一版",
      criteria: [{ key: "yes", description: "是" }, { key: "no", description: "否" }],
    });
    await service.preview(created.id, "input");
    const changed = service.updateDraft(created.id, { instructions: "第二版" });
    assert.equal(changed.last_preview, null);
    assert.throws(() => service.publish(created.id), (error: unknown) => (
      error instanceof FunctionsError && error.code === "functions.preview_required"
    ));
  });
});

test("TYPESAFE_API_KEY wins over the stored secret and settings JSON never includes the key", async () => {
  await withHome(async (home) => {
    const secrets = memorySecrets({ [FUNCTIONS_CREDENTIAL_REF]: "sk-stored" });
    const service = createFunctionsService({
      store: openFunctionsStore(home),
      secrets,
      env: { TYPESAFE_API_KEY: "sk-env" },
    });
    const status = service.settingsStatus();
    assert.deepEqual(status, { has_credential: true, source: "env" });
    assert.equal("api_key" in status, false);
    const html = renderFunctionsSettings({ settings: status, primitives });
    assert.match(html, /data-functions-settings/);
    assert.match(html, /disabled/);
    assert.doesNotMatch(html, /sk-env|sk-stored/);
  });
});

test("route table lists, previews, publishes, and maps missing functions to 404", async () => {
  await withHome(async (home) => {
    const service = createFunctionsService({
      store: openFunctionsStore(home),
      secrets: memorySecrets({ [FUNCTIONS_CREDENTIAL_REF]: "sk-test" }),
      provider: fixtureProvider({ choice: null }),
    });
    const routes = new FunctionsPluginRouteTable(createFunctionsRouteHandlers(service));
    const created = await routes.handle({ method: "POST", pathname: "/api/functions", query: new URLSearchParams(), body: { name: "复核" } });
    assert.equal(created?.status, 200);
    const id = (created?.body as { function: { id: string } }).function.id;
    await routes.handle({
      method: "POST",
      pathname: `/api/functions/${id}`,
      query: new URLSearchParams(),
      body: {
        instructions: "要不要人看？",
        criteria: [{ key: "yes", description: "要" }, { key: "no", description: "不要" }],
      },
    });
    const preview = await routes.handle({
      method: "POST",
      pathname: `/api/functions/${id}/preview`,
      query: new URLSearchParams(),
      body: { input: "unclear" },
    });
    assert.equal((preview?.body as { function: { last_preview: { outcome: string } } }).function.last_preview.outcome, "needs_review");
    const published = await routes.handle({
      method: "POST",
      pathname: `/api/functions/${id}/publish`,
      query: new URLSearchParams(),
      body: {},
    });
    assert.equal((published?.body as { function: { status: string } }).function.status, "published");
    const missing = functionsRouteErrorResponse(new FunctionsError("functions.not_found", "函数不存在"));
    assert.equal(missing.status, 404);
    const settings = await routes.handle({
      method: "GET",
      pathname: "/api/functions/settings",
      query: new URLSearchParams(),
      body: {},
    });
    assert.deepEqual(settings?.body, { has_credential: true, source: "ui" });
    assert.equal(JSON.stringify(settings?.body).includes("sk-test"), false);
  });
});

test("TypeSafe choice answers with a null pick are needs_review, not a thrown error", () => {
  const result = readChoiceAnswer({
    model: "jev-1.13.0",
    answers: { ticket_route: { type: "choice", choice: null, probabilities: { a: 0.5, b: 0.5 } } },
  }, "ticket_route");
  assert.equal(result.choice, null);
  assert.equal(result.model, "jev-1.13.0");
});

test("workbench client script with the Functions factory is valid JavaScript", () => {
  assert.doesNotThrow(() => new Function(renderMolisWorkWorkbenchClientScript()));
});

test("Functions workbench and settings contributions mount on the declared slots", () => {
  const host = new UiHost();
  host.register(functionsUiContribution);
  host.register(functionsSettingsUiContribution);
  const stage = host.mount({
    slot: WORKBENCH_UI_SLOTS.main,
    contribution: {
      contribution_id: functionsUiContribution.descriptor.contribution_id,
      surface: "workbench",
      model: { functions: [], primitives },
    },
  }).html;
  assert.match(stage, /data-functions="workbench"/);
  assert.match(stage, /data-functions-new/);
  assert.match(renderFunctionsWorkbench({ functions: [], primitives }), /还没有判断函数/);
  const settings = host.mount({
    slot: WORKBENCH_UI_SLOTS.settings,
    contribution: {
      contribution_id: functionsSettingsUiContribution.descriptor.contribution_id,
      surface: "settings",
      model: { settings: { has_credential: false, source: "none" }, primitives },
    },
  }).html;
  assert.match(settings, /data-functions-settings/);
  assert.doesNotMatch(settings, /Gmail|Inbox|AI 与执行工具/);
  assert.match(INTERACTION_TEXTURE_STYLES, /data-settings-section="functions"/);
  const directory = renderSettingsDirectorySection({
    L: (text) => text,
    escapeHtml: (value) => String(value ?? ""),
    icon: () => "",
    htmlLang: () => "zh-CN",
  });
  assert.match(directory, /data-settings-section="functions"/);
});

test("catalog HTTP saves a TypeSafe key without echoing it and keeps Functions off the model-provider page", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-functions-http-"));
  const previous = {
    home: process.env.MOLIS_WORK_HOME,
    backend: process.env.MOLIS_WORK_SECRET_BACKEND,
    key: process.env.MOLIS_WORK_ENCRYPTION_KEY,
    typesafe: process.env.TYPESAFE_API_KEY,
  };
  process.env.MOLIS_WORK_HOME = homeDirectory;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  process.env.MOLIS_WORK_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  delete process.env.TYPESAFE_API_KEY;
  resetSecretStoreCache();
  const token = "functions-http-token-0123456789012345";
  const server = createMolisWorkWebServer({ homeDirectory, controlToken: token });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    resetSecretStoreCache();
    if (previous.home === undefined) delete process.env.MOLIS_WORK_HOME;
    else process.env.MOLIS_WORK_HOME = previous.home;
    if (previous.backend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND;
    else process.env.MOLIS_WORK_SECRET_BACKEND = previous.backend;
    if (previous.key === undefined) delete process.env.MOLIS_WORK_ENCRYPTION_KEY;
    else process.env.MOLIS_WORK_ENCRYPTION_KEY = previous.key;
    if (previous.typesafe === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous.typesafe;
    await rm(homeDirectory, { recursive: true, force: true });
  });
  const page = await (await fetch(`${origin}/settings/functions`)).text();
  assert.match(page, /data-functions-settings/);
  assert.match(page, /href="\/settings\/functions"/);
  assert.doesNotMatch(page, /sk-|TYPESAFE_API_KEY=sk/);
  const headers = () => ({
    origin,
    "content-type": "application/json",
    "x-molis-work-control-token": token,
    "x-molis-work-idempotency-key": `functions-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });
  const saved = await fetch(`${origin}/api/functions/settings`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ api_key: "sk-live-secret" }),
  });
  assert.equal(saved.status, 200);
  const body = await saved.json() as { has_credential: boolean; source: string; api_key?: string };
  assert.deepEqual(body, { has_credential: true, source: "ui" });
  assert.equal(body.api_key, undefined);
  resetSecretStoreCache();
  assert.equal(createFileSecretStore().get(FUNCTIONS_CREDENTIAL_REF), "sk-live-secret");
  const listed = await (await fetch(`${origin}/api/functions`)).json() as { functions: unknown[] };
  assert.deepEqual(listed.functions, []);
  const created = await fetch(`${origin}/api/functions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name: "工单分流" }),
  });
  assert.equal(created.status, 200);
  const record = (await created.json() as { function: { name: string; status: string } }).function;
  assert.equal(record.name, "工单分流");
  assert.equal(record.status, "draft");
  const runtimes = await (await fetch(`${origin}/settings/runtimes`)).text();
  assert.match(runtimes, /data-settings-section="runtimes"/);
  assert.match(runtimes, /href="\/settings\/functions"/);
  const runtimesContent = runtimes.match(/<div class="settings-content">([\s\S]*?)<\/div>\s*<\/main>/)?.[1] ?? "";
  assert.notEqual(runtimesContent, "");
  assert.doesNotMatch(runtimesContent, /data-functions-settings|class="functions-settings-document"|TypeSafe API Key/);
  const settingsHtml = renderMolisWorkSettings({
    section: "functions",
    plugin_settings_html: renderFunctionsSettings({
      settings: { has_credential: true, source: "ui" },
      primitives,
    }),
    runtimes: [],
    projects: [],
    web_service: {
      provider: "macos-launchagent",
      state: "absent",
      supported: true,
      owned: false,
      running: false,
      label: "Web",
      plist_path: "",
      command: [],
      stdout_log: "",
      stderr_log: "",
      message: "",
    },
    diagnostics: {
      home_directory: "/tmp",
      installation_state: "ready",
      version: "0.2.0",
      release_directory: "/tmp",
      project_count: 0,
      launchers: [],
    },
  });
  assert.match(settingsHtml, /data-functions-settings/);
  assert.match(settingsHtml, /href="\/settings\/functions"/);
});
