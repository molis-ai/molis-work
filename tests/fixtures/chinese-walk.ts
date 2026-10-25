import { LocalProjectDatabase, seedDemoGoals } from "@molis-ai/molis-work-app-local-host";
import { layoutFindings } from "./layout-audit.js";
import { TEXT_WRAP_AUDIT, type TextWrapIssue } from "./text-wrap-audit.js";
import { TRUNCATION_AUDIT, type TruncationIssue } from "./truncation-audit.js";
import { GoalProjectApplication } from "./goal-application.js";

/**
 * The Chinese walk (specs/visual-ui-experience VUX-40 in Chinese, with VUX-04 and VUX-05): what a person writes in Chinese
 * is long from the start — a project name, Goal titles, to-dos, pages, issues, decks, forms and workflows, with Latin words,
 * numbers and full-width punctuation mixed in — and each screen is read by the layout, wrap and truncation audits and by
 * `CHINESE_AUDIT`. Used by tests/chinese-walkthrough (the project page, every plugin and the detail views) and
 * tests/chinese-layers (dialogs, menus and popovers, Settings and the Goal canvas and kanban).
 */

export const WIDTHS = [{ width: 1440, height: 900, touch: false }, { width: 820, height: 900, touch: false }, { width: 390, height: 844, touch: true }];

export const PROJECT = "二〇二六年第四季度跨部门客户体验改进与插件平台迁移联合项目组";
export const LONG = "把第一次打开项目的人从空白页一路带到第一份可以交给同事核对的周报，中间不需要读任何说明文档，也不需要知道插件是什么";
export const MIXED = "接入 molis-work-plugin-runtime-supervisor 与 GitHub Actions CI 第 12 轮回归（2026-10-21）后剩下的 3 项遗留问题";
export const MARKS = "「为什么要分开写？」——因为《项目资料》里的「决定」、「依据」与「下一步」各有主人，不能混在一起。";
export const TITLES = [LONG, MIXED, MARKS];

/** The demo board, with three Goals whose titles are long Chinese, one under another. */
export async function seedLongChinese(databasePath: string, projectId?: string): Promise<void> {
  await seedDemoGoals(databasePath, projectId);
  const store = new LocalProjectDatabase(databasePath);
  try {
    const goals = new GoalProjectApplication(store);
    TITLES.forEach((title, index) => goals.goalEvents.createIntent({
      project_id: projectId!, goal_id: `CN-${index}`, title, outcome: `${LONG}。${MARKS}`, why: MIXED, business_logic: `${MARKS}${LONG}`,
      priority: 99 - index, parent_goal_id: index ? `CN-${index - 1}` : undefined, dependency_goal_ids: [],
      requirements: [{ requirement_id: `CN-${index}-C1`, statement: TITLES[(index + 1) % TITLES.length]! }],
      actor_id: "demo-user", actor_kind: "user", source_kind: "onboarding", idempotency_key: `cn-goal-${index}`,
    }));
  } finally { store.close(); }
}

type Evaluate = <T = unknown>(expression: string) => Promise<T>;

/**
 * Writes what a person writes, through the same routes the pages use, on a page of the project that is open: the project's
 * long name, then three long to-dos, pages, issues, decks, forms and workflows. Returns, per plugin, the id of the first one
 * made (its name heads a detail view); the Goal opened is the seeded CN-1.
 */
export async function writeLongChinese(evaluate: Evaluate, projectId: string): Promise<Record<string, string | undefined>> {
  const api = (path: string, body: unknown) => evaluate<Record<string, unknown>>(`(async () => { const response = await fetch(${JSON.stringify(path)}, { method: 'POST',
    headers: globalThis.molisWorkControlHeaders(), body: JSON.stringify(${JSON.stringify(body)}) });
    const text = await response.text(); if (!response.ok) throw new Error(${JSON.stringify(path)} + ' ' + response.status + ' ' + text); return text ? JSON.parse(text) : {}; })()`);
  // The id of what was made, wherever the reply puts it ({ document: { id } }, { workflow: { workflow_id } }, { id }).
  const idOf = (reply: unknown): string | undefined => {
    if (!reply || typeof reply !== "object") return undefined;
    const record = reply as Record<string, unknown>;
    for (const key of ["id", "workflow_id"]) if (typeof record[key] === "string") return record[key] as string;
    for (const value of Object.values(record)) { const found = idOf(value); if (found) return found; }
    return undefined;
  };
  const plugin = (id: string, path: string) => `/projects/${projectId}/api/plugins/io.molis.work.${id}${path}`;
  await api(`/api/settings/projects/${projectId}/rename`, { display_name: PROJECT });
  const opened: Record<string, string | undefined> = { goals: "CN-1" };
  for (const title of TITLES) {
    // Pages, decks and forms take titles up to 80 characters: the longest a person can write there.
    const short = title.slice(0, 80);
    const made = {
      todo: await api(plugin("todo", "/items"), { title, notes: `${LONG}。${MARKS}` }),
      pages: await api(plugin("pages", "/pages"), { title: short, markdown: `# ${title}\n\n${LONG}。${MIXED}。${MARKS}\n\n- ${MARKS}\n- ${MIXED}` }),
      issues: await api(plugin("issues", "/create"), { title, description: `${LONG}。${MARKS}`, type: "feature" }),
      ppt: await api(plugin("ppt", "/ppt"), { title: short }),
      form: await api(plugin("form", "/forms"), { title: short }),
      workflows: await api(plugin("native.workflows", "/workflows"), { title }),
    };
    for (const [id, reply] of Object.entries(made)) opened[id] ??= idOf(reply);
  }
  return opened;
}

/**
 * What Chinese text does wrong on a screen as drawn, beyond the layout and wrap audits:
 * - `tight`: a Chinese text on two or more lines whose lines sit closer than 1.3 times its type.
 * - `squeezed`: a Chinese text squeezed into a column of one or two characters a line (three lines or more).
 * - `kinsoku`: a line that starts with a closing mark (、。，）」…) or ends with an opening one (（「《…).
 * - `wrapped-control`: a control whose own label is short (twelve characters or fewer) but takes two lines, so it grew.
 * - `starved`: a name cut by an ellipsis in a row whose words and pictures fill less than 60% of it (VUX-05: the name comes
 *   first, so the other columns give way before it does).
 * - `side-scroll`: a column that scrolls up and down also slides sideways, because something in it is wider than it.
 * - `lang`: the page does not say it is Chinese, so the browser cannot choose Chinese glyphs and line-breaking rules.
 * Inside the element marked `data-audit-scope` only, when there is one (an open dialog or menu); the page's language is the page's.
 */
export const CHINESE_AUDIT = String.raw`(() => {
  const out = [], han = /[㐀-鿿]/, CLOSE = /^[、。，．：；！？）」』》〉】〕]/, OPEN = /[（「『《〈【〔]$/;
  const scope = document.querySelector('[data-audit-scope]') || document.body;
  if (!/^zh/.test(document.documentElement.lang)) out.push({ kind: 'lang', at: 'html', text: document.documentElement.lang });
  const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !el.closest('[inert], [hidden], [aria-hidden=true]');
  const name = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const skip = 'pre, code, kbd, samp, textarea, input, select, svg, script, style, template, [contenteditable=true], .mw-sr-only, .sr-only';
  const range = document.createRange();
  // The lines of one element's own text (its text nodes and inline children), by the characters' boxes.
  const lines = (el) => { const rows = []; const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) { if (!node.data.trim() || node.parentElement.closest(skip)) continue;
      for (let i = 0; i < node.length; i++) { if (/\s/.test(node.data[i])) continue; range.setStart(node, i); range.setEnd(node, i + 1); const rect = range.getClientRects()[0]; if (!rect || !rect.width) continue;
        let row = rows.find((r) => Math.abs(r.top - rect.top) < rect.height / 2); if (!row) { row = { top: rect.top, text: '' }; rows.push(row); } row.text += node.data[i]; } }
    return rows.sort((a, b) => a.top - b.top); };
  // Blocks that hold text directly: their own lines are what a reader reads as one paragraph, label or title.
  const blocks = new Set();
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!han.test(node.data)) continue;
    let el = node.parentElement; if (!el || el.closest(skip) || !shown(el)) continue;
    while (el.parentElement && getComputedStyle(el).display.startsWith('inline') && el.parentElement !== document.body) el = el.parentElement;
    blocks.add(el);
  }
  for (const el of blocks) {
    if (el.getBoundingClientRect().width < 1) continue;
    const rows = lines(el); if (rows.length < 2) continue;
    // Type drawn smaller or larger by a transform (a zoomed canvas) is measured as drawn.
    const scale = el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1;
    const size = (parseFloat(getComputedStyle(el).fontSize) || 14) * scale, text = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 50);
    const gaps = rows.slice(1).map((row, i) => row.top - rows[i].top).filter((gap) => gap > 0);
    const pitch = gaps.length ? Math.min(...gaps) : 0;
    if (pitch && pitch < size * 1.3 - 0.5) out.push({ kind: 'tight', at: name(el), text, pitch: Math.round(pitch * 10) / 10, size: Math.round(size * 10) / 10 });
    if (rows.length >= 3 && rows.every((row) => row.text.length <= 2)) out.push({ kind: 'squeezed', at: name(el), text, lines: rows.length });
    for (let i = 0; i < rows.length; i++) {
      if (i > 0 && CLOSE.test(rows[i].text)) out.push({ kind: 'kinsoku', at: name(el), text, line: rows[i].text.slice(0, 12) });
      if (i < rows.length - 1 && OPEN.test(rows[i].text)) out.push({ kind: 'kinsoku', at: name(el), text, line: '…' + rows[i].text.slice(-12) });
    }
  }
  // A control's label is one line: a word of it that wraps makes the control taller than its row (a label of two parts
  // laid out as two lines, a day and its date, is two texts, each on one line).
  for (const el of scope.querySelectorAll('button, [role=button], [role=tab], [role=menuitem], [role=option], a.mw-button, summary')) {
    if (!shown(el) || el.closest(skip)) continue;
    const label = (el.innerText || '').replace(/\s+/g, '');
    if (!label || label.length > 12 || !han.test(label)) continue;
    const texts = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = texts.nextNode(); node; node = texts.nextNode()) {
      if (!node.data.trim() || !shown(node.parentElement) || node.parentElement.closest(skip)) continue;
      range.selectNodeContents(node);
      const tops = [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => rect.top);
      const rows = tops.filter((top, i) => tops.findIndex((other) => Math.abs(other - top) < 4) === i).length;
      if (rows > 1) { out.push({ kind: 'wrapped-control', at: name(el), text: label, words: node.data.trim(), lines: rows, height: Math.round(el.getBoundingClientRect().height) }); break; }
    }
  }
  // A name cut short in a row that has room to spare: the row's other columns, not the name, took the width.
  for (const el of scope.querySelectorAll('*')) {
    const style = getComputedStyle(el);
    if (style.textOverflow !== 'ellipsis' || el.scrollWidth <= el.clientWidth + 1 || !shown(el) || el.closest(skip)) continue;
    const row = el.closest('button, a[href], li, [role=row], [role=option], .directory-list-row'); if (!row || row === el) continue;
    const box = row.getBoundingClientRect(); if (box.width < 200) continue;
    let used = 0; const words = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let node = words.nextNode(); node; node = words.nextNode()) { if (!node.data.trim() || !shown(node.parentElement)) continue;
      // What is drawn of it: an ellipsis cuts the words at the box that hides the rest.
      let left = box.left, right = box.right;
      for (let up = node.parentElement; up && up !== row; up = up.parentElement) if (getComputedStyle(up).overflowX !== 'visible') { const cut = up.getBoundingClientRect(); left = Math.max(left, cut.left); right = Math.min(right, cut.right); }
      range.selectNodeContents(node); for (const rect of range.getClientRects()) if (rect.height > 0) used += Math.max(0, Math.min(rect.right, right) - Math.max(rect.left, left)); }
    for (const part of row.querySelectorAll('svg, img, input, [role=progressbar], progress')) if (shown(part)) used += part.getBoundingClientRect().width;
    if (used < box.width * 0.6) out.push({ kind: 'starved', at: name(el), text: el.textContent.trim().slice(0, 30), row: name(row), used: Math.round(used), width: Math.round(box.width) });
  }
  // A column that scrolls up and down is not meant to slide sideways: something in it is wider than the column (a name that
  // neither wraps nor gives way), and the reader sees it cut at the edge. Code, tables, boards and canvases scroll on purpose.
  for (const el of [...(scope === document.body ? [] : [scope]), ...scope.querySelectorAll('*')]) {
    const style = getComputedStyle(el);
    if (!/(auto|scroll)/.test(style.overflowX) || !/(auto|scroll)/.test(style.overflowY) || el.scrollWidth <= el.clientWidth + 1 || !shown(el)) continue;
    if (el.closest('pre, code, table, [data-overflow-fade], .goal-kanban, .goal-canvas-map') || el.querySelector(':scope > :is(pre, table)')) continue;
    out.push({ kind: 'side-scroll', at: name(el), text: '', scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      widest: [...el.querySelectorAll('*')].filter((child) => child.getBoundingClientRect().right > el.getBoundingClientRect().right + 1 && shown(child)).slice(-1).map(name)[0] });
  }
  return out; })()`;

export type ChineseIssue = { kind: string; at: string; text: string; [detail: string]: unknown };

/**
 * Every audit of the walk on the screen as it stands (inside `data-audit-scope` when one element is marked): layout (touch
 * target sizes are tests/touch-targets' and tests/narrow-surfaces', VUX-30; this walk is about the words), text that spills,
 * cut text a keyboard cannot reach, and the Chinese audit.
 */
export async function chineseFindings(evaluate: Evaluate): Promise<unknown[]> {
  const layout = (await layoutFindings(evaluate)).filter((finding) => finding.kind !== "tiny-target");
  const wrap = (await evaluate<TextWrapIssue[]>(TEXT_WRAP_AUDIT)).filter((issue) => issue.kind === "spill");
  const cut = (await evaluate<{ found: TruncationIssue[] }>(TRUNCATION_AUDIT)).found;
  const chinese = await evaluate<ChineseIssue[]>(CHINESE_AUDIT);
  return [...layout, ...wrap, ...cut, ...chinese];
}
