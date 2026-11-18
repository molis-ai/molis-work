import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// Batch 29 · Work records settings & real browser locate chain (specs/observation-collection/spec.md;
// OCL-07, OCL-08, OCL-10, OCL-11, OCL-12, OCL-13, OCL-14, OCL-15, OCL-16, PWA-111, PWA-112, EC-13).

const WIDTHS = [1440, 1024, 390] as const;

const PAGE_INSPECT = `(() => {
  const root = document.querySelector('[data-work-records-settings]');
  if (!root) return null;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const nameOf = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const text = by.split(/\\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
      if (text) return text;
    }
    if (el.id) {
      const lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lbl?.textContent?.trim()) return lbl.textContent.trim();
    }
    const wrap = el.closest('label');
    if (wrap?.textContent?.trim()) return wrap.textContent.trim();
    return (el.textContent || '').trim();
  };
  const controls = [...root.querySelectorAll('button, input, select, [role="img"]')].filter(visible);
  const unnamed = controls.filter((el) => !nameOf(el)).map((el) => el.outerHTML.slice(0, 120));
  const words = [...root.querySelectorAll('*')].filter((n) => n.tagName !== 'STYLE' && n.tagName !== 'SCRIPT')
    .map((n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.data).join('') + ' ' + (n.getAttribute('aria-label') ?? '') + ' ' + (n.getAttribute('title') ?? ''))
    .join(' ');
  const marks = [...root.querySelectorAll('.mw-mark[data-hue]')].filter(visible);
  return {
    tab: root.querySelector('[data-wr-tab].is-active')?.getAttribute('data-wr-tab') ?? '',
    words,
    unnamed,
    pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    markColors: marks.map((el) => getComputedStyle(el).color),
    markBgs: marks.map((el) => getComputedStyle(el).backgroundColor),
    catLegendCount: root.querySelectorAll('.mw-cat-bar__legend > li').length,
    catSegCount: root.querySelectorAll('.mw-cat-bar__seg').length,
  };
})()`;

test("OCL-08 OCL-11 OCL-12 OCL-13 OCL-14 OCL-15 OCL-16 PWA-111 PWA-112: Global Settings · Work records renders cleanly in zh/en × 3 widths × light/dark and drives real SQLite pause, uses, retention, manual clean-up, space reminder and coverage gaps", { timeout: 300_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { origin, projectId, localHost, sessionId, command, setViewport, evaluate, waitFor, click, navigate } = browser;
  assert.ok(localHost?.observation, "Local Host wires the observation layer");
  const layer = localHost.observation.layer;
  const shots = process.env.MOLIS_WORK_BOARD_SHOTS === "1" ? join(REVIEW_EVIDENCE, "batch-29") : "";
  if (shots) await mkdir(shots, { recursive: true });

  // Seed historical records (before 2026-08-01) and current records across all five kinds plus snapshot evidence.
  const oldAt = "2026-06-15T10:00:00.000Z";
  const oldMs = Date.parse(oldAt);
  const recentAt = "2026-10-20T12:00:00.000Z";
  const recentMs = Date.parse(recentAt);
  const seedCaller: ActionCallContext = {
    actor_id: LOCAL_PERSON_ACTOR_ID,
    actor_kind: "user",
    audience: "user",
    project_id: projectId!,
    permissions: [],
  };
  layer.observed(
    seedCaller,
    { capability_id: "goals.note", version: 1, provider_id: "io.molis.work.goals", operation: "command" },
    {
      invocation_id: "inv-seed-old-write",
      started_at: oldMs - 12,
      ended_at: oldMs,
      handler_started: true,
      input: { goal_id: "V1", body: "六月旧记录证据快照".repeat(20) },
      result: { ok: true },
      outcome: { ok: true },
      aborted: false,
    },
  );
  layer.observed(
    seedCaller,
    { capability_id: "goals.state.read", version: 1, provider_id: "io.molis.work.goals", operation: "query" },
    {
      invocation_id: "inv-seed-recent-read",
      started_at: recentMs - 8,
      ended_at: recentMs,
      handler_started: true,
      input: { goal_id: "V1" },
      result: { ok: true },
      outcome: { ok: true },
      aborted: false,
    },
  );
  layer.sink("agent")
    .bind({ kind: "background", entry: "agent", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId!, call_id: "seed-ai-1" })
    .record({ fact: "agent.run", stage: "started", outcome: "succeeded", occurred_at: recentAt, work: { run_id: "run-seed-1" } });
  layer.sink("scheduler")
    .bind({ kind: "background", entry: "schedule", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId!, call_id: "seed-sched-1" })
    .record({ fact: "scheduler.wakeup", outcome: "succeeded", occurred_at: recentAt });
  layer.flush();

  const prefix = `/projects/${projectId}`;
  const setLocale = async (lang: "zh" | "en") => {
    await command("Network.setCookie", { name: "molis_work_locale", value: lang, url: origin }, sessionId);
  };
  const openSettings = async (width: number, mobile = width === 390) => {
    await setViewport(width, width === 390 ? 844 : 900, mobile);
    await navigate(() => command("Page.navigate", { url: `${origin}${prefix}/?settingsPath=${encodeURIComponent("/settings/work-records")}` }, sessionId));
    await waitFor("!!document.querySelector('[data-work-records-settings] #wr-rec')", 25_000);
  };

  // 1. Visual & structural verification across zh/en × 1440/1024/390 × light/dark, plus nav entry under Personal right after Memory.
  for (const lang of ["zh", "en"] as const) {
    await setLocale(lang);
    for (const width of WIDTHS) {
      await openSettings(width);
      if (width === 1440) {
        const navOrder = await evaluate<string[]>(`(() => {
          const links = [...document.querySelectorAll('[data-settings-section], .settings-navigation a[href*="/settings/"]')];
          return links.map((el) => el.getAttribute('data-settings-section') || el.getAttribute('href') || '').filter(Boolean);
        })()`);
        const memIdx = navOrder.findIndex((x) => x === "memory" || x.includes("/settings/memory"));
        const wrIdx = navOrder.findIndex((x) => x === "work-records" || x.includes("/settings/work-records"));
        assert.ok(memIdx >= 0 && wrIdx === memIdx + 1, `${lang}: work-records sits immediately after memory in settings navigation (${JSON.stringify(navOrder)})`);
      }

      for (const theme of ["light", "dark"] as const) {
        await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
        await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; document.documentElement.dataset.resolvedTheme = ${JSON.stringify(theme)};`);
        const seenScope = await evaluate<{
          tab: string; words: string; unnamed: string[]; pageScroll: number; markColors: string[]; markBgs: string[];
        }>(PAGE_INSPECT);
        assert.ok(seenScope);
        assert.equal(seenScope.tab, "scope");
        if (lang === "en") {
          const han = seenScope.words.match(/[\u3400-\u9fff]+/gu)?.join(" ") ?? "";
          assert.equal(han, "", `en ${width}px ${theme}: no untranslated Chinese in scope tab`);
        }
        assert.deepEqual(seenScope.unnamed, [], `${lang} ${width}px ${theme}: every control in scope tab is named`);
        assert.equal(seenScope.pageScroll, 0, `${lang} ${width}px ${theme}: zero horizontal overflow on scope tab`);
        assert.equal(new Set(seenScope.markColors).size, 5, `${lang} ${width}px ${theme}: five distinct --mark-* hues`);
        assert.equal(new Set(seenScope.markBgs).size, 5, `${lang} ${width}px ${theme}: five distinct --mark-*-fill backgrounds`);

        if (shots && (width === 1440 || width === 390)) {
          const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
          await writeFile(join(shots, `settings-work-records-scope-${width}-${lang}-${theme}.png`), Buffer.from(shot.data, "base64"));
        }
      }
    }
  }

  // Check tabs clean, space and gaps in English too (verifying zero leaked Chinese or snake_case codes, and capturing shots).
  await setLocale("en");
  await openSettings(1440);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, sessionId);
  await evaluate(`document.documentElement.dataset.theme = "light"; document.documentElement.dataset.resolvedTheme = "light";`);
  for (const tabId of ["clean", "space", "gaps"] as const) {
    await click(`[data-wr-tab="${tabId}"]`);
    await waitFor(`document.querySelector('[data-wr-tab="${tabId}"]')?.classList.contains('is-active')`, 10_000);
    const seen = await evaluate<{ tab: string; words: string; unnamed: string[]; pageScroll: number; catLegendCount: number }>(PAGE_INSPECT);
    assert.ok(seen);
    assert.equal(seen.tab, tabId);
    assert.equal(seen.words.match(/[\u3400-\u9fff]+/gu)?.join(" ") ?? "", "", `en ${tabId}: zero untranslated Chinese`);
    assert.ok(!/child_stream_not_followed|isolated_page_scroll_not_seen|reads_coalesced_per_minute/u.test(seen.words), `en ${tabId}: zero raw snake_case reason codes`);
    assert.deepEqual(seen.unnamed, [], `en ${tabId}: zero unnamed controls`);
    assert.equal(seen.pageScroll, 0, `en ${tabId}: zero horizontal overflow`);
    if (tabId === "space") assert.equal(seen.catLegendCount, 6, "space category bar keeps all 6 legend items");
    if (shots) {
      const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(join(shots, `settings-work-records-${tabId}-1440-en-light.png`), Buffer.from(shot.data, "base64"));
    }
  }

  // 2. Interactive end-to-end mutations in zh against real SQLite.
  await setLocale("zh");
  await openSettings(1440);

  // Tab 1 (scope): expand kind details, pause & resume recording, toggle evaluation use switch.
  await click('[data-wr-open="kind-user"]');
  await waitFor("!!document.querySelector('[data-work-records-settings] .wr-more')", 10_000);
  await click('[data-wr-act="pause"]');
  await waitFor("!!document.querySelector('[data-work-records-settings] [data-wr-act=\"resume\"]')", 10_000);
  const pausedView = await evaluate<{ recording: { state: string } }>("molisWorkRequest('/api/observation/settings', { body: {} })");
  assert.equal(pausedView.recording.state, "paused", "pause persists in observation.db");
  if (shots) {
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(shots, "settings-work-records-paused-1440-zh-light.png"), Buffer.from(shot.data, "base64"));
  }
  await click('[data-wr-act="resume"]');
  await waitFor("!!document.querySelector('[data-work-records-settings] [data-wr-act=\"pause\"]')", 10_000);

  await evaluate(`(() => {
    const sw = document.querySelector('[data-wr-use="evaluation"]');
    sw.checked = false;
    sw.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor("document.querySelector('#wr-use-evaluation')?.parentElement?.textContent?.includes('评测读不到')", 10_000);
  const evalOff = await evaluate<{ uses: { evaluation: boolean } }>("molisWorkRequest('/api/observation/settings', { body: {} })");
  assert.equal(evalOff.uses.evaluation, false, "turning off evaluation persists in observation.db");
  await evaluate(`(() => {
    const sw = document.querySelector('[data-wr-use="evaluation"]');
    sw.checked = true;
    sw.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor("!document.querySelector('#wr-use-evaluation')?.parentElement?.textContent?.includes('评测读不到')", 10_000);

  // Tab 2 (clean): manual clean-up dialog preview & apply first (before retention sweep), then jump to Coverage & gaps, then test 30-day retention shortfall warning & save.
  await click('[data-wr-tab="clean"]');
  await waitFor("!!document.querySelector('[data-wr-period]')", 10_000);

  const ref = molisWorkHostProjectReference({ databasePath: browser.databasePath, projectId: projectId! });
  const personCaller = await localHost.localPersonContext(ref);
  const client = localHost.actionClient(ref);
  const countGoals = async () => ((await client.invoke(personCaller, goalsActions.list, { limit: 100 })) as { goals: readonly unknown[] }).goals.length;
  const goalsBeforeCleanup = await countGoals();
  assert.ok(goalsBeforeCleanup > 0);
  await click('[data-wr-act="openDlg"]');
  await waitFor("document.querySelector('[data-wr-dialog]')?.open === true", 10_000);
  await evaluate(`(() => {
    const input = document.querySelector('[data-wr-dlg-before]');
    input.value = '2026-08-01';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor("document.querySelector('[data-wr-dialog] .wr-size')?.textContent?.includes('1')", 10_000);
  if (shots) {
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(shots, "settings-work-records-dialog-1440-zh-light.png"), Buffer.from(shot.data, "base64"));
  }
  await click('[data-wr-act="applyDlg"]');
  await waitFor("!document.querySelector('[data-wr-dialog]')?.open && !!document.querySelector('[data-wr-goto=\"gaps\"]')", 15_000);
  assert.equal(await countGoals(), goalsBeforeCleanup, "manual clean-up never deletes business objects");

  // Jump from post-cleanup banner to Tab 4 (gaps) and verify expired gap + filter toggles + collapsibles.
  await click('[data-wr-goto="gaps"]');
  await waitFor("document.querySelector('[data-wr-tab=\"gaps\"]')?.classList.contains('is-active')", 10_000);
  const gapsText = await evaluate<string>("document.querySelector('[data-wr-panel]')?.textContent ?? ''");
  assert.match(gapsText, /到期清除/, "cleaned window shows as Cleared by retention in Coverage & gaps");
  await click('[data-wr-filter="plugin"]');
  await waitFor("document.querySelector('[data-wr-filter=\"plugin\"]')?.getAttribute('aria-pressed') === 'true'", 10_000);
  await click('[data-wr-filter="all"]');
  await waitFor("document.querySelector('[data-wr-filter=\"all\"]')?.getAttribute('aria-pressed') === 'true'", 10_000);
  if (shots) {
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(shots, "settings-work-records-gaps-1440-zh-light.png"), Buffer.from(shot.data, "base64"));
  }

  // Return to Tab 2 (clean) and verify shortfall warning before saving 30-day retention, then revert to keep.
  await click('[data-wr-tab="clean"]');
  await waitFor("!!document.querySelector('[data-wr-period]')", 10_000);
  await evaluate(`(() => {
    const sel = document.querySelector('[data-wr-period]');
    sel.value = '30';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor("!!document.querySelector('[data-wr-act=\"savePeriod\"]')", 10_000);
  const stillKeep = await evaluate<{ retention: { mode: string } }>("molisWorkRequest('/api/observation/settings', { body: {} })");
  assert.equal(stillKeep.retention.mode, "keep", "short period shows impact warning before saving");
  await click('[data-wr-act="savePeriod"]');
  await waitFor("!document.querySelector('[data-wr-act=\"savePeriod\"]')", 10_000);
  const saved30 = await evaluate<{ retention: { mode: string } }>("molisWorkRequest('/api/observation/settings', { body: {} })");
  assert.equal(saved30.retention.mode, "30", "confirming short period saves retention_mode=30");
  await evaluate(`(async () => {
    const sel = document.querySelector('[data-wr-period]');
    sel.value = 'keep';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 40; i += 1) {
      const s = await molisWorkRequest('/api/observation/settings', { body: {} });
      if (s.retention.mode === 'keep') return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('retention.mode did not revert to keep');
  })()`);

  // Tab 3 (space): enable space reminder, step +0.5 GB to 2.5 GB, save, verify meter & SQLite persistence.
  await click('[data-wr-tab="space"]');
  await waitFor("!!document.querySelector('#wr-rem')", 10_000);
  await evaluate(`(() => {
    const sw = document.querySelector('[data-wr-act="remToggle"]');
    sw.checked = true;
    sw.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor("!!document.querySelector('[data-wr-act=\"remSave\"]')", 10_000);
  await click('[data-wr-step="0.5"]');
  await click('[data-wr-act="remSave"]');
  await waitFor("!!document.querySelector('#wr-meter')", 10_000);
  const remSaved = await evaluate<{ space_reminder_bytes: number }>("molisWorkRequest('/api/observation/settings', { body: {} })");
  assert.equal(remSaved.space_reminder_bytes, 2_500_000_000, "2.5 GB reminder saved to observation.db");
  if (shots) {
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(shots, "settings-work-records-space-1440-zh-light.png"), Buffer.from(shot.data, "base64"));
  }

  // 3. Verify `purged` state badge/effect and all writer/report/sink gap reasons render localized copy in zh and en (zero snake_case or generic fallback).
  layer.purgePlugin({
    plugin_id: "io.molis.work.native.workflows",
    install_ids: ["inst-wf-seed"],
    provider_ids: ["io.molis.work.native.workflows"],
    project_id: projectId!,
  });
  const gapKey = { owner: "service:gateway", fact: "action.call", entry: "host" as const, project_id: projectId! };
  layer.writer.gap(gapKey, "lost", "queue_full", 3);
  layer.writer.gap(gapKey, "lost", "store_unavailable", 2);
  layer.writer.gap({ owner: "shell", fact: "ui.open", entry: "workbench", project_id: projectId! }, "lost", "report_quota", 5);
  layer.writer.gap(gapKey, "unavailable", "evidence_key", 1);
  layer.writer.gap({ owner: "observation", fact: "*", entry: "host", project_id: "" }, "lost", "unknown_exit", 1);
  layer.writer.gap(gapKey, "lost", "exit_failed", 1);
  layer.writer.gap({ owner: "service:agent", fact: "agent.run", entry: "host", project_id: projectId! }, "lost", "record_failed", 2);
  layer.writer.gap({ owner: "service:agent", fact: "other.fact", entry: "host", project_id: projectId! }, "lost", "fact_not_owned", 1);
  layer.flush();

  await setLocale("zh");
  await openSettings(1440);
  await click('[data-wr-tab="gaps"]');
  await waitFor("document.querySelector('[data-wr-tab=\"gaps\"]')?.classList.contains('is-active')", 10_000);
  const purgedInfo = await evaluate<{ key: string; panelText: string }>(`(() => {
    const items = [...document.querySelectorAll('[data-wr-panel] .mw-item')];
    const purgedRow = items.find((el) => el.textContent?.includes('你在清除插件数据时一并清掉了这段内容'));
    return {
      key: purgedRow?.querySelector('[data-wr-open]')?.getAttribute('data-wr-open') ?? '',
      panelText: document.querySelector('[data-wr-panel]')?.textContent ?? '',
    };
  })()`);
  assert.ok(purgedInfo.key, `purged plugin row is rendered in Coverage & gaps (saw: ${purgedInfo.panelText.slice(0, 500)})`);
  await click(`[data-wr-open=${JSON.stringify(purgedInfo.key)}]`);
  await waitFor("document.querySelector('[data-wr-panel]')?.textContent?.includes('插件数据已按你的选择清除；调用过谁保留记录，内容不再重看')", 10_000);
  const zhAllGapsText = await evaluate<string>("document.querySelector('[data-wr-panel]')?.textContent ?? ''");
  for (const expected of [
    "已清除",
    "你在清除插件数据时一并清掉了这段内容",
    "插件数据已按你的选择清除；调用过谁保留记录，内容不再重看",
    "待写队列已满，3 条没能保存",
    "磁盘或数据库写入失败，2 条没能保存",
    "超过当日上报上限，5 条未接收",
    "本机证据密钥暂不可用，1 处正文未能封存",
    "上次应用异常退出前待写记录未保存完",
    "记录组装异常，1 条未能入队",
    "记录组装异常，2 条未能入队",
    "上报名称不在来源允许的前缀内，1 条已拦截",
  ]) {
    assert.ok(zhAllGapsText.includes(expected), `zh gaps renders "${expected}"`);
  }
  assert.ok(!zhAllGapsText.includes("按当前版本采集规则记录"), "zh gaps never falls back to cause-generic for known reasons");
  assert.ok(!/plugin_data_cleared|queue_full|store_unavailable|report_quota|evidence_key|unknown_exit|exit_failed|record_failed|fact_not_owned/u.test(zhAllGapsText), "zh gaps leaks zero raw snake_case reason codes");

  await setLocale("en");
  await openSettings(1440);
  await click('[data-wr-tab="gaps"]');
  await waitFor("document.querySelector('[data-wr-tab=\"gaps\"]')?.classList.contains('is-active')", 10_000);
  const enPurgedExpandKey = await evaluate<string>(`(() => {
    const items = [...document.querySelectorAll('[data-wr-panel] .mw-item')];
    const purgedRow = items.find((el) => el.textContent?.includes('Cleared when you removed this plugin’s data'));
    return purgedRow?.querySelector('[data-wr-open]')?.getAttribute('data-wr-open') ?? '';
  })()`);
  assert.ok(enPurgedExpandKey, "en purged plugin row is rendered in Coverage & gaps");
  await click(`[data-wr-open=${JSON.stringify(enPurgedExpandKey)}]`);
  await waitFor("document.querySelector('[data-wr-panel]')?.textContent?.includes('Plugin data was cleared at your request; call records stay without their content')", 10_000);
  const enSeenGaps = await evaluate<{ words: string }>(PAGE_INSPECT);
  assert.ok(enSeenGaps);
  assert.equal(enSeenGaps.words.match(/[\u3400-\u9fff]+/gu)?.join(" ") ?? "", "", "en gaps with purged & writer gaps: zero untranslated Chinese");
  for (const expected of [
    "Data cleared",
    "Cleared when you removed this plugin’s data",
    "Plugin data was cleared at your request; call records stay without their content",
    "Write queue was full; 3 records were not saved",
    "Disk or database write failed; 2 records were not saved",
    "Daily reporting limit reached; 5 records were skipped",
    "Local evidence key was unavailable; 1 body could not be sealed",
    "The previous app session exited before saving queued records",
    "Internal recording error; 1 record was not queued",
    "Internal recording error; 2 records were not queued",
    "1 fact outside the caller’s prefix was rejected",
  ]) {
    assert.ok(enSeenGaps.words.includes(expected), `en gaps renders "${expected}"`);
  }
  assert.ok(!enSeenGaps.words.includes("Recorded under this version’s collection rules"), "en gaps never falls back to cause-generic for known reasons");
  assert.ok(!/plugin_data_cleared|queue_full|store_unavailable|report_quota|evidence_key|unknown_exit|exit_failed|record_failed|fact_not_owned/u.test(enSeenGaps.words), "en gaps leaks zero raw snake_case reason codes");
});

test("OCL-07 OCL-10 EC-13: real browser Global Search locate highlights the chosen same-title Goal in DOM and records ui.locate returned on workbench history back", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { origin, projectId, databasePath, localHost, sessionId, command, setViewport, evaluate, waitFor, click, navigate } = browser;
  assert.ok(localHost?.observation);
  await setViewport(1440, 900, false);

  const ref = molisWorkHostProjectReference({ databasePath, projectId: projectId! });
  const personCaller = await localHost.localPersonContext(ref);
  const client = localHost.actionClient(ref);
  const firstGoalId = "LOCATE-TWIN-1";
  const targetGoalId = "LOCATE-TWIN-2";
  await client.invoke(personCaller, goalsActions.create, {
    goal_id: firstGoalId,
    title: "周度复盘目标",
    outcome: "第一条目标用于起始停留锚点",
    why: "同标题定位区分测试",
    idempotency_key: randomUUID(),
  });
  await client.invoke(personCaller, goalsActions.create, {
    goal_id: targetGoalId,
    title: "周度复盘目标",
    outcome: "真实浏览器定位高亮验证短语",
    why: "同标题定位区分测试",
    idempotency_key: randomUUID(),
  });

  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=goals&openItem=${firstGoalId}` }, sessionId));
  await waitFor(`JSON.parse(document.querySelector('[data-goal-frame-surface]')?.getAttribute('data-assistant-context') || '{}').object?.id === ${JSON.stringify(firstGoalId)}`, 25_000);

  // Open Global Search, search the outcome phrase (not the shared title), and pick targetGoalId.
  await click("[data-global-search-open]");
  await waitFor("document.querySelector('[data-global-search-dialog]')?.open === true", 10_000);
  await evaluate(`(() => {
    const input = document.querySelector('[data-global-search]');
    input.value = '真实浏览器定位高亮验证短语';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const hitSelector = `[data-global-search-hit][data-global-search-id=${JSON.stringify(targetGoalId)}]`;
  await waitFor(`!!document.querySelector(${JSON.stringify(hitSelector)})`, 30_000);
  await click(hitSelector);
  await waitFor("!document.querySelector('[data-global-search-dialog]')?.open", 10_000);

  // Wait for Goals surface to show targetGoalId AND for locate() to apply ::highlight(molis-search-hit) on the outcome text.
  await waitFor("document.documentElement.dataset.searchHit === '真实浏览器定位高亮验证短语'", 20_000);

  // Step back via the workbench shell's history button (`goHistory(-1)` -> `molisWorkHistoryStep` -> `workRecords.returned()`).
  await waitFor("document.querySelector('[data-workspace-history=back]') && !document.querySelector('[data-workspace-history=back]').disabled", 10_000);
  await click("[data-workspace-history=back]");

  // Flush the browser's UI work-record queue via visibilitychange -> hidden, then flush the Host writer and query SQLite.
  await evaluate(`(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  localHost.observation.layer.flush();

  const queried = await evaluate<{ records: Array<{ fact: string; stage?: string; subjects: Array<{ kind: string; id: string }>; work: { work_ref?: string } }> }>(
    `molisWorkRequest('/api/observation/records', { body: { use: 'lookback', project_id: ${JSON.stringify(projectId)}, limit: 500 } })`,
  );
  const uiRecords = queried.records.filter((r) => r.fact === "ui.candidates" || r.fact === "ui.locate");
  const locateStages = uiRecords.filter((r) => r.fact === "ui.locate" && r.subjects.some((s) => s.id === targetGoalId));
  assert.deepEqual(
    locateStages.map((r) => r.stage),
    ["requested", "loading", "visible", "highlighted", "returned"],
    "real browser DOM locate records requested -> loading -> visible -> highlighted -> returned in order for the chosen same-title Goal",
  );
  const chosenRecord = uiRecords.find((r) => r.fact === "ui.candidates" && r.stage === "chosen" && r.subjects.some((s) => s.id === targetGoalId));
  assert.ok(chosenRecord?.work.work_ref, "chosen candidate carries work_ref");
  const allInteractionRefs = new Set([chosenRecord!.work.work_ref, ...locateStages.map((r) => r.work.work_ref)]);
  assert.equal(allInteractionRefs.size, 1, "candidates chosen and all 5 ui.locate stages share one work_ref");
  assert.ok(!locateStages.some((r) => r.subjects.some((s) => s.id === firstGoalId)), "never confuses the twin Goal that shares the same title");
});
