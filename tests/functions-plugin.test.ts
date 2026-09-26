import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { functionsActionProvider } from "@molis-ai/molis-work-module-functions";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";

function registeredFunctionActions(service: import("@molis-ai/molis-work-module-functions").FunctionsService) {
  const actions = new ActionService();
  actions.registerProvider(functionsActionProvider({ read: run => run(service), run: run => run(service), credentialAvailable: () => service.settingsStatus().has_credential }));
  return bindActionClient(actions, () => ({ actor_id: "test", project_id: null, audience: "user", permissions: ["functions:invoke", "functions:manage"] }));
}
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
  INBOX_DISMISS_BEHAVIOR_ID,
  INBOX_DONE_BEHAVIOR_ID,
  INBOX_NEXT_SCENE_ID,
  SYSTEM_HOME_DOCK_FUNCTION_KEY,
  SYSTEM_INBOX_ADMIT_FUNCTION_KEY,
  SYSTEM_INBOX_NEXT_FUNCTION_KEY,
  functionFitsScene,
  choiceCriteriaFollowContext,
  type TypeSafeEvaluateResult,
} from "@molis-ai/molis-work-contracts/modules/functions";
import {
  FunctionsError,
  createFunctionsService,
  hashChoiceConfig,
  hashFunctionConfig,
  openFunctionsStore,
  readChoiceAnswer,
  type FunctionsSecretPort,
  type TypeSafeProvider,
} from "@molis-ai/molis-work-module-functions";
import { FunctionsHttpRouteTable } from "../apps/local-host/src/functions-http/routes.ts";
import { createFunctionsRouteHandlers } from "../apps/local-host/src/functions-http/route-handlers.ts";
import { functionsRouteErrorResponse } from "../apps/local-host/src/functions-http/route-error.ts";
import { FUNCTIONS_CLIENT_FACTORY_SCRIPT } from "../apps/workbench/src/functions/client.ts";
import { renderFunctionsWorkbench } from "../apps/workbench/src/functions/ui.ts";
import { renderFunctionsSettings } from "../apps/workbench/src/functions/settings-ui.ts";

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

function fixtureProvider(result: { choice?: string | null; noul?: number; score?: number } = { choice: "yes" }, calls: { count: number } = { count: 0 }): TypeSafeProvider {
  return {
    async evaluate(_apiKey, record): Promise<TypeSafeEvaluateResult> {
      calls.count += 1;
      if (record.primitive === "noul") {
        return {
          primitive: "noul",
          choice: null,
          noul: result.noul ?? 0.82,
          score: null,
          legend: null,
          probabilities: {},
          confidence: null,
          model: "jev-1.13.0",
        };
      }
      if (record.primitive === "score") {
        return {
          primitive: "score",
          choice: null,
          noul: null,
          score: result.score ?? 1,
          legend: [...record.criteria] as string[],
          probabilities: { "0": 0.2, "1": 0.8 },
          confidence: 0.7,
          model: "jev-1.13.0",
        };
      }
      return {
        primitive: "choice",
        choice: result.choice === undefined ? "yes" : result.choice,
        noul: null,
        score: null,
        legend: null,
        probabilities: { yes: 0.9, no: 0.1 },
        confidence: 0.8,
        model: "jev-1.13.0",
      };
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
    assert.equal(created.scene_id, null);
    assert.deepEqual({ ...created.scene_map }, {});
    assert.equal(created.version, null);
    assert.match(created.function_key, /^fn_|[a-z]/);
    const updated = store.updateDraft(created.id, {
      instructions: "这是账单吗？",
      criteria: [
        { key: "billing", description: "钱、发票、退款" },
        { key: "other", description: "其他" },
      ],
      scene_id: "agent.mcp",
      subject_kinds: ["mcp_invoke"],
    });
    assert.equal(updated.instructions, "这是账单吗？");
    assert.equal(updated.scene_id, "agent.mcp");
    assert.deepEqual([...updated.subject_kinds], ["mcp_invoke"]);
    assert.equal(updated.last_preview, null);
    assert.throws(() => store.publish(created.id), (error: unknown) => (
      error instanceof FunctionsError && error.code === "functions.preview_required"
    ));
    const previewed = store.savePreview(created.id, {
      input: "请退款",
      outcome: "ok",
      primitive: "choice",
      choice: "billing",
      probabilities: { billing: 0.9, other: 0.1 },
      confidence: 0.8,
      noul: null,
      score: null,
      legend: null,
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

test("custom Choice options survive an Inbox destination and bind through a scene map", async () => {
  await withHome(async (home) => {
    const store = openFunctionsStore(home);
    const created = store.createChoice({ name: "急不急" });
    const drafted = store.updateDraft(created.id, {
      instructions: "这封邮件急吗？",
      criteria: [
        { key: "urgent", description: "急" },
        { key: "later", description: "不急" },
      ],
      subject_kinds: ["inbox_entry"],
    });
    const hash = drafted.config_hash;
    const mapped = store.updateDraft(created.id, {
      scene_id: INBOX_NEXT_SCENE_ID,
      scene_map: {
        urgent: INBOX_DONE_BEHAVIOR_ID,
        later: INBOX_DISMISS_BEHAVIOR_ID,
      },
    });
    assert.equal(mapped.scene_id, INBOX_NEXT_SCENE_ID);
    assert.equal(mapped.config_hash, hash);
    assert.deepEqual(mapped.criteria, drafted.criteria);
    assert.deepEqual({ ...mapped.scene_map }, {
      urgent: INBOX_DONE_BEHAVIOR_ID,
      later: INBOX_DISMISS_BEHAVIOR_ID,
    });
    assert.equal(functionFitsScene(mapped, INBOX_NEXT_SCENE_ID), true);
    const noul = store.create({ primitive: "noul", name: "材料够不够" });
    assert.equal(noul.scene_id, null);
    const noulMapped = store.updateDraft(noul.id, {
      scene_id: INBOX_NEXT_SCENE_ID,
      scene_map: { true: INBOX_DONE_BEHAVIOR_ID, false: INBOX_DISMISS_BEHAVIOR_ID },
    });
    assert.equal(noulMapped.scene_id, INBOX_NEXT_SCENE_ID);
    const score = store.create({ primitive: "score", name: "相关程度" });
    assert.throws(() => store.updateDraft(score.id, { scene_id: INBOX_NEXT_SCENE_ID }), (error: unknown) => (
      error instanceof FunctionsError && error.code === "functions.invalid"
    ));
    store.close();
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
      assert.equal(previewed.last_preview?.outcome, "ok");
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
    assert.match(html, /data-functions-connection/);
    assert.match(html, /管理 TypeSafe 连接/);
    assert.doesNotMatch(html, /<input[^>]*api[_-]?key/i);
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
    const routes = new FunctionsHttpRouteTable(createFunctionsRouteHandlers({ actions: registeredFunctionActions(service) }));
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

test("choice options follow destination context unless keys are custom", () => {
  assert.equal(choiceCriteriaFollowContext([], ["inbox.done"]), true);
  assert.equal(choiceCriteriaFollowContext(["yes", "no"], ["inbox.done", "inbox.dismiss"]), true);
  assert.equal(choiceCriteriaFollowContext(["inbox.done", "inbox.dismiss"], ["inbox.done", "inbox.dismiss"]), true);
  assert.equal(choiceCriteriaFollowContext(["urgent", "later"], ["inbox.done", "inbox.dismiss"]), false);
  assert.equal(choiceCriteriaFollowContext(["inbox.done", "later"], ["inbox.done", "inbox.dismiss"]), false);
});

test("Functions client clears leftover preview text when switching records and hides Noul section chrome", () => {
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /const switching = selected\?\.id !== record\.id/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /\/api\/functions\/catalog/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /data-functions-destination/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /data-functions-source/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /agent\.mcp/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /if \(switching\) previewInput\.value = record\.last_preview\?\.input \|\| ""/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /criteriaHead\.hidden = kind === "noul"/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /addChoiceRow/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /scene_map/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /data-functions-map/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /select\.className = "mw-select"/);
  assert.doesNotMatch(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /select\.className = "mw-input"/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /suggestedBehaviors/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /criteriaFollowContext/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /syncCriteriaPanel/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /matchesSubjects/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /if \(event\.target\.matches\("\[data-functions-source\]"\)\)/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /syncCriteriaPanel\(\);/);
  assert.doesNotMatch(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /criteriaForDestination/);
  assert.doesNotMatch(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /subject_kinds: dest\?\.subject_kinds/);
  assert.doesNotMatch(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /selected = record;\s*records = records\.some/);
  assert.doesNotMatch(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /\/api\/inbox\/judgment|\/api\/home\/dock-judgment/);
  assert.doesNotMatch(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /row\.board_id \? " · " \+ row\.board_id/);
});

test("system judgment editor and connection settings render without plugin contributions", () => {
  const stage = renderFunctionsWorkbench({ functions: [], primitives });
  assert.match(stage, /functions-system-editor/);
  assert.doesNotMatch(stage, /desktop-work-surface|data-plugin-surface/);
  assert.match(stage, /data-functions="workbench"/);
  assert.match(stage, /data-functions-new/);
  assert.match(stage, /plugin-stage-list feed-stage-list feed-stage-tree" data-functions="directory"/);
  assert.match(stage, /class="mw-btn mw-btn--ghost tree-create"[^>]*data-functions-new/);
  assert.doesNotMatch(stage, /mw-btn--secondary"[^>]*data-functions-new/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /feed-stage-entry directory-list-row/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /plugin-stage-kind/);
  assert.match(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /kindChip\(record\.primitive \|\| "choice"/);
  assert.doesNotMatch(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /kind \+ " · " \+ record\.function_key/);
  assert.doesNotMatch(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /mw-status--plain feed-entry-status/);
  assert.doesNotMatch(FUNCTIONS_CLIENT_FACTORY_SCRIPT, /className = "functions-row/);
  assert.match(stage, /data-functions-destinations/);
  assert.match(stage, /data-functions-subject-list/);
  assert.doesNotMatch(stage, /要不要出现「加入 Inbox」/);
  assert.match(stage, /data-functions-sources/);
  assert.match(stage, /data-functions-columns/);
  assert.match(stage, /data-functions-col="look"/);
  assert.match(stage, /data-functions-col="fn"/);
  assert.match(stage, /data-functions-col="use"/);
  assert.match(stage, /data-functions-map/);
  assert.match(stage, /data-functions-criteria-head/);
  assert.match(stage, /独立使用/);
  assert.match(stage, /结果对应的页面动作/);
  assert.match(stage, /data-functions-step="look" aria-current="step"/);
  assert.match(stage, /data-functions-save-status/);
  assert.match(stage, /data-functions-palette-search/);
  assert.match(stage, /data-functions-create-dialog/);
  assert.match(renderFunctionsWorkbench({ functions: [], primitives }), /还没有判断/);
  assert.match(renderFunctionsWorkbench({ functions: [], primitives }), /mw-empty__mark[\s\S]*#icon-zap/);
  assert.match(renderFunctionsWorkbench({ functions: [], primitives }), /点「新建判断」/);
  assert.doesNotMatch(renderFunctionsWorkbench({ functions: [], primitives }), /这道题/);
  assert.doesNotMatch(renderFunctionsWorkbench({ functions: [], primitives }), /何时 ·/);
  assert.doesNotMatch(renderFunctionsWorkbench({ functions: [], primitives }), /哪里配/);
  assert.doesNotMatch(renderFunctionsWorkbench({ functions: [], primitives }), /Inbox 列表的「下一步判断」/);
  assert.doesNotMatch(renderFunctionsWorkbench({ functions: [], primitives }), /开关仍在现场/);
  assert.doesNotMatch(renderFunctionsWorkbench({ functions: [], primitives }), /molis_work_v1_functions_invoke/);
  assert.doesNotMatch(renderFunctionsWorkbench({ functions: [], primitives }), /functions-define/);
  assert.doesNotMatch(renderFunctionsWorkbench({ functions: [], primitives }), /发布给 Agent 调用/);
  const settings = renderFunctionsSettings({ settings: { has_credential: false, source: "none" }, primitives });
  assert.match(settings, /data-functions-settings/);
  assert.doesNotMatch(settings, /Gmail|Inbox|AI 与执行工具/);
  assert.doesNotMatch(INTERACTION_TEXTURE_STYLES, /data-settings-section="functions"/);
  const directory = renderSettingsDirectorySection({
    L: (text) => text,
    escapeHtml: (value) => String(value ?? ""),
    icon: () => "",
    htmlLang: () => "zh-CN",
  });
  assert.doesNotMatch(directory, /data-settings-section="functions"/);
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
  assert.match(page, /data-connector-detail="typesafe"[\s\S]*data-functions-settings/);
  assert.doesNotMatch(page, /sk-live-secret|sk-test|TYPESAFE_API_KEY=sk/);
  const headers = () => ({
    origin,
    "content-type": "application/json",
    "x-molis-work-control-token": token,
    "x-molis-work-idempotency-key": `functions-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });
  const direct = await fetch(`${origin}/api/functions/settings`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ api_key: "sk-live-secret" }),
  });
  assert.equal(direct.status, 400);
  const connectorCreated = await fetch(`${origin}/api/settings/connectors/connections`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ service_id: "typesafe", display_name: "TypeSafe 测试账号", token: "sk-live-secret" }),
  });
  assert.equal(connectorCreated.status, 201);
  const createdBody = await connectorCreated.json() as { connection: { connection_id: string } };
  const saved = await fetch(`${origin}/api/functions/settings`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ connection_id: createdBody.connection.connection_id }),
  });
  assert.equal(saved.status, 200);
  const body = await saved.json() as { has_credential: boolean; source: string; api_key?: string };
  assert.deepEqual(body, { has_credential: true, source: "ui" });
  assert.equal(body.api_key, undefined);
  assert.equal(JSON.stringify(body).includes("sk-live-secret"), false);
  assert.doesNotMatch(await (await fetch(`${origin}/capabilities/connections`)).text(), /sk-live-secret/);
  assert.deepEqual(await (await fetch(`${origin}/api/functions/settings`)).json(), { has_credential: true, source: "ui" });
  const listed = await (await fetch(`${origin}/api/functions`)).json() as { functions: Array<{ function_key: string; scene_id: string | null }> };
  assert.deepEqual(
    listed.functions.map((row) => row.function_key).sort(),
    [SYSTEM_INBOX_ADMIT_FUNCTION_KEY, SYSTEM_HOME_DOCK_FUNCTION_KEY, SYSTEM_INBOX_NEXT_FUNCTION_KEY].sort(),
  );
  assert.equal(listed.functions.find((row) => row.function_key === SYSTEM_HOME_DOCK_FUNCTION_KEY)?.scene_id, "home.dock");
  const catalog = await (await fetch(`${origin}/api/functions/catalog`)).json() as {
    catalog: {
      destinations: Array<{ destination_id: string; configure_at: string; kind: string; when?: string; behavior_ids?: string[]; availability?: { available: boolean; code?: string } }>;
      behaviors: Array<{ behavior_id: string; source: string; effect: string; action_ref?: { capability_id: string; version: number; provider_id: string } }>;
    };
  };
  assert.deepEqual(catalog.catalog.destinations.map(row => row.destination_id), ["agent.mcp"], "global authoring lists actual registered scenes only");
  assert.ok(catalog.catalog.behaviors.some(row => row.action_ref?.capability_id === "functions.invoke"));
  assert.ok(catalog.catalog.behaviors.every(row => row.action_ref?.provider_id && row.action_ref.version > 0));
  assert.equal(catalog.catalog.behaviors.some(row => row.behavior_id === "molis_work_v1_form_create" || row.behavior_id === "feed.save"), false,
    "global authoring must not invent unavailable project actions or legacy MCP aliases");
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
  assert.match(runtimes, /href="\/capabilities\/library/);
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
  assert.match(settingsHtml, /href="\/capabilities\/connections/);
});

test("config hash changes across primitives with the same instructions", () => {
  const choice = hashFunctionConfig({
    primitive: "choice",
    instructions: "判断",
    criteria: [{ key: "yes", description: "是" }, { key: "no", description: "否" }],
  });
  const noul = hashFunctionConfig({
    primitive: "noul",
    instructions: "判断",
    criteria: { true_description: "是", false_description: "否" },
  });
  assert.notEqual(choice, noul);
});

test("Noul preview stores probability without confidence, and publish pins the resolved model", async () => {
  await withHome(async (home) => {
    const store = openFunctionsStore(home);
    const service = createFunctionsService({
      store,
      secrets: memorySecrets({ [FUNCTIONS_CREDENTIAL_REF]: "sk-test" }),
      provider: fixtureProvider({ noul: 0.91 }),
    });
    const created = service.create({ primitive: "noul", name: "材料是否够" });
    assert.equal(created.primitive, "noul");
    assert.equal(created.model, "jev-latest");
    service.updateDraft(created.id, {
      instructions: "这些材料能否支持这个结论？",
      criteria: { true_description: "证据充分", false_description: "证据不够" },
    });
    const previewed = await service.preview(created.id, "只有一句口号");
    assert.equal(previewed.last_preview?.outcome, "ok");
    assert.equal(previewed.last_preview?.noul, 0.91);
    assert.equal(previewed.last_preview?.confidence, null);
    const published = service.publish(created.id);
    assert.equal(published.status, "published");
    assert.equal(published.model, "jev-1.13.0");
    assert.equal(published.version, 1);
  });
});

test("samples do not change config_hash, drafts can be deleted, published cannot", async () => {
  await withHome(async (home) => {
    const store = openFunctionsStore(home);
    const created = store.create({ primitive: "score", name: "相关程度" });
    const updated = store.updateDraft(created.id, {
      instructions: "材料与主题有多相关",
      criteria: ["无关", "相关"],
    });
    const hash = updated.config_hash;
    const withSample = store.addSample(updated.id, { label: "清楚", input: "完全对题" });
    assert.equal(withSample.samples.length, 1);
    assert.equal(withSample.config_hash, hash);
    store.deleteDraft(updated.id);
    assert.equal(store.get(updated.id), null);
    const again = store.createChoice({ name: "可发布" });
    store.updateDraft(again.id, {
      instructions: "急吗？",
      criteria: [{ key: "yes", description: "急" }, { key: "no", description: "不急" }],
    });
    const ready = store.require(again.id);
    store.savePreview(again.id, {
      input: "三天没人回",
      outcome: "ok",
      primitive: "choice",
      choice: "yes",
      noul: null,
      score: null,
      legend: null,
      probabilities: { yes: 0.9, no: 0.1 },
      confidence: 0.8,
      model: "jev-1.13.0",
      config_hash: ready.config_hash,
      at: "2026-09-20T00:00:00.000Z",
    });
    store.publish(again.id);
    assert.throws(() => store.deleteDraft(again.id), (error: unknown) => (
      error instanceof FunctionsError && error.code === "functions.published_immutable"
    ));
    assert.equal(store.get(again.id)?.status, "published");
  });
});

test("invoke uses published config once and does not overwrite last_preview", async () => {
  await withHome(async (home) => {
    const calls = { count: 0 };
    const service = createFunctionsService({
      store: openFunctionsStore(home),
      secrets: memorySecrets({ [FUNCTIONS_CREDENTIAL_REF]: "sk-test" }),
      provider: fixtureProvider({ choice: "yes" }, calls),
    });
    const created = service.createChoice({ name: "急单" });
    service.updateDraft(created.id, {
      instructions: "急吗？",
      criteria: [{ key: "yes", description: "急" }, { key: "no", description: "不急" }],
    });
    await assert.rejects(() => service.invokePublished(created.function_key, "三天没人回"), (error: unknown) => (
      error instanceof FunctionsError && error.code === "functions.not_found"
    ));
    const previewed = await service.preview(created.id, "预览输入");
    const published = service.publish(created.id);
    const invoked = await service.invokePublished(published.function_key, "调用输入");
    assert.equal(calls.count, 2);
    assert.equal(invoked.status, "ok");
    assert.equal(invoked.data.choice, "yes");
    assert.equal(invoked.model, "jev-1.13.0");
    const after = service.get(published.id);
    assert.equal(after.last_preview?.input, previewed.last_preview?.input);
  });
});

test("HTTP invoke by key and MCP list hide drafts", async () => {
  await withHome(async (home) => {
    const service = createFunctionsService({
      store: openFunctionsStore(home),
      secrets: memorySecrets({ [FUNCTIONS_CREDENTIAL_REF]: "sk-test" }),
      provider: fixtureProvider({ choice: "no" }),
    });
    const draft = service.createChoice({ name: "草稿" });
    service.updateDraft(draft.id, {
      instructions: "要不要？",
      criteria: [{ key: "yes", description: "要" }, { key: "no", description: "不要" }],
    });
    const live = service.createChoice({ name: "已发" });
    service.updateDraft(live.id, {
      instructions: "要不要？",
      criteria: [{ key: "yes", description: "要" }, { key: "no", description: "不要" }],
    });
    await service.preview(live.id, "input");
    service.publish(live.id);
    const routes = new FunctionsHttpRouteTable(createFunctionsRouteHandlers({ actions: registeredFunctionActions(service) }));
    const listed = await routes.handle({
      method: "GET",
      pathname: "/api/functions/published",
      query: new URLSearchParams(),
      body: {},
    });
    const publishedKeys = ((listed?.body as { functions: Array<{ function_key: string }> }).functions ?? [])
      .map((item) => item.function_key);
    assert.ok(publishedKeys.includes(live.function_key));
    assert.equal(publishedKeys.includes(draft.function_key), false);
    const invoked = await routes.handle({
      method: "POST",
      pathname: `/api/functions/by-key/${live.function_key}/invoke`,
      query: new URLSearchParams(),
      body: { input: "调用" },
    });
    assert.equal(invoked?.status, 200);
    assert.equal((invoked?.body as { data: { choice: string } }).data.choice, "no");
    const { callLegacyFunctionsMcp } = await import("../apps/local-host/src/mcp-functions-tools.ts");
    const actionHost = new MolisWorkLocalHost({ homeDirectory: home, functions: {
      secrets: memorySecrets({ [FUNCTIONS_CREDENTIAL_REF]: "sk-test" }), provider: fixtureProvider({ choice: "no" }), env: {},
    } });
    const actions = bindActionClient(actionHost.homeActionClient(), () => ({
      actor_id: "test-mcp", project_id: null, audience: "mcp", permissions: ["functions:invoke", "functions:manage"],
    }));
    const listedMcp = JSON.parse(await callLegacyFunctionsMcp(actions, "molis_work_v1_functions_list", {})) as {
      functions: Array<{ function_key: string }>;
    };
    assert.ok(listedMcp.functions.some((item) => item.function_key === live.function_key));
    assert.equal(listedMcp.functions.some((item) => item.function_key === draft.function_key), false);
    await assert.rejects(
      () => callLegacyFunctionsMcp(actions, "molis_work_v1_functions_describe", { function_key: draft.function_key }),
      /函数不存在/,
    );
    const invokedMcp = JSON.parse(await callLegacyFunctionsMcp(actions, "molis_work_v1_functions_invoke", {
      function_key: live.function_key, input: "MCP test",
    })) as { status: string; data: { choice: string } };
    assert.equal(invokedMcp.status, "ok");
    assert.equal(invokedMcp.data.choice, "no");
    await actionHost.close();
  });
});
