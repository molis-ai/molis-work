import { randomUUID } from "node:crypto";
import type { HostSurfaceObservationKind } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { browserErrors } from "./errors.js";
import { ELEMENT_LIMIT } from "./surface-nodes.js";
import type { BrowserSurfaceRound, BrowserSurfaceSession } from "./surface-round.js";

export async function surfaceValue(session: BrowserSurfaceSession, expression: string): Promise<unknown> {
  const result = await session.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  session.assertCurrent();
  if (result.exceptionDetails || typeof result.result !== "object" || result.result === null || !("value" in result.result)) throw browserErrors.load_failed("无法读取原页面内容");
  return result.result.value;
}

export async function surfacePoint(session: BrowserSurfaceSession, x: number, y: number): Promise<string> {
  const value = await surfaceValue(session, `(() => { const el = document.elementFromPoint(${Math.round(x)}, ${Math.round(y)}); if (!el) return ''; const t = el.closest('a,button,input,select,textarea,label,[role]') || el; return String(t.getAttribute('aria-label') || (t.labels && t.labels[0] && t.labels[0].innerText) || t.innerText || t.getAttribute('placeholder') || t.getAttribute('title') || (t.type === 'password' ? '' : t.value) || t.getAttribute('name') || t.id || '').replace(/\\s+/g, ' ').trim().slice(0, 40); })()`);
  if (typeof value !== "string") throw browserErrors.load_failed("无法读取原页面目标");
  return value;
}

/** Read focus in a separate JS world, then ask Chrome itself whether the focused host conceals another field. */
export async function surfaceField(session: BrowserSurfaceSession): Promise<{ label: string; sensitive: boolean }> {
  const frame = await session.send("Page.getFrameTree") as { frameTree?: { frame?: { id?: string } } }; session.assertCurrent();
  const frameId = frame.frameTree?.frame?.id;
  if (!frameId) throw browserErrors.load_failed("无法核对原输入框");
  const world = await session.send("Page.createIsolatedWorld", { frameId, worldName: "molis-surface-focus" }); session.assertCurrent();
  if (!Number.isInteger(world.executionContextId)) throw browserErrors.load_failed("无法核对原输入框");
  const focus = await session.send("Runtime.evaluate", { contextId: world.executionContextId, returnByValue: false,
    expression: `(() => { let el = document.activeElement; while (el && el.shadowRoot) el = el.shadowRoot.activeElement;
      if (!el || el === document.body || el.localName === 'iframe' || el.localName === 'frame') return null;
      if (!['input', 'textarea'].includes(el.localName) && !el.isContentEditable) return null; return el; })()` }) as { result?: { objectId?: string }; exceptionDetails?: unknown };
  const objectId = focus.result?.objectId;
  try {
    session.assertCurrent();
    if (focus.exceptionDetails) throw browserErrors.load_failed("无法读取原输入框");
    if (!objectId) throw browserErrors.load_failed("无法核对原输入框");
    const described = await session.send("DOM.describeNode", { objectId, depth: 1, pierce: true }) as {
      node?: { attributes?: string[]; shadowRoots?: Array<{ shadowRootType?: string }> };
    }; session.assertCurrent();
    const node = described.node;
    if (!node || !Array.isArray(node.attributes) || node.attributes.length % 2 || node.attributes.some(value => typeof value !== "string")
      || node.shadowRoots?.some(root => root.shadowRootType !== "user-agent")) throw browserErrors.load_failed("无法核对原输入框");
    const attributes = new Map<string, string>();
    for (let i = 0; i < node.attributes.length; i += 2) attributes.set(node.attributes[i]!, node.attributes[i + 1]!);
    const label = await session.send("Runtime.callFunctionOn", { objectId, returnByValue: true,
      functionDeclaration: `function() { return String(this.getAttribute('aria-label') || (this.labels && this.labels[0] && this.labels[0].innerText) || this.getAttribute('placeholder') || this.getAttribute('name') || '').replace(/\\s+/g, ' ').trim().slice(0, 40); }` }) as { result?: { value?: unknown }; exceptionDetails?: unknown };
    session.assertCurrent();
    if (label.exceptionDetails || typeof label.result?.value !== "string") throw browserErrors.load_failed("无法核对原输入框");
    return { label: label.result.value, sensitive: attributes.get("type")?.toLowerCase() === "password" || /cc-|one-time-code/iu.test(attributes.get("autocomplete") ?? "") };
  } finally { if (objectId) await session.cleanup("Runtime.releaseObject", { objectId }).catch(() => undefined); }
}

async function screenshot(round: BrowserSurfaceRound, session: BrowserSurfaceSession): Promise<Uint8Array> {
  const maskId = `__molis_side_mask_${randomUUID().replaceAll("-", "")}`;
  try {
    const mask = await session.send("Runtime.evaluate", { expression: `(() => { const s = document.createElement('style'); s.id = '${maskId}';
      s.textContent = 'input[type=password],input[autocomplete*="cc-"],input[autocomplete="one-time-code"]{color:transparent!important;text-shadow:none!important;background:#1d1d1f!important;caret-color:transparent!important}';
      (document.head || document.documentElement).append(s); })()` });
    session.assertCurrent();
    if (mask.exceptionDetails) throw browserErrors.load_failed("无法遮住页面里的敏感输入框");
    const { width, height } = round.page.snapshot().viewport;
    const shot = await session.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false,
      clip: { x: 0, y: 0, width, height, scale: 1 / round.page.pixelRatio } });
    session.assertCurrent();
    if (typeof shot.data !== "string") throw browserErrors.load_failed("页面截图不可用");
    const bytes = new Uint8Array(Buffer.from(shot.data, "base64")); round.rememberScreen(bytes); return bytes;
  } finally {
    // Only remove this observation's mask, on the same CDP session even after its round has ended.
    await session.cleanup("Runtime.evaluate", { expression: `document.getElementById('${maskId}')?.remove()` }).catch(() => undefined);
  }
}

export async function observeBrowserSurface(round: BrowserSurfaceRound, kind: HostSurfaceObservationKind): Promise<Uint8Array> {
  round.assertCurrent();
  const generation = await round.nodes.clear(); round.assertCurrent();
  const session = await round.session(); session.assertCurrent();
  const state = round.page.snapshot();
  round.mark(`正在查看 ${state.origin || "空白页"}`, null);
  if (!state.origin && kind !== "screenshot") return new TextEncoder().encode("侧栏浏览器现在是空白页，还没有打开任何网站。\n要打开网站：用 surface-act 的 navigate，带上这次观察，填完整网址（https://…）；用户确认后才会打开。");
  if (kind === "screenshot") return screenshot(round, session);
  if (kind === "window-metadata") return new TextEncoder().encode(JSON.stringify({ site: state.origin, title: state.title, viewport: state.viewport, loading: state.loading, popup: state.popup_depth > 0 }));
  if (kind === "dom") {
    const capture = await round.page.capture(session.assertCurrent); session.assertCurrent();
    return new TextEncoder().encode(`页面：${capture.title}\n网站：${capture.origin}\n\n${capture.text}${capture.truncated ? "\n[页面正文较长，只取了开头]" : ""}`);
  }
  const outline = await round.nodes.observe(generation); session.assertCurrent();
  return new TextEncoder().encode([
    `页面：${outline.title || "（无标题）"}`, `地址：${outline.path}`,
    `视口：${outline.vw}×${outline.vh}，已向下滚动 ${outline.sy}/${outline.max}`, "",
    "可操作的元素（点击元素时把完整标识填入 node；@ 后是当前中心坐标）：",
    ...outline.elements.map(element => `node=${element.node} ${element.role}「${element.name || "无名称"}」${element.value ? ` 值=${element.value}` : ""}${element.href ? ` → ${element.href}` : ""}${element.states.length ? ` （${element.states.join("、")}）` : ""} @(${element.x},${element.y})`),
    ...(outline.elements.length >= ELEMENT_LIMIT ? ["（元素较多，只列出前 300 个）"] : []), "", "视口里的文字：", ...outline.text,
  ].join("\n"));
}
