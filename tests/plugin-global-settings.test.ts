import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { UiContributionDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import {
  HOTKEY_MODIFIER_REQUIRED,
  chordFromKeyboardEvent,
  chordLabel,
  defaultShelfDeviceSettings,
  defaultShelfHotKeys,
  openShelfStore,
  parseSettingsWriteBody,
} from "@molis-ai/molis-work-module-shelf";
import {
  SHELF_SETTINGS_CLIENT_SCRIPT,
  SHELF_SETTINGS_UI_CONTRIBUTION_ID,
  renderShelfSettings,
  shelfSettingsUiDescriptor,
} from "@molis-ai/molis-work-plugin-shelf";
import { feedUiContribution } from "@molis-ai/molis-work-plugin-feed";
import { inboxUiContribution } from "@molis-ai/molis-work-plugin-inbox";
import { UiContributionError } from "@molis-ai/molis-work-ui-host";
import {
  WORKBENCH_UI_SLOTS,
  createWorkbenchUiHost,
  renderPluginSettingsContribution,
} from "../apps/workbench/src/ui-composition.ts";
import {
  listPluginSettingsNavItems,
  pluginSettingsNavItemsFrom,
  isHostGlobalSettingsSection,
} from "../apps/workbench/src/plugin-settings-catalog.ts";
import { renderAppearanceSettingsDocument } from "../apps/workbench/src/settings-appearance.ts";
import { renderSettingsDirectorySection } from "../apps/workbench/src/settings-directory.ts";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { renderMolisWorkSettings } from "./workbench-renderer-fixture.js";

const primitives = {
  escape: (value: unknown) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;"),
  text: (value: string) => value,
};

function shelfSettings(
  overrides: Partial<ReturnType<typeof defaultShelfDeviceSettings>> = {},
) {
  return { ...defaultShelfDeviceSettings(), ...overrides };
}

const directoryPrimitives = {
  L: (text: string) => text,
  escapeHtml: (value: unknown) => String(value ?? ""),
  icon: () => "",
  htmlLang: () => "zh-CN",
};

function settingsDocument(html: string): string {
  const start = html.indexOf('class="settings-content"');
  const end = html.indexOf("</main>");
  return start >= 0 && end > start ? html.slice(start, end) : "";
}

const webService = {
  provider: "macos-launchagent" as const,
  state: "absent" as const,
  supported: true,
  owned: false,
  running: false,
  label: "Web",
  plist_path: "",
  command: [] as string[],
  stdout_log: "",
  stderr_log: "",
  message: "",
};

const diagnostics = {
  home_directory: "/tmp",
  installation_state: "ready" as const,
  version: "0.2.0",
  release_directory: "/tmp",
  project_count: 0,
  launchers: [],
};

function settingsPage(overrides: Partial<UiContributionDescriptor> = {}): UiContributionDescriptor {
  return {
    contribution_id: "io.molis.work.native.example.settings.v1",
    plugin_id: "io.molis.work.native.example",
    kind: "settings-page",
    navigation_id: "example",
    label: "Example",
    surfaces: [
      { surface_id: "settings", target_slot_id: "workbench.settings", format: "declarative-html" },
    ],
    slots: [],
    ...overrides,
  };
}

test("old Shelf catalogs without settings keep the drop wheel on", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-plugin-settings-legacy-"));
  try {
    const root = join(homeDirectory, "shelf");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "catalog.json"), JSON.stringify({
      version: 1,
      seeded_sample: false,
      items: [],
      jobs: [],
      clipboard: [],
      current_clip_id: null,
    }));
    assert.equal(openShelfStore(homeDirectory).settings().drop_wheel_enabled, true);
    assert.deepEqual(openShelfStore(homeDirectory).settings().hotkeys, defaultShelfHotKeys());
  } finally {
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("settings catalog lists registered settings-pages and ignores Feed, Inbox, and host slugs", () => {
  assert.equal(isHostGlobalSettingsSection("mcp"), true);
  assert.equal(isHostGlobalSettingsSection("connectors"), true);
  assert.equal(isHostGlobalSettingsSection("runtimes"), true);
  assert.equal(isHostGlobalSettingsSection("functions"), false);
  assert.equal(isHostGlobalSettingsSection("planning"), false);
  assert.deepEqual(pluginSettingsNavItemsFrom([]), []);
  assert.deepEqual(
    pluginSettingsNavItemsFrom([feedUiContribution.descriptor, inboxUiContribution.descriptor]),
    [],
  );
  assert.deepEqual(
    pluginSettingsNavItemsFrom([
      settingsPage({ navigation_id: "mcp", label: "Should not steal MCP" }),
    ]),
    [],
  );
  assert.deepEqual(
    pluginSettingsNavItemsFrom([
      settingsPage({ navigation_id: "connectors", label: "Should not steal Connectors" }),
    ]),
    [],
  );
  assert.deepEqual(
    pluginSettingsNavItemsFrom([
      settingsPage({ navigation_id: "appearance", label: "Should not steal appearance" }),
    ]),
    [],
  );
  assert.deepEqual(
    pluginSettingsNavItemsFrom([
      settingsPage({
        kind: "primary-page",
        surfaces: [{ surface_id: "settings", target_slot_id: "workbench.main", format: "declarative-html" }],
      }),
    ]),
    [],
  );
  const listed = pluginSettingsNavItemsFrom([
    feedUiContribution.descriptor,
    inboxUiContribution.descriptor,
    shelfSettingsUiDescriptor,
    settingsPage(),
  ]);
  assert.deepEqual(listed.map((item) => item.section_id), ["shelf", "example"]);
  const live = listPluginSettingsNavItems();
  assert.deepEqual(live.map((item) => item.section_id), ["coding-settings", "shelf", "functions"]);
  assert.equal(live[0]?.plugin_id, "io.molis.work.coding");
  assert.equal(live[1]?.contribution_id, SHELF_SETTINGS_UI_CONTRIBUTION_ID);
  assert.equal(live[1]?.label, "Shelf");
  assert.deepEqual(listPluginSettingsNavItems(["goals"]).map((item) => item.section_id), ["coding-settings", "shelf", "functions", "planning"]);
  assert.equal(listPluginSettingsNavItems(["goals"]).find((item) => item.section_id === "planning")?.label, "Goals");
  assert.equal(live.some((item) => item.section_id === "mcp"), false);
  assert.equal(live[2]?.section_id, "functions");
  assert.equal(live[2]?.label, "Functions");
});

test("Shelf settings page has the drop wheel and Molis appearance does not", () => {
  const on = renderShelfSettings({
    settings: shelfSettings(),
    primitives,
  });
  const off = renderShelfSettings({
    settings: shelfSettings({ drop_wheel_enabled: false }),
    primitives,
  });
  assert.match(on, /data-shelf-settings/);
  assert.match(on, /data-settings-panel="shelf"/);
  assert.match(on, /name="drop_wheel_enabled"[^>]*checked/);
  assert.match(on, /拖放轮盘/);
  assert.match(on, /快捷键/);
  assert.doesNotMatch(on, /data-shelf-settings-tab|shelf-settings-nav|shelf-settings-pane\[hidden\]/);
  assert.equal((on.match(/data-shelf-settings-pane="/g) || []).length, 6);
  assert.doesNotMatch(on, /data-shelf-settings-pane="[^"]+" hidden/);
  const setup = on.slice(on.indexOf('data-shelf-settings-pane="setup"'), on.indexOf('data-shelf-settings-pane="actions"'));
  const machine = on.slice(on.indexOf('data-shelf-settings-pane="machine"'), on.indexOf('data-shelf-settings-pane="appearance"'));
  assert.match(setup, /data-shelf-permission="accessibility"/);
  assert.doesNotMatch(setup, /data-shelf-engine|data-shelf-agent-line|shelf-runtime-list/);
  assert.match(machine, /data-shelf-engine/);
  assert.match(machine, /data-shelf-agent-line/);
  const withAgents = renderShelfSettings({
    settings: shelfSettings(),
    primitives,
    runtime: {
      runtime_key: "grok",
      title: "Grok",
      executable: "/usr/bin/grok",
      kind: "tui",
      isolation: "unknown",
      isolation_fact: "未确认工作区限制，仍在副本目录跑",
      can_run_job: true,
      image_text: false,
      installed: ["grok"],
      catalog: [
        { runtime_key: "grok", title: "Grok", executable: "/usr/bin/grok", kind: "tui", can_run_job: true, install_url: "https://example.com/grok" },
        { runtime_key: "gemini", title: "Gemini", executable: "", kind: "tui", can_run_job: false, install_url: "https://example.com/gemini" },
      ],
    },
  });
  const setupWithAgents = withAgents.slice(withAgents.indexOf('data-shelf-settings-pane="setup"'), withAgents.indexOf('data-shelf-settings-pane="actions"'));
  const machineWithAgents = withAgents.slice(withAgents.indexOf('data-shelf-settings-pane="machine"'), withAgents.indexOf('data-shelf-settings-pane="appearance"'));
  assert.doesNotMatch(setupWithAgents, /Grok|安装说明|data-shelf-engine/);
  assert.match(machineWithAgents, /Grok · 未确认工作区限制，仍在副本目录跑/);
  assert.match(machineWithAgents, /href="https:\/\/example.com\/grok"/);
  assert.match(machineWithAgents, /href="https:\/\/example.com\/gemini"/);
  assert.match(on, /⌃⌥D/);
  assert.match(on, /⌃⌥W/);
  assert.match(on, /⌃⌥A/);
  assert.match(on, /data-shelf-hotkey-slot="toggle"/);
  assert.match(on, /data-shelf-hotkey-record/);
  assert.match(on, /data-shelf-hotkey-reset hidden/);
  assert.match(on, /点右边的键再按下新组合/);
  assert.match(on, /必须带 ⌃ ⌥ ⇧ 或 ⌘/);
  assert.doesNotMatch(on, /Gmail|Inbox/);
  assert.doesNotMatch(off, /name="drop_wheel_enabled"[^>]*checked/);
  const appearance = renderAppearanceSettingsDocument({
    L: (text) => text,
    currentLocale: () => "zh",
    localeSwitchHref: (locale, nextPath) => `/locale?lang=${locale}&next=${encodeURIComponent(nextPath)}`,
  }, "/settings/appearance");
  assert.doesNotMatch(appearance, /拖放轮盘|drop_wheel|data-shelf-drop-wheel/);
  const mounted = renderPluginSettingsContribution(SHELF_SETTINGS_UI_CONTRIBUTION_ID, {
    settings: shelfSettings(),
    primitives,
  });
  assert.match(mounted, /data-shelf-settings/);
  assert.throws(() => renderPluginSettingsContribution(SHELF_SETTINGS_UI_CONTRIBUTION_ID, {}));
  const host = createWorkbenchUiHost();
  assert.throws(
    () => host.mount({
      slot: WORKBENCH_UI_SLOTS.main,
      contribution: {
        contribution_id: SHELF_SETTINGS_UI_CONTRIBUTION_ID,
        surface: "settings",
        model: { settings: shelfSettings(), primitives },
      },
    }),
    (error: unknown) => error instanceof UiContributionError && error.code === "ui_slot_incompatible",
  );
});

test("workbench settings directory and standalone settings both show Shelf after the host pages", () => {
  const directory = renderSettingsDirectorySection(directoryPrimitives);
  assert.match(directory, /data-settings-section="appearance"/);
  assert.match(directory, /data-settings-section="runtimes"/);
  assert.match(directory, /data-settings-section="mcp"/);
  assert.match(directory, /data-settings-section="connectors"/);
  assert.doesNotMatch(directory, /data-settings-section="planning"/);
  assert.match(directory, /data-settings-section="diagnostics"/);
  assert.match(directory, /data-settings-section="shelf"/);
  assert.match(directory, /data-settings-section="functions"/);
  const withGoals = renderSettingsDirectorySection(directoryPrimitives, ["goals"]);
  const sectionOrder = [...withGoals.matchAll(/data-settings-section="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(sectionOrder, ["appearance", "runtimes", "mcp", "connectors", "diagnostics", "shelf", "functions", "planning"]);
  assert.match(withGoals, />Goals</);
  assert.doesNotMatch(directory, /Gmail|Inbox/);
  const html = renderMolisWorkSettings({
    section: "shelf",
    plugin_settings_html: renderShelfSettings({
      settings: shelfSettings(),
      primitives,
    }),
    runtimes: [],
    projects: [],
    web_service: webService,
    diagnostics,
  });
  assert.match(html, /data-settings-section="shelf"/);
  assert.match(html, /href="\/settings\/shelf"/);
  assert.match(html, /data-shelf-settings/);
  assert.match(html, /拖放轮盘/);
  assert.doesNotMatch(settingsDocument(html), /Gmail|Inbox/);
  const appearance = renderMolisWorkSettings({
    section: "appearance",
    runtimes: [],
    projects: [],
    web_service: webService,
    diagnostics,
  });
  assert.match(appearance, /href="\/settings\/shelf"/);
  assert.match(appearance, /href="\/settings\/mcp"/);
  assert.match(appearance, /href="\/settings\/connectors"/);
  assert.match(appearance, /class="settings-document appearance-document"/);
  assert.doesNotMatch(appearance, /data-settings-panel="shelf"|name="drop_wheel_enabled"|class="shelf-settings-document"/);
});

test("MCP settings page is a Host global section, not a Functions settings-page", () => {
  const html = renderMolisWorkSettings({
    section: "mcp",
    runtimes: [],
    mcp_tools: [{
      name: "molis_work_v1_functions_invoke",
      description: "调用一个已发布判断函数。",
      group_id: "functions",
      group_title: "Functions",
      enabled: true,
      effect: "write",
    }],
    projects: [],
    web_service: webService,
    diagnostics,
  });
  assert.match(html, /data-settings-section="mcp"/);
  assert.match(html, /data-mcp-settings/);
  assert.match(html, /data-mcp-group="functions"/);
  assert.match(html, /data-mcp-tool="molis_work_v1_functions_invoke"/);
  assert.match(html, /href="\/settings\/mcp"/);
  assert.match(html, /href="\/settings\/connectors"/);
  assert.match(html, /href="\/settings\/functions"/);
  assert.doesNotMatch(html, /data-settings-panel="functions"/);
  assert.doesNotMatch(settingsDocument(html), /data-connectors-settings|data-connector-token/);
});

test("Connectors settings page is a Host global section, not a plugin settings-page", () => {
  const html = renderMolisWorkSettings({
    section: "connectors",
    connectors: [{
      connector_id: "github",
      title: "GitHub",
      availability: "live",
      auth_kind: "github",
      group_id: "code",
      summary: "本机账号。Feed 拉未读通知，Functions 可勾已兑现动作。",
      account_state: "disconnected",
      outbound_note: "已兑现动作：查看当前 GitHub 账号（github.whoami）。判断只挑，不会自动调用。",
    }],
    runtimes: [],
    projects: [],
    web_service: webService,
    diagnostics,
  });
  assert.match(html, /data-settings-section="connectors"/);
  assert.match(html, /data-connectors-settings/);
  assert.match(html, /href="\/settings\/connectors"/);
  assert.match(html, /href="\/settings\/mcp"/);
  assert.doesNotMatch(settingsDocument(html), /data-mcp-settings|data-mcp-tool=/);
});

test("Shelf drop-wheel preference persists through the store and HTTP settings page", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-plugin-settings-http-"));
  const store = openShelfStore(homeDirectory);
  assert.equal(store.settings().drop_wheel_enabled, true);
  assert.equal(store.saveSettings({ drop_wheel_enabled: false }).drop_wheel_enabled, false);
  assert.equal(openShelfStore(homeDirectory).settings().drop_wheel_enabled, false);
  store.saveSettings({ drop_wheel_enabled: true });

  const token = "plugin-settings-http-token-012345678901";
  const server = createMolisWorkWebServer({ homeDirectory, controlToken: token });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(homeDirectory, { recursive: true, force: true });
  });
  const headers = () => ({
    origin,
    "content-type": "application/json",
    "x-molis-work-control-token": token,
    "x-molis-work-idempotency-key": `shelf-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });

  const missing = await fetch(`${origin}/settings/inbox`);
  assert.equal(missing.status, 404);
  const page = await (await fetch(`${origin}/settings/shelf`)).text();
  assert.match(page, /data-shelf-settings/);
  assert.match(page, /data-settings-panel="shelf"/);
  assert.match(page, /href="\/settings\/shelf"/);
  assert.match(page, /name="drop_wheel_enabled"[^>]*checked/);
  assert.doesNotMatch(settingsDocument(page), /Gmail|Inbox/);

  const appearancePage = await (await fetch(`${origin}/settings/appearance`)).text();
  assert.match(appearancePage, /href="\/settings\/shelf"/);
  assert.match(appearancePage, /class="settings-document appearance-document"/);
  assert.doesNotMatch(appearancePage, /data-settings-panel="shelf"|name="drop_wheel_enabled"|class="shelf-settings-document"/);

  const read = await (await fetch(`${origin}/api/shelf/settings`)).json() as { drop_wheel_enabled: boolean };
  assert.equal(read.drop_wheel_enabled, true);

  const rejected = await fetch(`${origin}/api/shelf/settings`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ drop_wheel_enabled: "no" }),
  });
  assert.equal(rejected.status, 400);

  const written = await fetch(`${origin}/api/shelf/settings`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ drop_wheel_enabled: false }),
  });
  assert.equal(written.status, 200);
  assert.equal((await written.json() as { drop_wheel_enabled: boolean }).drop_wheel_enabled, false);
  assert.equal(openShelfStore(homeDirectory).settings().drop_wheel_enabled, false);
  const reread = await (await fetch(`${origin}/api/shelf/settings`)).json() as { drop_wheel_enabled: boolean };
  assert.equal(reread.drop_wheel_enabled, false);
  const after = await (await fetch(`${origin}/settings/shelf`)).text();
  assert.doesNotMatch(after, /name="drop_wheel_enabled"[^>]*checked/);

  const remappedChord = { key_code: 14, carbon_modifiers: 6144 };
  const bare = await fetch(`${origin}/api/shelf/settings`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ hotkeys: { toggle: { key_code: 2, carbon_modifiers: 0 } } }),
  });
  assert.equal(bare.status, 400);
  assert.equal(((await bare.json()) as { error: string }).error, HOTKEY_MODIFIER_REQUIRED);
  assert.equal(openShelfStore(homeDirectory).settings().hotkeys.toggle.key_code, 2);

  const remapped = await fetch(`${origin}/api/shelf/settings`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ hotkeys: { toggle: remappedChord } }),
  });
  assert.equal(remapped.status, 200);
  const remappedBody = await remapped.json() as {
    drop_wheel_enabled: boolean;
    hotkeys: { toggle: { key_code: number; carbon_modifiers: number } };
  };
  assert.equal(remappedBody.drop_wheel_enabled, false);
  assert.equal(remappedBody.hotkeys.toggle.key_code, 14);
  assert.equal(openShelfStore(homeDirectory).settings().hotkeys.toggle.key_code, 14);
  assert.equal(openShelfStore(homeDirectory).settings().hotkeys.capture.key_code, 13);
  const remappedPage = await (await fetch(`${origin}/settings/shelf`)).text();
  assert.match(remappedPage, /data-key-code="14"[^>]*>[\s\S]{0,80}?data-shelf-hotkey-reset>/);
  assert.doesNotMatch(remappedPage, /data-key-code="14"[^>]*>[\s\S]{0,80}?data-shelf-hotkey-reset hidden/);
});

test("Shelf hotkey recording maps KeyboardEvent.code to Carbon and rejects bare global chords", () => {
  const chord = chordFromKeyboardEvent({
    code: "KeyD",
    ctrlKey: true,
    altKey: true,
    shiftKey: false,
    metaKey: false,
  });
  assert.deepEqual(chord, { key_code: 2, carbon_modifiers: 6144 });
  assert.equal(chordLabel(chord!), "⌃⌥D");
  assert.equal(chordLabel({ key_code: 14, carbon_modifiers: 6144 }), "⌃⌥E");
  assert.equal(
    chordLabel({ key_code: 2, carbon_modifiers: 4096 + 2048 + 512 + 256 }),
    "⌃⌥⇧⌘D",
  );
  assert.equal(
    chordFromKeyboardEvent({
      code: "ControlLeft",
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    }),
    null,
  );
  const bare = chordFromKeyboardEvent({
    code: "KeyD",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  });
  assert.deepEqual(bare, { key_code: 2, carbon_modifiers: 0 });
  const emptyWrite = parseSettingsWriteBody({});
  assert.equal("error" in emptyWrite ? emptyWrite.error : null, "请提供要保存的设置");
  const bareWrite = parseSettingsWriteBody({ hotkeys: { toggle: { key_code: 2, carbon_modifiers: 0 } } });
  assert.equal("error" in bareWrite ? bareWrite.error : null, HOTKEY_MODIFIER_REQUIRED);
  const parsed = parseSettingsWriteBody({ hotkeys: { toggle: { key_code: 14, carbon_modifiers: 6144 } } });
  assert.equal("ok" in parsed ? parsed.ok.hotkeys?.toggle?.key_code : null, 14);
  assert.match(SHELF_SETTINGS_CLIENT_SCRIPT, /shelf_apply_hotkeys/);
  assert.match(SHELF_SETTINGS_CLIENT_SCRIPT, /按下…/);
  assert.match(SHELF_SETTINGS_CLIENT_SCRIPT, /这个组合被占用。/);
  assert.doesNotMatch(SHELF_SETTINGS_CLIENT_SCRIPT, /data-shelf-settings-tab/);
  const remapped = renderShelfSettings({
    settings: shelfSettings({
      hotkeys: {
        ...defaultShelfHotKeys(),
        toggle: { key_code: 14, carbon_modifiers: 6144 },
      },
    }),
    primitives,
  });
  assert.match(remapped, /⌃⌥E/);
  assert.match(remapped, /data-key-code="14"[^>]*>[\s\S]{0,80}?data-shelf-hotkey-reset>/);
  assert.doesNotMatch(remapped, /data-key-code="14"[^>]*>[\s\S]{0,80}?data-shelf-hotkey-reset hidden/);
});

test("Shelf store keeps the wheel when only a hotkey is patched and repairs a bare chord", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-plugin-settings-hotkeys-"));
  try {
    const store = openShelfStore(homeDirectory);
    store.saveSettings({ drop_wheel_enabled: false });
    const saved = store.saveSettings({
      hotkeys: { toggle: { key_code: 14, carbon_modifiers: 6144 } },
    });
    assert.equal(saved.drop_wheel_enabled, false);
    assert.equal(saved.hotkeys.toggle.key_code, 14);
    assert.equal(saved.hotkeys.capture.key_code, 13);
    const repaired = store.saveSettings({
      hotkeys: { toggle: { key_code: 2, carbon_modifiers: 0 } },
    });
    assert.equal(repaired.hotkeys.toggle.key_code, 2);
    assert.equal(repaired.hotkeys.toggle.carbon_modifiers, 6144);
  } finally {
    await rm(homeDirectory, { recursive: true, force: true });
  }
});
