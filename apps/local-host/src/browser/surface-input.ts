import path from "node:path";
import type { HostSurfaceAction, HostSurfaceExpectedTarget } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { browserAddress, shortcutCommands } from "./browser-host.js";
import { browserErrors } from "./errors.js";
import { surfacePoint, withSurfaceField } from "./surface-observation.js";
import type { BrowserSurfaceRound, BrowserSurfaceSession } from "./surface-round.js";

const KEYS: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
  enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" }, tab: { key: "Tab", code: "Tab", keyCode: 9 }, escape: { key: "Escape", code: "Escape", keyCode: 27 },
  esc: { key: "Escape", code: "Escape", keyCode: 27 }, backspace: { key: "Backspace", code: "Backspace", keyCode: 8 }, delete: { key: "Delete", code: "Delete", keyCode: 46 },
  arrowup: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 }, arrowdown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  arrowleft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 }, arrowright: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  home: { key: "Home", code: "Home", keyCode: 36 }, end: { key: "End", code: "End", keyCode: 35 }, pageup: { key: "PageUp", code: "PageUp", keyCode: 33 },
  pagedown: { key: "PageDown", code: "PageDown", keyCode: 34 }, space: { key: " ", code: "Space", keyCode: 32, text: " " },
};
const MODIFIERS: Record<string, number> = { alt: 1, option: 1, control: 2, ctrl: 2, meta: 4, cmd: 4, command: 4, shift: 8 };

const MODIFIER_KEYS: Record<string, { key: string; code: string; keyCode: number }> = {
  alt: { key: "Alt", code: "AltLeft", keyCode: 18 }, option: { key: "Alt", code: "AltLeft", keyCode: 18 }, control: { key: "Control", code: "ControlLeft", keyCode: 17 },
  ctrl: { key: "Control", code: "ControlLeft", keyCode: 17 }, meta: { key: "Meta", code: "MetaLeft", keyCode: 91 }, cmd: { key: "Meta", code: "MetaLeft", keyCode: 91 },
  command: { key: "Meta", code: "MetaLeft", keyCode: 91 }, shift: { key: "Shift", code: "ShiftLeft", keyCode: 16 },
};

function keyOf(name: string): { key: string; code: string; keyCode: number; text?: string } {
  const known = KEYS[name.toLowerCase()] ?? MODIFIER_KEYS[name.toLowerCase()];
  if (known) return known;
  if (/^[a-z]$/iu.test(name)) return { key: name, code: `Key${name.toUpperCase()}`, keyCode: name.toUpperCase().charCodeAt(0), text: name };
  if (/^\d$/u.test(name)) return { key: name, code: `Digit${name}`, keyCode: name.charCodeAt(0), text: name };
  if (/^F([1-9]|1[0-2])$/u.test(name)) return { key: name, code: name, keyCode: 111 + Number(name.slice(1)) };
  throw browserErrors.load_failed(`认不出按键「${name}」`);
}

async function pointer(round: BrowserSurfaceRound, session: BrowserSurfaceSession, action: Extract<HostSurfaceAction, { what: "pointer" }>, dispatched: () => void): Promise<void> {
  const coordinate = action.node === undefined ? { x: action.x, y: action.y, label: await surfacePoint(session, action.x, action.y) } : null;
  const gesture: { pressed: BrowserSurfaceSession["cleanup"] | null } = { pressed: null };
  let failure: unknown;
  const send = async (type: string, clickCount: number) => {
    const target = action.node === undefined ? null : await round.nodes.resolve(action.node, session.assertCurrent);
    try {
      const { x, y, label } = target ?? coordinate!;
      session.assertCurrent(); target?.assertCurrent();
      const inputSession = target?.session ?? session;
      await inputSession.send("Input.dispatchMouseEvent", { type, clickCount, x, y, button: type === "mouseMoved" ? "none" : action.button, buttons: type === "mousePressed" ? 1 : 0 }, () => {
        session.assertCurrent(); target?.assertCurrent();
        round.mark(`在 ${round.page.snapshot().origin || "空白页"} 点击${label ? `「${label}」` : `（${x}, ${y}）`}`, { x, y });
        dispatched();
        // CDP may receive the press and lose its response. Retain the original session before sending it.
        if (type === "mousePressed") gesture.pressed = target?.session.send ?? session.cleanup;
      });
      if (type === "mouseReleased") gesture.pressed = null;
    } finally { await target?.release(); }
  };
  try {
    await send("mouseMoved", 0);
    for (let click = 1; click <= Math.max(1, Math.min(3, action.clicks)); click++) {
      await send("mousePressed", click); await send("mouseReleased", click);
    }
    await round.settle();
  } catch (error) { failure = error; throw error; }
  finally {
    if (gesture.pressed) {
      try { await gesture.pressed("Input.dispatchMouseEvent", { type: "mouseReleased", x: -1, y: -1, button: action.button, buttons: 0, clickCount: 0 }); }
      catch (error) { throw new AggregateError([failure, error].filter(value => value !== undefined), "无法确认原鼠标手势已释放"); }
    }
  }
}

async function key(round: BrowserSurfaceRound, session: BrowserSurfaceSession, keys: readonly string[], dispatched: () => void): Promise<void> {
  const parts = keys.flatMap(entry => entry.split("+")).map(part => part.trim()).filter(Boolean);
  const modifiers = parts.reduce((mask, part) => mask | (MODIFIERS[part.toLowerCase()] ?? 0), 0);
  const main = parts.filter(part => MODIFIERS[part.toLowerCase()] === undefined);
  if (main.length > 1) throw browserErrors.load_failed("一次只能按一个键（可以加 Ctrl、Shift 等修饰键）；按顺序按几个键请分几次做。");
  const key = keyOf(main.length ? main[0]! : parts.at(-1) ?? "");
  const text = modifiers & (2 | 4) ? undefined : key.text;
  const paste = (key.key.toLowerCase() === "v" && (modifiers & (2 | 4)) !== 0) || (key.key === "Insert" && (modifiers & 8) !== 0);
  const commands = process.platform === "darwin" ? shortcutCommands(key.code, modifiers, 2 | 4) : [];
  const up = { type: "keyUp", key: key.key, code: key.code, windowsVirtualKeyCode: key.keyCode, modifiers };
  let held = false, failure: unknown;
  try {
    const press = () => session.send("Input.dispatchKeyEvent", { ...up, type: text ? "keyDown" : "rawKeyDown", ...(text ? { text } : {}), ...(commands.length ? { commands } : {}) }, () => {
      round.mark(`在 ${round.page.snapshot().origin || "空白页"} 按下 ${parts.join(" + ")}`, null); dispatched(); held = true;
    });
    const stroke = async () => { await press(); await session.send("Input.dispatchKeyEvent", up, dispatched); held = false; };
    if (text || paste) await withSurfaceField(session, field => {
      if (field.sensitive) throw browserErrors.load_failed("焦点在密码类输入框里，助理不能替用户输入");
      return stroke();
    });
    else await stroke();
    await round.settle();
  } catch (error) { failure = error; throw error; }
  finally {
    if (held) try { await session.cleanup("Input.dispatchKeyEvent", { ...up, modifiers: 0 }); }
    catch (error) { throw new AggregateError([failure, error].filter(value => value !== undefined), "无法确认原按键已释放"); }
  }
}

export async function performBrowserSurface(round: BrowserSurfaceRound, action: HostSurfaceAction, expected: HostSurfaceExpectedTarget): Promise<void> {
  let dispatched = false, knownFailure = false;
  const sent = () => { dispatched = true; };
  try {
    const session = await round.session(expected); session.assertCurrent();
    const origin = round.page.snapshot().origin || "空白页";
    switch (action.what) {
      case "pointer": return await pointer(round, session, action, sent);
      case "key": return await key(round, session, action.keys, sent);
      case "text": {
        await withSurfaceField(session, field => {
          if (field.sensitive) throw browserErrors.load_failed("焦点在密码类输入框里，助理不能替用户输入");
          if (expected.approved_focus !== undefined && field.focus !== expected.approved_focus) throw browserErrors.load_failed("原批准的输入焦点已变化，请重新观察");
          return session.send("Input.insertText", { text: action.text }, () => {
            round.mark(`在 ${origin} ${field.label ? `的「${field.label}」里` : ""}输入 ${[...action.text].length} 个字`, null); sent();
          });
        });
        round.assertCurrent(); return;
      }
      case "navigate": {
        const address = browserAddress(action.url);
        if ("blocked" in address) throw browserErrors.blocked_scheme(`只能打开网页地址，不能打开「${address.blocked}:」`);
        const result = await round.page.navigate(address.url, () => { session.assertCurrent(); round.assertDestination(address.url); }, () => { round.mark(`打开 ${address.url === "about:blank" ? "空白页" : new URL(address.url).origin}`, null); sent(); }, round.assertCurrent);
        if (result?.errorText) { knownFailure = true; throw browserErrors.load_failed(result.errorText); }
        await round.settle(); return;
      }
      case "wait":
        round.mark(`等待页面（${Math.round(Math.min(action.ms, 10_000) / 100) / 10} 秒）`, null);
        await new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(action.ms, 10_000)))); session.assertCurrent(); return;
      case "upload": {
        const file = path.resolve(path.sep, ...action.from), chooser = round.page.snapshot().file_chooser;
        if (!chooser) throw browserErrors.load_failed("网页现在没有在等待选择文件：先点击网页上的上传按钮。");
        await round.page.chooseFiles(chooser.id, [file], session.assertCurrent, () => { round.mark(`向 ${origin} 上传 ${path.basename(file)}`, null); sent(); });
        await round.settle(); return;
      }
      case "download": throw browserErrors.load_failed("侧栏浏览器里的下载由用户在下载提示里保存；助理不能把文件存到本机指定位置。");
      default: throw browserErrors.load_failed("这个动作不能在侧栏浏览器中执行");
    }
  } catch (error) {
    if (!dispatched || knownFailure) throw error;
    throw Object.assign(browserErrors.load_failed("无法确认这次输入是否完整完成，请检查原页面。"), { refusal: "driver-unavailable" as const, partial: true, cause: error });
  }
}
