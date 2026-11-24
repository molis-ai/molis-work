import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { htmlLang, installHostUiText, localeSetCookie, registeredBuiltinText, resolveWebLocale, runWithLocale, runWithRegisteredText, safeNextPath } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG, createWorkbenchLocale } from "@molis-ai/molis-work-app-workbench";
import { renderImagesWorkbench } from "@molis-ai/molis-work-plugin-images";
import { createGoalStateExplainer, type GoalPresentationState } from "@molis-ai/molis-work-plugin-goals";
import { format, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { isProductSource, scanTree, summarise, workingTreeSnapshot } from "../scripts/gates/translations.mjs";
import { pagePack, pageTextScript } from "./fixtures/page-text.js";

installHostUiText();
const builtin = (id: string) => {
  const reader = registeredBuiltinText(BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === id)!.manifest);
  assert.ok(reader, id);
  return reader;
};
const asOwner = <T>(id: string, render: () => T) => runWithRegisteredText(builtin(id), render);
const browserWords = (locale: string, ...owners: string[]) => {
  const browser = { document: { documentElement: {} }, t: undefined as typeof t | undefined };
  runInNewContext(pageTextScript(locale, ...owners), browser);
  assert.ok(browser.t);
  return browser.t.text;
};
const SETTINGS = "workbench.shell.settings";
const { explainWorkState } = createGoalStateExplainer(t.text);

test("locale defaults to Chinese, then cookie, then Accept-Language", () => {
  assert.equal(resolveWebLocale(undefined, undefined), "zh");
  assert.equal(resolveWebLocale("molis_work_locale=en", "zh-CN"), "en");
  assert.equal(resolveWebLocale("molis_work_locale=ja", "en-US"), "ja");
  assert.equal(resolveWebLocale("theme=light; molis_work_locale=zh", "en-US"), "zh");
  assert.equal(resolveWebLocale(undefined, "en-US,en;q=0.9"), "en");
  assert.equal(resolveWebLocale(undefined, "ja-JP,ja;q=0.9,en;q=0.8"), "ja");
  assert.equal(resolveWebLocale(undefined, "fr-FR,ja-JP;q=0.8,en;q=0.7"), "ja");
  assert.equal(resolveWebLocale(undefined, "zh-CN,zh;q=0.9,en;q=0.8"), "zh");
  assert.equal(resolveWebLocale("molis_work_locale=de", "fr-FR"), "zh");
  assert.equal(runWithLocale("en", htmlLang), "en");
  assert.equal(runWithLocale("zh", htmlLang), "zh-CN");
  assert.equal(runWithLocale("ja", htmlLang), "ja");
  assert.equal(createWorkbenchLocale(() => "ja").dateTimeLocale(), "ja-JP");
  assert.match(localeSetCookie("en"), /molis_work_locale=en/);
  assert.match(localeSetCookie("ja"), /molis_work_locale=ja/);
});

test("FSS-39 ja-JP date and number formatting uses Japanese Intl conventions in Host and browser", () => {
  const sampleAt = "2026-11-07T09:30:00.000Z";
  const hostDate = runWithLocale("ja", () => format.date(sampleAt, "date", { time_zone: "Asia/Tokyo" }));
  const hostDateTime = runWithLocale("ja", () => format.date(sampleAt, "datetime", { time_zone: "Asia/Tokyo" }));
  const hostNumber = runWithLocale("ja", () => format.number(1234.5));
  const hostCompact = runWithLocale("ja", () => format.number(12345, "compact"));
  assert.equal(hostDate, new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" }).format(new Date(sampleAt)));
  assert.equal(hostDateTime, new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(sampleAt)));
  assert.equal(hostNumber, "1,234.5");
  assert.match(hostCompact, /1\.2万/u);
  const enCompact = runWithLocale("en", () => format.number(12345, "compact"));
  assert.notEqual(hostCompact, enCompact);
});

test("safe next path only allows same-origin relative locations", () => {
  assert.equal(safeNextPath("/settings/runtimes"), "/settings/runtimes");
  assert.equal(safeNextPath("%2Fprojects%2Fdemo%2F"), "/projects/demo/");
  assert.equal(safeNextPath("//evil.example"), "/");
  assert.equal(safeNextPath("https://evil.example"), "/");
  assert.equal(safeNextPath("/ok\nLocation: https://evil.example"), "/");
  assert.equal(safeNextPath(undefined), "/");
});

test("RAC-1317 market relationships format the actual plugin names", () => runWithLocale("en", () => {
  const words = [
    ["workbench.plugin-workbench.removing-also-removes-list", "Removing also removes: Author’s plugin"],
    ["workbench.plugin-workbench.plugins-that-depend-not-added-list", "Plugins that depend on it are not added with it: Author’s plugin"],
    ["workbench.immersive-shell.plugins-that-depend-not-added-list", "; plugins that depend on it are not added with it: Author’s plugin"],
  ];
  for (const [key, expected] of words) assert.equal(t.text(key!, { list: "Author’s plugin" }), expected);
  assert.equal(t.text(SETTINGS), "Settings");
  assert.equal(t.text("workbench.account-menu.not-signed"), "Not signed in");
  assert.equal(t.text("workbench.pane.bound-item"), "Bound to item");
}));

test("every translator call in the product source has a registered English word", () => {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const scan = scanTree(workingTreeSnapshot(repoRoot), isProductSource);
  const { calls } = summarise(scan), callFiles = scan.files.filter(file => file.calls.length).length;
  assert.ok(calls > 7000 && callFiles > 150, `read ${calls} translator calls in ${callFiles} files`);
  assert.deepEqual(scan.problems, []);
});

test("FSS-36 Goal work states have complete explanations and keep concise Chinese labels", () => {
  const states: [GoalPresentationState, string][] = [
    ["waiting_for_human", "需要你决定"], ["executing", "正在推进"], ["execution_blocked", "可记录，尚不可完成"], ["execution_pending", "可记录"],
    ["satisfied", "已完成"], ["invalidated", "已取消"], ["trashed", "回收站"], ["archived", "已归档"],
  ];
  for (const [state, label] of states) {
    const explain = (locale: string) => runWithLocale(locale, () => asOwner("goals", () => explainWorkState(state)));
    const zh = explain("zh"), en = explain("en"), ja = explain("ja");
    assert.equal(zh.label, label, state);
    assert.equal(zh.actionKind, en.actionKind, state);
    assert.equal(zh.actionKind, ja.actionKind, state);
    for (const field of ["label", "meaning", "nextAction", "howToContinue"] as const) {
      assert.ok(zh[field] && en[field] && ja[field], state);
      assert.notEqual(en[field], zh[field], state);
      assert.notEqual(ja[field], en[field], state);
    }
  }
});

test("FSS-69 Host request locales stay isolated across interleaved async rendering and rejection", async () => {
  let entered!: () => void, finished!: () => void;
  const chineseReady = new Promise<void>(resolve => { entered = resolve; });
  const englishChecked = new Promise<void>(resolve => { finished = resolve; });
  const english = runWithLocale("en", () => asOwner("images", async () => {
    try {
      assert.equal(t.text(SETTINGS), "Settings");
      await chineseReady;
      assert.equal(t.text("images.compose.generate"), "Generate image");
      await assert.rejects(runWithLocale("zh", async () => {
        await Promise.resolve();
        assert.equal(t.text(SETTINGS), "设置");
        throw new Error("render rejected");
      }), /render rejected/);
      assert.equal(t.text(SETTINGS), "Settings");
      assert.equal(htmlLang(), "en");
    } finally { finished(); }
  }));
  const chinese = runWithLocale("zh", () => asOwner("images", async () => {
    entered();
    await englishChecked;
    assert.equal(t.text("images.compose.generate"), "生成图片");
    assert.equal(t.text(SETTINGS), "设置");
    assert.equal(htmlLang(), "zh-CN");
  }));
  const japanese = runWithLocale("ja", () => asOwner("images", async () => {
    await Promise.resolve();
    assert.equal(t.text("images.compose.generate"), "画像を生成");
    assert.equal(t.text(SETTINGS), "設定");
    assert.equal(htmlLang(), "ja");
  }));
  await Promise.all([english, chinese, japanese]);
});

test("SYS-48 clipboard Copy and Pages Duplicate stay distinct; their exact owner projection is isolated", () => {
  const expectedCopy = { zh: "复制", en: "Copy", ja: "コピー" } as const;
  const expectedDup = { zh: "创建副本", en: "Duplicate", ja: "複製" } as const;
  for (const locale of ["zh", "en", "ja"] as const) runWithLocale(locale, () => {
    const shown = browserWords(locale, "pages");
    for (const read of [t.text, shown]) assert.equal(read("common.control.copy"), expectedCopy[locale]);
    assert.equal(asOwner("pages", () => t.text("pages.editor.duplicate")), expectedDup[locale]);
    assert.equal(shown("pages.editor.duplicate"), expectedDup[locale]);
    assert.equal(browserWords(locale)("pages.editor.duplicate"), t.text("common.text.unavailable"));
  });
});

test("RAC-56 RAC-57 images words reach their renderer and browser reader in all three languages", () => {
  const expectedTitle = { zh: "生成结果", en: "Results", ja: "生成結果" } as const;
  const expectedSnippet = { zh: "描述你想要的图片", en: "Describe your image", ja: "画像を生成" } as const;
  for (const locale of ["zh", "en", "ja"] as const) runWithLocale(locale, () => asOwner("images", () => {
    const shown = browserWords(locale, "images");
    const messages = pagePack("images", locale).messages;
    for (const [key, word] of Object.entries(messages)) if (typeof word === "string" && !word.includes("{")) {
      assert.equal(t.text(key), word, key);
      assert.equal(shown(key), word, key);
    }
    assert.equal(t.text("images.result.title"), expectedTitle[locale]);
    const page = renderImagesWorkbench({ primitives: { text: t.text, escape: String } });
    assert.doesNotMatch(page, /images\.(?:compose|service|history|account|result)\./);
    assert.ok(page.includes(expectedSnippet[locale]), locale);
  }));
});

test("VUX-40 the Pause control is a verb and the paused state is a state in the Host and the browser", () => {
  for (const [locale, verb, state] of [["en", "Pause", "Paused"], ["zh", "暂停", "已暂停"], ["ja", "一時停止", "一時停止中"]] as const) runWithLocale(locale, () => {
    for (const read of [t.text, browserWords(locale)]) {
      assert.equal(read("workbench.assistant-dock.pause"), verb);
      assert.equal(read("workbench.assistant-island.paused"), state);
    }
  });
});

test("renderLocaleSwitch renders escaped attributes and active state in all three locales", () => {
  for (const [locale, label] of [["zh", "界面语言"], ["en", "Language"], ["ja", "表示言語"]] as const) runWithLocale(locale, () => {
    const html = createWorkbenchLocale(() => locale).renderLocaleSwitch("/settings/memory");
    assert.match(html, new RegExp(`aria-label="${label}"`));
    assert.match(html, new RegExp(`data-ui-language="${locale}" aria-current="true"`));
    assert.match(html, /href="\/locale\?lang=zh&next=%2Fsettings%2Fmemory"/);
    assert.match(html, /href="\/locale\?lang=en&next=%2Fsettings%2Fmemory"/);
    assert.match(html, /href="\/locale\?lang=ja&next=%2Fsettings%2Fmemory"/);
    assert.match(html, /hreflang="ja" lang="ja" data-ui-language="ja"/);
    assert.match(html, />日本語<\/a>/);
  });
});
