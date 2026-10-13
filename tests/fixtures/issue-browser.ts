import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { Issue, IssueListResult } from "@molis-ai/molis-work-plugin-issues";
import type { openGoalBrowser } from "./goal-browser.js";

export type IssueBrowser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
export const ISSUE_FRAME = '[data-side-body="plugin:issues/capture"] iframe';

/**
 * Real input into the Issue view wherever it is: the side panel's frame when this page has one with Issue loaded,
 * otherwise this page itself (the full page). Clicks are real pointer events, hit-tested in both documents.
 */
export function issueView(b: IssueBrowser, evidence = "issue-capture") {
  const within = (body: string) => `(() => { const f = document.querySelector(${JSON.stringify(ISSUE_FRAME)});
    const d = f && f.contentDocument && f.contentDocument.querySelector('[data-issue-root]') ? f.contentDocument : document; const $ = q => d.querySelector(q); return (${body}); })()`;
  const ask = <T = unknown>(body: string) => b.evaluate<T>(within(body));
  const until = (body: string, timeout = 8000) => b.waitFor(within(body), timeout);
  const key = async (code: string, modifiers = 0, key = code.replace(/^Key/, "")) => {
    for (const type of ["rawKeyDown", "keyUp"]) await b.command("Input.dispatchKeyEvent", { type, modifiers, code, key, windowsVirtualKeyCode: { Enter: 13, Escape: 27, KeyI: 73 }[code] ?? 0 }, b.sessionId);
  };
  const api = <T = unknown>(path: string, body?: unknown) => b.evaluate<T>(`(async () => { const response = await fetch(${JSON.stringify(path)}, { method: ${JSON.stringify(body === undefined ? "GET" : "POST")},
    headers: globalThis.molisWorkControlHeaders(), ${body === undefined ? "" : `body: JSON.stringify(${JSON.stringify(body)})`} });
    const text = await response.text(); if (!response.ok) throw new Error(response.status + ' ' + text); return JSON.parse(text); })()`);
  return {
    within, ask, until, api,
    /** ⌘⇧I: the summon chord. */
    chord: () => key("KeyI", 4 | 8),
    /** ⌘↵ in the focused form. */
    send: () => key("Enter", 4),
    escape: () => key("Escape"),
    type: (text: string) => b.command("Input.insertText", { text }, b.sessionId),
    composerFocused: () => until("d.hasFocus() && d.activeElement === $('[data-issue-composer] [name=description]')"),
    async press(selector: string) {
      await until(`(() => { const el = $(${JSON.stringify(selector)}); return el && el.getClientRects().length && !el.closest('[hidden]') && !el.disabled; })()`);
      const point = await b.evaluate<{ x: number; y: number; hit: boolean }>(`(() => {
        const f = document.querySelector(${JSON.stringify(ISSUE_FRAME)}), framed = f && f.contentDocument && f.contentDocument.querySelector('[data-issue-root]');
        const d = framed ? f.contentDocument : document, el = d.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: 'nearest' });
        const box = el.getBoundingClientRect(), outer = framed ? f.getBoundingClientRect() : { left: 0, top: 0 }, x = box.left + box.width / 2;
        const y = [box.top + box.height / 2, box.top + 8, box.bottom - 8].find(y => el.contains(d.elementFromPoint(x, y)) && (!framed || document.elementFromPoint(outer.left + x, outer.top + y) === f));
        return { x: outer.left + x, y: outer.top + (y ?? 0), hit: y !== undefined };
      })()`);
      assert.equal(point.hit, true, `${selector} must be visible and clickable`);
      for (const type of ["mousePressed", "mouseReleased"]) await b.command("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount: 1 }, b.sessionId);
    },
    /** A real PNG on a synthetic clipboard, pasted where the keyboard is: what a pasted screenshot looks like to the page. */
    paste: (name = "shot.png", width = 640) => ask(`(async () => { const c = d.createElement('canvas'); c.width = ${width}; c.height = 360; const g = c.getContext('2d');
      g.fillStyle = '#e8e0d8'; g.fillRect(0, 0, c.width, 360); g.fillStyle = '#93604b'; g.fillRect(24, 24, c.width - 48, 48);
      const blob = await new Promise(r => c.toBlob(r, 'image/png')); const t = new DataTransfer(); t.items.add(new File([blob], ${JSON.stringify(name)}, { type: 'image/png' }));
      (d.activeElement || d.body).dispatchEvent(new ClipboardEvent('paste', { clipboardData: t, bubbles: true, cancelable: true })); return true; })()`),
    list: () => api<IssueListResult>("/api/plugins/io.molis.work.issues/list"),
    read: (id: string) => api<Issue>(`/api/plugins/io.molis.work.issues/read?id=${encodeURIComponent(id)}`),
    /**
     * The person's active Assistant works with their state, and the open notices. `filed`: every work in creation order,
     * the ones a page has archived included (the Issue page files a capture's work away once its row says how it went).
     */
    assistant: async (filed = false) => {
      const ids = filed ? (() => {
        const db = new DatabaseSync(homeSqlitePath(b.homeDirectory, "assistant"), { readOnly: true });
        try { return db.prepare("SELECT work_id FROM assistant_works ORDER BY rowid").all().map(row => String(row.work_id)); } finally { db.close(); }
      })() : (await api<{ works: Array<{ work_id: string }> }>("/api/assistant/works")).works.map(work => work.work_id);
      const views = await Promise.all(ids.map(id => api<AssistantWorkView>(`/api/assistant/works/${id}`)));
      const { notices } = await api<{ notices: Array<{ kind: string; work_title: string }> }>("/api/assistant/notices");
      return { works: views, notices };
    },
    async shot(name: string) {
      const image = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, b.sessionId);
      const directory = resolve(".impeccable/qa/review", evidence); await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, `${name}.png`), Buffer.from(image.data, "base64"));
    },
    viewport: (width: number, height = 900) => b.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, b.sessionId),
    go: (path: string) => b.navigate(() => b.command("Page.navigate", { url: `${b.origin}${path}` }, b.sessionId)),
  };
}
