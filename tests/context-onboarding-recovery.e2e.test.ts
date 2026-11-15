import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { INPUT_RECEIPTS_CLIENT_SCRIPT, STATE_RING_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { CODING_PLAN_PROGRESS_CLIENT_FACTORY_SCRIPT, CODING_STYLES, CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { openBoardBrowser } from "./fixtures/board-browser.js";
import { standInKey } from "./fixtures/first-model-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { assertLayoutClean } from "./fixtures/layout-audit.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";
import { pageTextScript } from "./fixtures/page-text.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

async function seedStandInModel(home: string, endpoint: string): Promise<void> {
  process.env.MOLIS_WORK_SECRET_BACKEND ??= "file";
  await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => {
    const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "model-api", displayName: "Stand-in OpenAI", token: standInKey }));
    withConnectorConnections(home, store => store.assertTarget(connection.connection_id, "model-api", endpoint));
    catalog.models.upsert({
      credential_ref: connection.credential_ref!,
      provider_id: "standin",
      display_name: "Gemini 2.5 Pro",
      base_url: endpoint,
      api_format: "openai-chat-completions",
      models: [{ model_id: "gemini-2.5-pro", enabled: true }],
    });
  });
}

async function openRecoveryBrowser(t: TestContext, options: { board?: boolean; reply?: string } = {}) {
  const reply = options.reply ?? "# 项目启动背景\n已核对主说明与构建脚本 [S1]。";
  const model = await startModelStandIn(standInKey, reply);
  t.after(() => model.close());
  const open = options.board ? openBoardBrowser : openGoalBrowser;
  const browser = await open(t, "empty", undefined, async () => reply, undefined, undefined, {
    prepareHome: (dir) => seedStandInModel(dir, model.baseUrl),
  });
  if (!browser) return null;
  const { command, sessionId, evaluate, waitFor } = browser;
  const setView = async (width: number, theme: "light" | "dark") => {
    await browser.setViewport(width, 900, width < 600);
    await command("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: theme }],
    }, sessionId);
    await evaluate(`localStorage.setItem('molis-work:theme','${theme}'); dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'${theme}'}))`);
    await waitFor(`innerWidth === ${width} && document.documentElement.dataset.resolvedTheme === '${theme}'`);
  };
  return { ...browser, model, setView };
}

test("Batch 33 component catalog specimens (#recovery-closures) pass layout audit across 1440/1024/390/320 and light/dark", { timeout: 120_000 }, async t => {
  // CHO-11, CHO-12, CHO-13, CHO-35, ONB-38, C12, C14
  const b = await openRecoveryBrowser(t, { board: true });
  if (!b) return;
  const { command, sessionId, evaluate, waitFor, setView } = b;
  const output = reviewEvidenceUrl("batch33-recovery-catalog/");
  await mkdir(output, { recursive: true });

  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/__ui/catalog?lang=zh#recovery-closures` }, sessionId));
  await waitFor("Boolean(document.getElementById('recovery-closures')) && Boolean(document.querySelector('[data-primitive=\"round-materials\"]'))");
  await evaluate("document.getElementById('recovery-closures').setAttribute('data-audit-scope', '')");

  for (const width of [1440, 1024, 390, 320]) {
    for (const theme of ["light", "dark"] as const) {
      await setView(width, theme);
      await evaluate("document.getElementById('recovery-closures').scrollIntoView({ block: 'start' })");
      await assertLayoutClean(evaluate, `catalog #recovery-closures ${width}/${theme}`, {
        allow: (finding) => finding.kind === "page-overflow-y",
      });
      if (width === 1440 || width === 390) {
        const { data } = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
        await writeFile(new URL(`catalog-${width}-${theme}.png`, output), Buffer.from(data, "base64"));
      }
    }
  }

  // B6: English catalog #recovery-closures renders with zero Han characters and clean layout.
  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/__ui/catalog?lang=en#recovery-closures` }, sessionId));
  await waitFor("Boolean(document.getElementById('recovery-closures')) && Boolean(document.querySelector('[data-primitive=\"round-materials\"]'))");
  await evaluate("document.getElementById('recovery-closures').setAttribute('data-audit-scope', '')");
  const enHan = await evaluate<string[]>(`(() => {
    const scope = document.getElementById('recovery-closures');
    return [scope, ...scope.querySelectorAll('*')]
      .flatMap(node => [...node.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent).concat([...node.attributes].map(attr => attr.value)))
      .filter(value => /[\\u3400-\\u9fff]/.test(value));
  })()`);
  assert.deepEqual(enHan, [], "English #recovery-closures contains zero Chinese characters");
  await setView(390, "light");
  await assertLayoutClean(evaluate, "catalog en #recovery-closures 390/light", {
    allow: (finding) => finding.kind === "page-overflow-y",
  });

  // B1 & B4: Mount real Coding TaskBoard & PlanProgress client bundles in a fresh Chrome document to prove 50% progress, zero NaN, and unknown_outcome reconcile controls.
  await b.navigate(() => command("Page.navigate", { url: "about:blank" }, sessionId));
  await evaluate(`(() => { ${pageTextScript("zh", "coding")} })()`);
  const boardDom = await evaluate<{ meta: string; cardText: string; hasReconcile: boolean; posted: unknown[] }>(`(async () => {
    document.body.innerHTML = '<section data-coding-board><h2 data-coding-board-title></h2><p data-coding-board-meta></p><div data-coding-board-list></div><p data-coding-board-status></p></section>';
    ${STATE_RING_CLIENT_SCRIPT}
    const sheet = document.createElement('style'); sheet.textContent = ${JSON.stringify(CODING_STYLES)}; document.head.append(sheet);
    const board = document.querySelector('[data-coding-board]'), lifetime = (${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})()(document.body), posted = [];
    const taskboard = (${CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT})({
      lifetime, translate: t.text, board, current: () => 's', status: () => {}, ownTask: text => text, roleName: id => id,
      navigate: async () => {}, amend: async (runId, version, amendment) => { posted.push({ runId, version, amendment }); }, from: () => null,
    });
    const card = (${CODING_PLAN_PROGRESS_CLIENT_FACTORY_SCRIPT})({
      lifetime, translate: t.text, roleLabel: () => undefined,
      api: async (path, method, body) => { posted.push({ path, method, body }); return { board: { terminal: false }, steered: true }; },
      current: () => 's', status: () => {}, refresh: async () => {}, openStep: () => {}, from: () => null,
      stepOf: taskboard.stepOf, skipped: taskboard.skipped, settled: taskboard.settled, word: (${INPUT_RECEIPTS_CLIENT_SCRIPT})(t.text).step,
    });
    const plan = { revision: 1, content: { title: '恢复计划', steps: [{ title: '生成迁移脚本', acceptance: '脚本落盘' }, { title: '跑回归验证', acceptance: '全绿' }] } };
    const nodes = [
      { id: 'step-1', state: 'succeeded', story_points: 3, unknown_outcome: true, reports: [{ note: '已发起命令', at_ms: 1 }] },
      { id: 'step-2', state: 'running', story_points: 5, progress: 0.5, progress_basis: '2/4 用例通过', reports: [{ note: '已完成一半', at_ms: 2 }] },
    ];
    const progress_summary = { weighted_percent: 31.3, completed_points: 2.5, total_points: 8, estimated_leaves: 2, unestimated_leaves: 0, completed_unestimated_leaves: 0, removed_scope_leaves: 0, removed_scope_points: 0 };
    const run = { ref: { run_id: 'r1' }, phase: 'reconcile-required', started_at: new Date(0).toISOString(), frozen: { role_id: 'builder' }, turns: [] };
    const entry = { run_id: 'r1', revision: 1, plan, board: { project_id: 'p1', version: 2, terminal: false, nodes, progress_summary }, verdicts: {} };
    const shown = card.render(run, entry, false, true);
    document.body.append(shown);
    taskboard.update('s', { session: { title: '会话' }, plan: { ...plan, confirmed: { artifact_id: 'x', version: 1 } }, runs: [run], taskboard_plans: [entry] });
    board.hidden = false; taskboard.show(); await Promise.resolve();
    const btns = [...shown.querySelectorAll('.coding-plan-step button')].map(btn => btn.title || btn.textContent.trim());
    return {
      meta: board.textContent || '',
      cardText: shown.textContent || '',
      btns,
      hasReconcile: btns.some(label => label.includes('确认已完成')) && btns.some(label => label.includes('重新运行')),
      posted,
    };
  })()`);
  assert.equal(boardDom.meta.includes("NaN"), false, `TaskBoard must never render NaN: ${boardDom.meta}`);
  assert.match(boardDom.meta, /2\.5 \/ 8 点/);
  assert.match(boardDom.meta, /50%/);
  assert.match(boardDom.meta, /结果未知，待核对/);
  assert.equal(boardDom.hasReconcile, true, "PlanProgress card offers 确认已完成 and 重新运行 for unknown_outcome steps");
});

test("ONB-36, ONB-38, ONB-39, ONB-40, ONB-42, C2, C3, C6: real browser upload persistence, secret-hold choice, 5-cell funnel, and scope-delta layout", { timeout: 150_000 }, async t => {
  const b = await openRecoveryBrowser(t);
  if (!b) return;
  const { command, sessionId, evaluate, waitFor, click, setView } = b;
  const output = reviewEvidenceUrl("batch33-onboarding-recovery/");
  await mkdir(output, { recursive: true });

  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/` }, sessionId));
  await setView(1440, "light");
  await waitFor("document.querySelector('.opening.is-done')");
  await click("[data-action=intro-next]");
  await waitFor("document.querySelector('.welcome')?.dataset.step === 'language'");
  await click("[data-action=intro-next]");
  await waitFor("document.querySelector('.welcome')?.dataset.step === 'appearance'");
  await click("[data-action=intro-next]");
  await waitFor("document.querySelector('[data-ob-view=sources]')");

  const readmePath = join(b.homeDirectory, "README.md");
  const dockerfilePath = join(b.homeDirectory, "Dockerfile");
  const envPath = join(b.homeDirectory, ".env.local");
  const extraPath = join(b.homeDirectory, "CHANGELOG.md");
  const browserSecret = ["sk", "live", "browsersecret9988776655443322"].join("-");
  await writeFile(readmePath, "# 项目说明\n周五发布新版构建流。\n", "utf8");
  await writeFile(dockerfilePath, "FROM node:24-alpine\nCMD [\"node\", \"index.js\"]\n", "utf8");
  await writeFile(envPath, `${["OPENAI", "API", "KEY"].join("_")}=${browserSecret}\nPORT=3000\n`, "utf8");
  await writeFile(extraPath, "# 变更记录\n补充增量范围核对。\n", "utf8");

  const setInputFiles = async (files: string[]) => {
    const { root } = await command<{ root: { nodeId: number } }>("DOM.getDocument", { depth: 0 }, sessionId);
    const { nodeId } = await command<{ nodeId: number }>("DOM.querySelector", { nodeId: root.nodeId, selector: "#cx-upload-files" }, sessionId);
    assert.ok(nodeId);
    await command("DOM.setFileInputFiles", { nodeId, files }, sessionId);
  };

  await setInputFiles([readmePath, dockerfilePath, envPath]);
  await waitFor("document.querySelector('.ob-right')?.textContent.includes('Dockerfile') && document.querySelector('.ob-right')?.textContent.includes('.env.local')");
  assert.equal(await evaluate("Boolean(document.querySelector('.ob-right .mw-file-kind--env'))"), true, ".env.local renders .mw-file-kind--env file badge");

  // C6 & ONB-36: reload BEFORE starting; IndexedDB restores chosen uploads so the person does not have to re-pick!
  await b.navigate(() => command("Page.reload", {}, sessionId));
  await waitFor("document.querySelector('[data-ob-view=sources]') && document.querySelector('.ob-right')?.textContent.includes('Dockerfile')");

  await click("[data-action=prepare]");
  await waitFor("document.querySelector('[data-ob-view=model]') && document.querySelector('[data-action=start]:not(:disabled)')");
  await click("[data-action=start]");

  // C2 & ONB-38: .env.local is held for explicit user decision while README + Dockerfile finish; 5-number funnel & 5-cell track render!
  await waitFor("Boolean(document.querySelector('[data-action=adopt]:not(:disabled)')) && Boolean(document.querySelector('[data-slot=\"materials-verification\"]')) && Boolean(document.querySelector('[data-secret-decision=\"strip\"]'))", 20_000);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.mw-mr-funnel li b')).at(-1)?.textContent"), "—", "C3: the fifth funnel stage is not claimed as adopted before adoption");
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.mw-mr-cells')).some(cell => cell.querySelectorAll('.mw-mr-track i.is-on').length === 5)"), false, "C3: no material row shows all five stages before adoption");

  for (const width of [1440, 1024, 390, 320]) {
    for (const theme of ["light", "dark"] as const) {
      await setView(width, theme);
      await assertLayoutClean(evaluate, `onboarding verification + secret hold ${width}/${theme}`);
    }
  }
  await setView(1440, "light");
  const { data: heldShot } = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
  await writeFile(new URL("onboarding-secret-hold-1440.png", output), Buffer.from(heldShot, "base64"));

  // Choose "strip" (去掉秘密值再发) -> re-runs without raw secret and reaches review!
  await click("[data-secret-decision=\"strip\"]");
  await waitFor("!document.querySelector('[data-secret-decision=\"strip\"]') && Boolean(document.querySelector('[data-action=adopt]:not(:disabled)'))", 20_000);
  assert.equal(b.model.bodies.some(body => body.includes(browserSecret)), false, "raw secret never sent to model");

  // ONB-40 & ONB-42: reopen ("调整范围") and add CHANGELOG.md -> scope-delta card ("这次只做这些") + stale-summary card appear cleanly!
  await click("[data-action=restart]");
  await waitFor("document.querySelector('[data-ob-view=sources]')");
  await setInputFiles([extraPath]);
  await waitFor("document.querySelector('.ob-right')?.textContent.includes('CHANGELOG.md')");
  await click("[data-action=prepare]");
  await waitFor("Boolean(document.querySelector('[data-slot=\"scope-delta-card\"]')) && Boolean(document.querySelector('[data-slot=\"stale-summary\"]'))");
  await click("[data-action=model-back]");
  await waitFor("Boolean(document.querySelector('[data-ob-view=preview]')) && Boolean(document.querySelector('[data-slot=\"scope-delta-card\"]')) && Boolean(document.querySelector('[data-slot=\"stale-summary\"]'))");

  for (const width of [1440, 390, 320]) {
    await setView(width, "light");
    await assertLayoutClean(evaluate, `onboarding scope-delta ${width}/light`);
  }
  const { data: deltaShot } = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
  await writeFile(new URL("onboarding-scope-delta-320.png", output), Buffer.from(deltaShot, "base64"));

  // M4, C4 & C5: (1) a native directory at days=0 whose entries were all excluded by ignore/binary/secret rules says no-supported-files-filtered, NOT time-range empty;
  // (2) a cancelled native directory scan (`cancelled: true`, `total_entries: 250`) offers "继续清点" and invokes `context_directory_preview` with `resume_offset: 250`, merging files & skipped counts without duplicating!
  await command("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      globalThis.__previewCalls = [];
      globalThis.__TAURI__ = {
        core: {
          invoke: async (cmd, args = {}) => {
            if (cmd === 'context_directory_status') {
              return [
                { id: 'custom', state: 'ready', path: '/tmp/only-node-modules' },
                { id: 'downloads', state: 'ready', path: '/tmp/large-downloads' },
              ];
            }
            if (cmd === 'context_directory_preview') {
              globalThis.__previewCalls.push(args);
              if (args.id === 'downloads' && args.resume_offset === 250) {
                return {
                  files: [{ path: 'beta/b-1.md', size: 240, modified_ms: 2000, identity: '2' }],
                  skipped: 2,
                  total_entries: 500,
                  skipped_reasons: { ignored: 1, secret: 1, unreadable: 0, time: 0 },
                  ignored_rules: ['node_modules'],
                  truncated: false,
                  cancelled: false,
                };
              }
            }
            return {};
          },
        },
      };
    })()`,
  }, sessionId);
  const filteredId = await evaluate<string>(`(async () => {
    const jid = crypto.randomUUID();
    await molisWorkRequest('/api/onboarding/context', { body: { id: jid } });
    await molisWorkRequest('/api/onboarding/context/' + jid + '/selection', {
      body: {
        previewed: true,
        sources: [
          {
            kind: 'custom',
            selected: true,
            days: 0,
            path: '/tmp/only-node-modules',
            metadata: {
              files: [],
              skipped: 3,
              total_entries: 3,
              skipped_reasons: { ignored: 3, secret: 0, unreadable: 0 },
              truncated: false,
            },
          },
          {
            kind: 'downloads',
            selected: true,
            days: 30,
            path: '/tmp/large-downloads',
            metadata: {
              files: [{ path: 'alpha/a-1.md', size: 120, modified_ms: 1000, identity: '1' }],
              skipped: 1,
              total_entries: 250,
              skipped_reasons: { ignored: 1, secret: 0, unreadable: 0, time: 0 },
              ignored_rules: ['.DS_Store'],
              truncated: true,
              cancelled: true,
            },
          },
        ],
      },
    });
    return jid;
  })()`);
  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/onboarding?journey=${encodeURIComponent(filteredId)}` }, sessionId));
  await waitFor("document.querySelector('[data-ob-view=model]') && document.querySelector('[data-action=model-back]')");
  await click("[data-action=model-back]");
  await waitFor("document.querySelector('[data-ob-view=preview]') && document.querySelector('[data-group=custom]') && document.querySelector('[data-continue-dir=downloads]')");
  const customNote = await evaluate<string>("document.querySelector('[data-group=custom]')?.textContent || ''");
  assert.match(customNote, /没有可读取的文本材料/);
  assert.equal(customNote.includes("这个时间范围没有支持的文件"), false);

  await click("[data-continue-dir=downloads]");
  await waitFor("!document.querySelector('[data-continue-dir=downloads]') && document.querySelector('[data-group=downloads]')?.textContent.includes('beta/b-1.md')");
  const previewCalls = await evaluate<Array<{ id: string; days: number; resume_offset?: number }>>("globalThis.__previewCalls");
  assert.deepEqual(previewCalls, [{ id: "downloads", days: 30, resume_offset: 250 }]);
  const downloadsText = await evaluate<string>("document.querySelector('[data-group=downloads]')?.textContent || ''");
  assert.ok(downloadsText.includes("alpha/a-1.md") && downloadsText.includes("beta/b-1.md"), "merged files retain prior and resumed entries");
  assert.ok(downloadsText.includes("2/2"), `expected 2/2 merged files in downloads group, saw: ${downloadsText}`);
});
