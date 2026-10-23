import type { TestContext } from "node:test";
import { pluginFrameBrowser } from "./plugin-frame-browser.js";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { Issue, IssueListResult } from "@molis-ai/molis-work-plugin-issues";
import type { openGoalBrowser } from "./goal-browser.js";

export type IssueBrowser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
export const ISSUE_FRAME = '[data-side-body="plugin:issues/capture"] iframe';

/** Real input in the opaque Issue view; a side panel retains its own trusted outer document. */
export async function issueView(t: TestContext, b: IssueBrowser, evidence = "issue-capture") {
  const child = await pluginFrameBrowser(t, b, "issues", ISSUE_FRAME);
  const within = (body: string) => `(() => { const d = document, $ = q => d.querySelector(q); return (${body}); })()`;
  const ask = <T = unknown>(body: string) => child.evaluate<T>(within(body));
  const until = (body: string, timeout = 8000) => child.waitFor(within(body), timeout);
  const key = async (code: string, modifiers = 0, key = code.replace(/^Key/, "")) => {
    for (const type of ["rawKeyDown", "keyUp"]) await b.command("Input.dispatchKeyEvent", { type, modifiers, code, key, windowsVirtualKeyCode: { Enter: 13, Escape: 27, KeyI: 73 }[code] ?? 0 }, b.sessionId);
  };
  const api = <T = unknown>(path: string, body?: unknown) => b.evaluate<T>(`(async () => { const response = await fetch(${JSON.stringify(path)}, { method: ${JSON.stringify(body === undefined ? "GET" : "POST")},
    headers: globalThis.molisWorkControlHeaders(), ${body === undefined ? "" : `body: JSON.stringify(${JSON.stringify(body)})`} });
    const text = await response.text(); if (!response.ok) throw new Error(response.status + ' ' + text); return JSON.parse(text); })()`);
  return {
    within, ask, until, api, frame: child,
    /** ⌘⇧I: the summon chord. */
    chord: () => key("KeyI", 4 | 8),
    /** ⌘↵ in the focused form. */
    send: () => key("Enter", 4),
    escape: () => key("Escape"),
    type: (text: string) => b.command("Input.insertText", { text }, b.sessionId),
    composerFocused: async () => {
      try { await until("d.hasFocus() && d.activeElement === $('[data-issue-composer] [name=description]')"); }
      catch (error) { throw new Error(JSON.stringify({ child: await ask("({focus:d.hasFocus(),active:d.activeElement?.outerHTML.slice(0,180),hidden:d.body.hidden})").catch(String),
        owner: await b.evaluate(`(()=>{const outer=document.querySelector(${JSON.stringify(ISSUE_FRAME)}),d=outer?.contentDocument;return{focus:d?.hasFocus(),active:d?.activeElement?.outerHTML.slice(0,180),top:document.activeElement?.outerHTML.slice(0,180),hidden:outer?.hidden};})()`) }), {cause:error}); }
    },
    press: child.click,
    point: child.point,
    /** A real PNG on a synthetic clipboard, pasted where the keyboard is: what a pasted screenshot looks like to the page. */
    paste: (name = "shot.png", width = 640) => ask(`(async () => { const c = d.createElement('canvas'); c.width = ${width}; c.height = 360; const g = c.getContext('2d');
      g.fillStyle = '#e8e0d8'; g.fillRect(0, 0, c.width, 360); g.fillStyle = '#93604b'; g.fillRect(24, 24, c.width - 48, 48);
      const blob = await new Promise(r => c.toBlob(r, 'image/png')); const t = new DataTransfer(); t.items.add(new File([blob], ${JSON.stringify(name)}, { type: 'image/png' }));
      (d.activeElement || d.body).dispatchEvent(new ClipboardEvent('paste', { clipboardData: t, bubbles: true, cancelable: true })); return true; })()`),
    list: () => api<IssueListResult>("/api/plugins/io.molis.work.issues/list"),
    read: (id: string) => api<Issue>(`/api/plugins/io.molis.work.issues/read?id=${encodeURIComponent(id)}`),
    /** The person's active Assistant works with their state, and the open notices: the Issue page names its captures itself (ISSUE-50), so a capture leaves none. */
    assistant: async () => {
      const ids = (await api<{ works: Array<{ work_id: string }> }>("/api/assistant/works")).works.map(work => work.work_id);
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
