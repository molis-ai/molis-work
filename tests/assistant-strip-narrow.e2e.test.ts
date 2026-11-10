import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { assistantCardHtml, agentQuestionHtml, ensureSystemAgentService, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { asideReply } from "./fixtures/ending-review.js";

/** One streamed model turn: a tool call, or plain text. */
function turn(tool?: { name: string; input: unknown }, text = "好的。"): string {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture-model", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: tool ? { type: "tool_use", id: `call-${Math.random().toString(36).slice(2)}`, name: tool.name, input: {} } : { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: tool ? { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } : { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return events.join("");
}

const rawCommandArg = "'原始命令 <raw> & text'\r\n", rawPath = "src/原文件 <raw>.ts", rawGrant = "/原目录 <raw>";
const diffBefore = "同一行\r\n旧行 <raw>\r\n结束", diffAfter = "同一行\r\nnew 行 &\r\n结束";
const neighborTitle = "原始操作建议 <ready>", neighbor = '[data-ix-step-id^="card:"][data-ix-step-id$=":run"]';

async function buttonAxName(browser: NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>, selector: string) {
  const { command, sessionId } = browser;
  const { root } = await command<{ root: { nodeId: number } }>("DOM.getDocument", {}, sessionId);
  const { nodeId } = await command<{ nodeId: number }>("DOM.querySelector", { nodeId: root.nodeId, selector }, sessionId);
  assert.ok(nodeId, selector);
  const { nodes } = await command<{ nodes: Array<{ role?: { value: string }; name?: { value: string } }> }>("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false }, sessionId);
  return nodes.find(node => node.role?.value === "button")?.name?.value;
}

function attachReviewDocuments(browser: NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>) {
  assert.ok(browser.localHost);
  const queue = ensureSystemAgentService(browser.localHost, browser.homeDirectory).agentHost.reviews;
  // Exercise the real read-only Host projection with two frozen documents alongside the real gateway effect. Neither is dispatched.
  const stop = queue.observe(request => {
    if (request.document.kind !== "tool-operation" || request.document.tool !== "change-capability") return;
    stop();
    queue.request({ ...request, review_id: "language-command", kind: "command", document: { kind: "command", command: "printf", args: [rawCommandArg], cwd: "./当前目录",
      timeout_ms: 1000, escalate: true, background: true, grants: { paths: [{ access: "write", path: rawGrant }], network: true } } });
    queue.request({ ...request, review_id: "language-diff", kind: "text-edit", document: { kind: "text-edit", target_path: rawPath, exists: true,
      before_text: diffBefore, after_text: diffAfter } });
  });
  return { stop, queue };
}

// PMR-12 (post-merge-review; fixed in c48a8608 and guarded only by hand until now): at about 800px the Assistant keeps its
// side pane in a closed drawer, so the conversation's top line must carry what the pane would: 去确认 for a change that
// waits on the person, landing on the card's own decision, and 继续 and 停止 once the work is paused.
test("with the side pane out of sight, the top line offers 去确认, then 继续 and 停止 for paused work", { timeout: 120_000 }, async t => {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  // The first work leaves a ready operation card and then proposes a change needing approval. The second work is held until the
  // test has asked to pause, and then asks for a harmless tool so the round ends at a boundary.
  let turns = 0, release: (() => void) | undefined;
  const held = new Promise<void>(resolve => { release = resolve; });
  const model = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    // A round that changed nothing has its ending reviewed (D1②): answered "nothing found" without spending a scripted turn.
    const review = asideReply(raw);
    if (review) { res.writeHead(200, { "content-type": "text/event-stream" }); res.end(turn(undefined, review)); return; }
    const index = turns++;
    if (index === 2) await held;
    res.writeHead(200, { "content-type": "text/event-stream" });
    const todo = { capability_id: "todo.items.create", version: 1, provider_id: "io.molis.work.todo" };
    if (index === 0) res.end(turn({ name: "suggest-action", input: { ...todo, title: neighborTitle, summary: "待执行的操作建议", input: { title: "另一条待办" } } }));
    else if (index === 1) res.end(turn({ name: "change-capability", input: { ...todo, input: { title: "整理周报" } } }));
    else res.end(index === 2 ? turn({ name: "context-remaining", input: {} }) : turn());
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { release?.(); model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const prepareHome = async (homeDirectory: string) => {
    await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
      const connection = withConnectorConnections(homeDirectory, store => { const created = store.createToken({ serviceId: "model-api", displayName: "local-only", token: "fixture-local-model-key" }); store.assertTarget(created.connection_id, "model-api", `http://127.0.0.1:${address.port}`); return created; });
      catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "local-only", display_name: "本机 HTTP 模型", base_url: `http://127.0.0.1:${address.port}`, api_format: "anthropic-messages", models: [{ model_id: "fixture-model", enabled: true }] });
    }));
  };
  const browser = await openGoalBrowser(t, true, undefined, null, undefined, undefined, { prepareHome }); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const { stop, queue } = attachReviewDocuments(browser); t.after(stop);

  await command("Emulation.setDeviceMetricsOverride", { width: 800, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=zh&next=${encodeURIComponent(`/projects/${projectId}/`)}` }, sessionId));
  const say = async (text: string) => {
    await click("[data-assistant-composer] .mw-composer__input");
    await command("Input.insertText", { text }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 }, sessionId);
  };
  const shown = (selector: string) => `(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node || node.hidden || !node.getClientRects().length) return false;
    const box = node.getBoundingClientRect(); return box.width > 0 && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight; })()`;
  const strip = "[data-assistant-strip]";

  await say("记一下：整理周报");
  // FLOW-01: the strip says the state; what to press is the next step just above the input, the same as the card's own control.
  const review = `[data-assistant-next-row] [data-ix-step-id^="review:"]`;
  await waitFor(`${shown(strip)} && ${shown(review)} && document.querySelector('${review} [data-ix-step-label]').textContent === '去确认'`, 30_000);
  assert.equal(await evaluate("document.querySelector('[data-assistant-panel]').dataset.side"), "closed", "at this width the side pane is a closed drawer");
  await waitFor("document.querySelector('.assistant-tab[data-current] .assistant-tab-mark .mw-state-ring')?.dataset.mwState === 'approval'"); // RING-07
  // The opened panel ends at least 8px above the row of next steps, and the row ends above the input, here and at a phone's width
  // (touch steps are 44px tall), so neither covers the panel's last line.
  const clear = `(() => { const box = selector => document.querySelector(selector).getBoundingClientRect(), panel = box('[data-assistant-panel]'), row = box('[data-assistant-next-row]'), input = box('[data-assistant-composer]');
    // At a phone's width the band from the panel's edge to the input is the bar's own ground: the page does not show in the gap or between the steps.
    const band = [[4, panel.bottom + 4], [innerWidth - 4, row.bottom - 2]].every(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-assistant-next-row]'));
    return { gap: Math.round(row.top - panel.bottom), under: Math.round(input.top - row.bottom), band }; })()`;
  for (const width of [800, 390]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    await waitFor(`!document.querySelector('[data-assistant-panel]').hidden && ${shown(review)}`, 10_000);
    const { gap, under, band } = await evaluate<{ gap: number; under: number; band: boolean }>(clear);
    if (width === 390) assert.ok(band && gap >= 0 && under >= 0, `at 390px the next steps sit on a solid band from the panel (${gap}px) down to the input (${under}px)`);
    else assert.ok(gap >= 8 && under >= 0, `at ${width}px the panel ends ${gap}px above the next steps, which end ${under}px above the input`);
  }
  await command("Emulation.setDeviceMetricsOverride", { width: 800, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await click(review);
  // It lands on the card's own decision, not on a copy button inside the code it shows.
  await waitFor("Boolean(document.activeElement?.closest('[data-review]')) && !document.activeElement.classList.contains('assistant-code-copy')", 10_000);

  await waitFor("document.querySelector('[data-review] .assistant-card-kicker .mw-state-ring')?.dataset.mwState === 'approval'"); // RING-07
  // RING-08: the compact tab and card styles keep a ring as tall as its words (1em + 2px), not squeezed below them.
  const asTallAsItsWords = (selector: string) => `(() => { const ring = document.querySelector(${JSON.stringify(selector)}), box = ring.getBoundingClientRect();
    return Math.abs(box.height - parseFloat(getComputedStyle(ring).fontSize) - 2) <= 1 && box.width === box.height && box.height >= 13; })()`;
  for (const selector of [".assistant-tab[data-current] .mw-state-ring", "[data-review] .assistant-card-kicker .mw-state-ring"]) {
    assert.ok(await evaluate(asTallAsItsWords(selector)), selector);
  }
  // FSS-36: the running Prologue's real Todo review remains pending through both language changes.
  await waitFor("Boolean(document.querySelector('[data-review=language-command]')?.querySelector('code')) && Boolean(document.querySelector('[data-review=language-diff]')?.querySelector('code'))");
  await click('[data-assistant-next-row] [data-ix-steps-more]');
  await waitFor(`document.querySelector(${JSON.stringify(neighbor)})?.querySelector('[data-ix-step-label]')?.textContent === ${JSON.stringify(neighborTitle)}`);
  assert.equal(await evaluate("[...document.querySelectorAll('[data-card] dt, [data-card] label')].some(node => node.textContent === '要做什么')"), true);
  await evaluate(`(() => {
    window.reviewCard = document.querySelector('[data-review]'); window.reviewExact = reviewCard.querySelector('.assistant-exact'); reviewExact.open = true;
    window.reviewStep = document.querySelector(${JSON.stringify(review)}); window.reviewApprove = reviewCard.querySelector('[data-assistant-decision=approve]');
    window.reviewCommand = document.querySelector('[data-review=language-command]'); window.reviewDiff = document.querySelector('[data-review=language-diff]');
    window.commandCode = reviewCommand.querySelector('code'); window.diffCode = reviewDiff.querySelector('code');
    window.commandStep = document.querySelector('[data-ix-step-id="review:language-command"]'); window.diffStep = document.querySelector('[data-ix-step-id="review:language-diff"]');
    window.neighborStep = document.querySelector(${JSON.stringify(neighbor)});
    window.reviewDraft = document.querySelector('[data-assistant-composer] .mw-composer__input'); reviewDraft.value = 'Unsent 审查草稿'; reviewDraft.focus(); reviewDraft.setSelectionRange(2, 7, 'backward');
    window.reviewWrites = []; window.reviewReads = []; const fetchOriginal = window.fetch;
    window.fetch = (input, init) => {
      const path = new URL(String(input?.url || input), location.href).pathname, method = init?.method || 'GET';
      if (path.includes('/api/assistant/') && method !== 'GET') reviewWrites.push(path);
      const response = fetchOriginal(input, init), work = path.split('/api/assistant/works/')[1];
      if (method !== 'GET' || !work || work.includes('/')) return response;
      return response.then(async value => {
        const view = await value.clone().json(), card = view.cards?.find(card => card.title === ${JSON.stringify(neighborTitle)});
        if (!card) return value;
        reviewReads.push({ html: view.next_all_html, title: card.title, status: card.status });
        if (window.holdOldReview) {
          window.holdOldReview = false;
          const readBody = value.text.bind(value);
          value.text = async () => { const body = await readBody(); window.oldReviewDelivered = true; return body; };
          return new Promise(resolve => { window.releaseOldReview = () => resolve(value); });
        }
        return value;
      });
    };
  })()`);
  const originalReview = await evaluate<{ summary: string; arguments: string[] }>(`({ summary: reviewCard.querySelector('.assistant-card-title').textContent,
    arguments: [...reviewExact.querySelectorAll('pre')].map(node => node.textContent) })`);
  assert.equal(JSON.parse(originalReview.arguments[0]!).title, "整理周报");
  const words = { en: ["Review it", "Waiting on you:", "Effect", "Run a command in the background", "Edit a file", "@@ Starting at line 2", "Read and write", "Requires elevated permissions"],
    zh: ["去确认", "等你：", "效果", "在后台运行命令", "修改文件", "@@ 第 2 行起", "读写", "需要更高权限"] };
  const neighborWords = `[document.querySelector(${JSON.stringify(neighbor)})===neighborStep, neighborStep.title,
    neighborStep.querySelector('[data-ix-step-label]').textContent, neighborStep.querySelector('.mw-sr-only').textContent]`;
  await evaluate("window.holdOldReview = true; window.dispatchEvent(new Event('focus'));");
  await waitFor("typeof releaseOldReview === 'function'");
  assert.match(await evaluate<string>("reviewReads.at(-1).html"), /title="来自操作卡"/, "the held response actually carries the earlier language");
  let releasedOldReview = false;
  for (const tag of ["en", "zh", "en", "zh"] as const) {
    const [label, waiting, effect, commandTitle, fileTitle, diffHeading, access, elevation] = words[tag];
    const source = tag === "en" ? "From an action card" : "来自操作卡";
    await evaluate(`(() => { const link = document.createElement('a'); link.dataset.uiLanguage = '${tag}';
      link.href = '/locale?lang=${tag}'; document.body.append(link); link.click(); link.remove(); })()`);
    await waitFor(`document.documentElement.dataset.uiLanguageTag === '${tag}'`);
    assert.deepEqual(await evaluate(neighborWords), [true, source, neighborTitle, waiting], "the fixed words change at commit before any new work read");
    assert.deepEqual(await evaluate(`[document.querySelector('[data-review]')===reviewCard, reviewExact===reviewCard.querySelector('.assistant-exact'), reviewExact.open,
      document.querySelector(${JSON.stringify(review)})===reviewStep, reviewStep.title, reviewStep.querySelector('[data-ix-step-label]').textContent,
      reviewStep.querySelector('.mw-sr-only').textContent, reviewCard.querySelector('dt').textContent,
      [...reviewCard.querySelectorAll('dt')].some(node=>node.textContent==='要做什么'), [...reviewCard.querySelectorAll('dd')].some(node=>node.textContent==='整理周报'),
      [...reviewExact.querySelectorAll('pre')].map(node=>node.textContent), reviewCard.querySelector('[data-assistant-decision=approve]')===reviewApprove,
      document.activeElement===reviewDraft, reviewDraft.value, reviewDraft.selectionStart, reviewDraft.selectionEnd, reviewDraft.selectionDirection, reviewWrites]`),
      [true, true, true, true, originalReview.summary, label, waiting, effect, true, true, originalReview.arguments, true, true, "Unsent 审查草稿", 2, 7, "backward", []]);
    assert.deepEqual(await evaluate(`[commandCode === reviewCommand.querySelector('code'), diffCode === reviewDiff.querySelector('code'),
      document.querySelector('[data-ix-step-id="review:language-command"]') === commandStep, document.querySelector('[data-ix-step-id="review:language-diff"]') === diffStep,
      reviewCommand.querySelector('.assistant-card-title').textContent, commandStep.title, reviewDiff.querySelector('.assistant-card-title').textContent, diffStep.title,
      reviewDiff.querySelector('.assistant-field-code .assistant-muted').textContent, commandCode.closest('figure').dataset.code, diffCode.closest('figure').dataset.code,
      [...reviewCommand.querySelectorAll('dd')].map(node=>node.textContent), commandCode.textContent, diffCode.textContent]`),
    [true, true, true, true, commandTitle, commandTitle, `${fileTitle} ${rawPath}`, `${fileTitle} ${rawPath}`, diffHeading,
      `printf ${rawCommandArg}`, "- 旧行 <raw>\r\n+ new 行 &\r", ["./当前目录", elevation, `${access} ${rawGrant}${tag === "en" ? ", Network access" : "、联网"}`],
      `printf ${rawCommandArg}`, "- 旧行 <raw>\r\n+ new 行 &\r"]);
    if (tag === "en") assert.equal(await evaluate("reviewApprove.textContent"), "Allow once");
    if (!releasedOldReview) {
      await evaluate("reviewStep.focus(); releaseOldReview();");
      await waitFor("window.oldReviewDelivered === true");
      await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      assert.deepEqual(await evaluate(neighborWords), [true, source, neighborTitle, waiting], "consuming the old HTML keeps the currently selected language");
      assert.deepEqual(await evaluate(`[document.activeElement===reviewStep, document.querySelector(${JSON.stringify(review)})===reviewStep, reviewWrites]`), [true, true, []]);
      releasedOldReview = true;
    }
    const reads = await evaluate<number>("reviewReads.length");
    await evaluate("reviewStep.focus(); window.dispatchEvent(new Event('focus'));");
    await waitFor(`reviewReads.length > ${reads} && reviewReads.at(-1).html.includes(${JSON.stringify(source)}) && document.querySelector(${JSON.stringify(neighbor)})?.title === ${JSON.stringify(source)}`);
    assert.deepEqual(await evaluate(`[document.activeElement === reviewStep, document.querySelector(${JSON.stringify(review)}) === reviewStep,
      document.querySelector(${JSON.stringify(neighbor)}) === neighborStep, neighborStep.querySelector('[data-ix-step-label]').textContent,
      neighborStep.querySelector('.mw-sr-only').textContent, reviewReads.at(-1).title, reviewReads.at(-1).status, reviewWrites]`),
    [true, true, true, neighborTitle, waiting, neighborTitle, "ready", []]);
    assert.equal(await buttonAxName(browser, '[data-ix-step-id="review:language-command"]'), `${waiting} ${label} · ${commandTitle}`);
    assert.equal(await buttonAxName(browser, '[data-ix-step-id="review:language-diff"]'), `${waiting} ${label} · ${fileTitle} ${rawPath}`);
    await evaluate("reviewDraft.focus()");
  }
  for (const id of ["language-command", "language-diff"]) assert.equal(queue.receipt(id)?.status, "pending");
  assert.equal(turns, 2, "switching while the effect is pending does not ask the model again");
  const cardId = await evaluate<string>("neighborStep.dataset.ixStepId.slice('card:'.length, -':run'.length)");
  await evaluate(`document.querySelector(${JSON.stringify(`[data-card=${JSON.stringify(cardId)}] [data-ix-action=dismiss]`)}).click()`);
  await waitFor(`!document.querySelector(${JSON.stringify(neighbor)}) && !reviewStep.isConnected && Boolean(document.querySelector(${JSON.stringify(review)}))`);
  const writes = await evaluate<string[]>("reviewWrites");
  assert.equal(writes.length, 1);
  assert.ok(writes[0]?.endsWith(`/cards/${cardId}/dismiss`));
  await evaluate("reviewDraft.value = ''");
  await click("[data-assistant-new]");
  await say("写一份周报草稿");
  await waitFor(`${shown(`${strip} [data-assistant-control=pause]`)}`, 30_000);
  await click(`${strip} [data-assistant-control=pause]`);
  release?.();
  await waitFor(`${shown(`${strip} [data-assistant-control=resume]`)} && ${shown(`${strip} [data-assistant-control=stop]`)}`, 30_000);
  assert.equal(await evaluate(`document.querySelector('${strip} [data-assistant-control=pause]').hidden`), true);
  await waitFor("document.querySelector('.assistant-round-status[data-phase=paused] .mw-state-ring')?.dataset.mwState === 'paused'"); // RING-07
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);

  // RING-07 RING-08: actual Host markup under the live Assistant's styles; model-driven question submission is covered separately.
  const html = agentQuestionHtml({ pending_id: "ring-question", kind: "clarify", prompt: "继续整理？", options: [], allows_free_text: true }, text => text)
    + assistantCardHtml({ card_id: "ring-action", revision: 1, run_id: "ring-run", title: "新建待办", summary: "保存结果", provider: "待办", capability_title: "新建待办", capability_id: "todo.items.create",
      effect: "irreversible", fields: [], missing: [], status: "unknown", created_at: "", updated_at: "" }, text => text);
  await evaluate(`(() => { const sample = document.createElement('section'); sample.id = 'ring-host-sample'; sample.innerHTML = ${JSON.stringify(html)};
    document.querySelector('[data-assistant-thread]').append(sample); })()`);
  for (const width of [800, 390]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    for (const state of ["answer", "verify"]) {
      const selector = `#ring-host-sample .mw-ix-kicker .mw-state-ring[data-mw-state="${state}"]`;
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' })`);
      assert.ok(await evaluate(`(() => { const ring = document.querySelector(${JSON.stringify(selector)}), box = ring.getBoundingClientRect();
        return Math.abs(box.height - parseFloat(getComputedStyle(ring).fontSize) - 2) <= 1 && box.height >= 13 && box.left >= 0 && box.right <= innerWidth && getComputedStyle(ring).display !== 'none'; })()`), `${state} at ${width}px`);
    }
  }
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  await evaluate("document.getElementById('ring-host-sample').remove()");
});

// FLOW-03 (A7): a page's suggestion is one step above the input and the only one while the panel is closed. It keeps its one button
// while it stands: the island repaints the row when the window crosses the Assistant's layout widths (1240px, 560px), and a new button
// each time played its entrance again from transparent, so the suggestion could be caught invisible (§21.6).
test("a page's suggestion stays one visible button above the input across the Assistant's width changes", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1300, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-assistant-next-row]'))");
  await evaluate(`window.dispatchEvent(new CustomEvent("molis:assistant-message", { detail: { message_id: "strip-offer", purpose: "suggest", source: { surface: "browser", title: "侧栏浏览器" }, text: "把这一页整理成要点" } }))`);
  const offer = "[data-assistant-next-row] [data-step-offer]";
  await waitFor(`Boolean(document.querySelector('${offer}'))`);
  await evaluate(`document.querySelector('${offer}').dataset.testFirst = ""`);
  for (const width of [1200, 1300, 600, 520, 390, 1300]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.deepEqual(await evaluate(`(() => { const node = document.querySelector('${offer}'); if (!node) return null; const box = node.getBoundingClientRect();
      return { same: node.hasAttribute("data-test-first"), opacity: getComputedStyle(node).opacity, inside: box.width > 0 && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight }; })()`),
      { same: true, opacity: "1", inside: true }, `the suggestion at ${width}px`);
  }
});
