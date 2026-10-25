import assert from "node:assert/strict";
import test from "node:test";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// context-toolbar §6 T06, QA-014: a real Pages page at 390 whose recommended actions have long Chinese or English titles, and
// another plugin's long name as their badge. Every title and badge stays inside its own button, no two buttons overlap, every
// target is at least 44px and the bar is inside the window; what does not fit goes to 更多's 推荐 in the plan's order, the
// Assistant stays reachable there, and a real click on the bar or in 更多 chooses the action it is on.
// The rules' own titles are short, so the plan the Host answers with is lengthened in the page; its keys are the Host's.

const FIRST = "联系阿杰确认秋季发布计划。附上本周方案和预算说明。";
const SECOND = "联系小王确认周末徒步路线。附上集合时间。";
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const BAR = ".mw-ctx:not(.mw-ctx--static):not([hidden]):not([data-away])";
const LONG = {
  zh: { titles: ["把这一段改写成给全体同事看的周报摘要", "从这段话里找出所有需要跟进的负责人和截止日期", "按时间顺序整理成一份可以直接发出去的会议纪要"],
    badge: "跨项目待办与提醒中心", suggested: "推荐", scheme: "light" },
  en: { titles: ["Rewrite this passage as a weekly summary for the whole team", "Find every owner and deadline this passage mentions",
    "Turn this passage into meeting notes that are ready to send"], badge: "Cross-project tasks and reminders", suggested: "Suggested", scheme: "dark" },
} as const;

type Measured = { bar: string[]; labels: string[]; badges: string[]; tight: boolean; folded: boolean; star: boolean; inside: boolean; fits: boolean;
  page: boolean; small: string[]; spill: string[]; overlaps: string[] };
const MEASURE = `(() => {
  const bar = document.querySelector(${JSON.stringify(BAR)}), box = bar.getBoundingClientRect(), rect = node => node.getBoundingClientRect();
  const within = (a, b) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;
  const name = node => (node.getAttribute('aria-label') || node.textContent).trim();
  const buttons = [...bar.querySelectorAll('button')].filter(node => node.getClientRects().length);
  const spill = [], overlaps = [];
  for (const button of buttons) for (const child of button.children) {
    // Inside its own button, and its text either fits its box or is cut at the box's edge with an ellipsis.
    const style = getComputedStyle(child), cut = child.scrollWidth > child.clientWidth + 0.5;
    if (!within(rect(child), rect(button)) || (cut && !(style.overflowX === 'hidden' && style.textOverflow === 'ellipsis'))) spill.push(name(button) + ' › ' + child.textContent);
  }
  buttons.forEach((a, i) => buttons.slice(i + 1).forEach(b => { const p = rect(a), q = rect(b);
    if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 0.5 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 0.5) overlaps.push(name(a) + ' × ' + name(b)); }));
  const actions = [...bar.querySelectorAll('[data-key]')];
  return { bar: actions.map(node => node.dataset.key), labels: actions.map(node => node.querySelector('span').textContent),
    badges: actions.map(node => node.querySelector('.mw-ctx__badge')?.textContent ?? ''), tight: bar.hasAttribute('data-tight'),
    folded: Boolean(bar.querySelector('[data-fold]')), star: Boolean(bar.querySelector('[data-assistant]')),
    inside: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight, fits: bar.scrollWidth <= bar.clientWidth,
    page: document.documentElement.scrollWidth <= innerWidth,
    small: buttons.filter(node => rect(node).width < 43.5 || rect(node).height < 43.5).map(node => name(node) + ' ' + Math.round(rect(node).width) + 'x' + Math.round(rect(node).height)),
    spill, overlaps };
})()`;

for (const locale of ["zh", "en"] as const) {
  test(`T06 QA-014 context toolbar on a real Pages page at 390 (${locale}, ${LONG[locale].scheme}): long titles and badges stay in their own buttons, nothing overlaps, every action is reachable and a click chooses it`, { timeout: 120_000 }, async t => {
    const long = LONG[locale];
    const browser = await openGoalBrowser(t, true, undefined, null);
    if (!browser) return;
    const { command, sessionId, navigate, evaluate, waitFor, click, origin, projectId, homeDirectory } = browser;
    const child = await pluginFrameBrowser(t, browser, "pages");
    await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: long.scheme }, { name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    const pages = openPagesStore(homeDirectory);
    const page = (() => { try { return pages.create({ project_id: projectId!, title: "发布笔记", body: { type: "doc", content: [paragraph(FIRST), paragraph(SECOND)] } }); } finally { pages.close(); } })();
    const next = `/projects/${projectId}/?openPlugin=pages&openItem=${page.id}`;
    await navigate(() => command("Page.navigate", { url: locale === "en" ? `${origin}/locale?lang=en&next=${encodeURIComponent(next)}` : `${origin}${next}` }, sessionId));
    await child.waitFor(`document.querySelector('[data-pages=workbench]')?.dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(SECOND)})`);
    assert.equal(await evaluate("document.documentElement.lang.startsWith(" + JSON.stringify(locale) + ")"), true);

    // The plan as the Host ranked it, with its first available actions (another plugin's first, so they carry a badge) made the
    // recommended ones and given long titles. A choice is recorded by the signal it sends; what the choice then does (a card, a
    // todo, the writing popup, the Assistant) is other tests', so it is held here and nothing comes over the bar.
    await evaluate(`(() => {
      const long = ${JSON.stringify(long)}, original = window.fetch;
      window.__accepted = []; window.__answered = { candidates: 0, judge: 0 }; window.__primary = null; window.__badged = 0;
      window.addEventListener('molis:assistant-context-action-chosen', event => { event.stopImmediatePropagation(); event.preventDefault(); }, true);
      window.fetch = async (url, options) => {
        const path = String(url).split('?')[0];
        if (path.endsWith('/api/contextual/signal')) { const body = JSON.parse(options.body); if (body.signal === 'accepted') window.__accepted.push(body.key); }
        if (path.endsWith('/api/contextual/prepare') || path.endsWith('/api/contextual/create')) return new Promise(() => {});
        const response = await original(url, options), ranked = path.match(/\\/api\\/contextual\\/(candidates|judge)$/);
        if (!ranked || !response.ok) return response;
        const out = await response.clone().json(), plan = out.plan, mine = JSON.parse(options.body).focus.plugin_id;
        const picked = plan.candidates.filter(item => item.available && item.origin !== 'attach')
          .sort((a, b) => Number(a.source.provider_id === mine) - Number(b.source.provider_id === mine)).slice(0, long.titles.length);
        picked.forEach((item, index) => { item.title = long.titles[index]; if (item.source.provider_id !== mine) item.provider_title = long.badge; });
        plan.primary = picked.map(item => item.key);
        plan.emphasis = plan.primary[0];
        plan.more = plan.more.map(group => ({ ...group, keys: group.keys.filter(key => !plan.primary.includes(key)) })).filter(group => group.keys.length);
        window.__primary = plan.primary; window.__badged = picked.filter(item => item.source.provider_id !== mine).length;
        window.__answered[ranked[1]] += 1;
        const headers = new Headers(response.headers); headers.delete('content-length');
        return new Response(JSON.stringify(out), { status: response.status, headers });
      }; })()`);
    const select = () => child.evaluate(`(() => {
      const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
      const range = document.createRange(); range.selectNodeContents(editor.querySelector('p').firstChild);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
    })()`);
    const lengthened = `document.querySelector(${JSON.stringify(`${BAR} [data-key]`)}) && ${JSON.stringify(long.titles)}.includes(document.querySelector(${JSON.stringify(`${BAR} [data-key] > span`)}).textContent)`;
    await select();
    // Ranked by the rules, then by the judgment (not connected in this Home, so the same plan again): measured once both are in.
    await waitFor(`window.__answered.candidates > 0 && window.__answered.judge > 0 && ${lengthened}`, 15_000);
    await new Promise(resolve => setTimeout(resolve, 400));
    const primary = await evaluate<string[]>("window.__primary");
    assert.ok(primary.length >= 2, `rules offer at least two actions for a passage: ${primary.join(" / ")}`);
    assert.ok(await evaluate<number>("window.__badged") >= 1, "at least one recommended action is another plugin's and says whose it is");
    const bar = await evaluate<Measured>(MEASURE);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.deepEqual(await evaluate<Measured>(MEASURE), bar, "the bar has settled");

    assert.deepEqual(bar.spill, [], "every title, badge and icon stays inside its own button");
    assert.deepEqual(bar.overlaps, [], "no two buttons overlap");
    assert.deepEqual(bar.small, [], "every target is at least 44px");
    assert.equal(bar.inside, true, "the bar is inside the window");
    assert.equal(bar.fits, true, "nothing on the bar runs past its edge");
    assert.equal(bar.page, true, "the page does not scroll sideways");
    assert.ok(bar.bar.length >= 1 && bar.bar.length <= 2, `one or two recommended actions on a phone: ${bar.bar.length}`);
    assert.deepEqual(bar.bar, primary.slice(0, bar.bar.length), "the bar shows the plan's first actions in order");
    assert.equal(bar.folded, true, "the format tools fold first");
    // Shortening a title is the last step (§6): only for the one action left, after ✦ has gone to 更多.
    if (bar.tight) { assert.equal(bar.bar.length, 1); assert.equal(bar.star, false); }
    if (bar.star) assert.equal(bar.tight, false);
    // A cut title is still the whole title, so it is what the button is called.
    bar.labels.forEach(label => assert.ok((long.titles as readonly string[]).includes(label), `the whole title: ${label}`));
    bar.badges.forEach(badge => assert.ok(badge === "" || badge === long.badge, `the whole badge: ${badge}`));

    // 更多: the actions the bar had no room for, under 推荐 in the plan's order; the Assistant is there too.
    await click(`${BAR} [data-more]`);
    await waitFor("document.querySelector('.mw-ctx-menu')");
    const menu = await evaluate<{ first: string; suggested: string[]; assistant: boolean; inside: boolean; fits: boolean; spill: string[] }>(`(() => {
      const menu = document.querySelector('.mw-ctx-menu'), box = menu.getBoundingClientRect(), nodes = [...menu.children];
      const from = nodes.findIndex(node => node.matches('p')), to = nodes.findIndex((node, index) => index > from && node.matches('p'));
      const spill = [...menu.querySelectorAll('button')].flatMap(button => [...button.children].filter(child => { const a = child.getBoundingClientRect(), b = button.getBoundingClientRect();
        return a.left < b.left - 0.5 || a.right > b.right + 0.5 || a.top < b.top - 0.5 || a.bottom > b.bottom + 0.5; }).map(child => child.textContent));
      const gap = nodes.findIndex(node => node.matches('[role=separator]'));
      return { first: nodes[from]?.textContent, suggested: nodes.slice(from + 1, to).map(node => node.dataset.key), assistant: gap > 0 && nodes[gap + 2]?.matches('button[role=menuitem]'),
        inside: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight, fits: menu.scrollWidth <= menu.clientWidth, spill };
    })()`);
    assert.ok(primary.length > bar.bar.length, "titles this long do not all fit on a phone");
    assert.equal(menu.first, long.suggested);
    assert.deepEqual([...bar.bar, ...menu.suggested], primary, "every recommended action is on the bar or under 推荐, in the plan's order");
    assert.equal(menu.assistant, true, "the Assistant is reachable from 更多");
    assert.equal(menu.inside, true, "the menu is inside the window");
    assert.equal(menu.fits, true, "the menu does not run sideways");
    assert.deepEqual(menu.spill, [], "every entry's words stay inside the entry");

    // A real click on an action under 推荐 chooses that action; then one on the bar chooses the one it is on.
    const fromMenu = menu.suggested[0]!;
    await click(`.mw-ctx-menu [data-key=${JSON.stringify(fromMenu)}]`);
    await waitFor("window.__accepted.length === 1", 10_000);
    assert.deepEqual(await evaluate("window.__accepted"), [fromMenu]);
    // The menu took the focus from the editor and has closed: selecting the passage again brings the bar back if it left with the focus.
    await waitFor("!document.querySelector('.mw-ctx-menu')");
    await select();
    await waitFor(lengthened, 15_000);
    const onBar = await evaluate<string>(`document.querySelector(${JSON.stringify(`${BAR} [data-key]`)}).dataset.key`);
    assert.ok((await evaluate<string[]>("window.__primary")).includes(onBar), `a recommended action: ${onBar}`);
    await click(`${BAR} [data-key=${JSON.stringify(onBar)}]`);
    await waitFor("window.__accepted.length === 2", 10_000);
    assert.deepEqual(await evaluate("window.__accepted"), [fromMenu, onBar]);
  });
}
