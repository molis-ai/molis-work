import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import type { ChromeHarness, CdpParams } from "./cdp.js";

export interface WaitOptions {
  /** How long the expression may stay false. */
  readonly timeoutMs?: number;
  /** Poll interval in the page. */
  readonly pollMs?: number;
  /** A page expression whose text is appended to the timeout error; defaults to the harness's `describe`. */
  readonly describe?: string;
}

/** One attached page. Selectors and expressions come from the test; nothing here knows any product markup. */
export class ChromePage {
  constructor(private readonly browser: ChromeHarness, readonly sessionId: string, readonly targetId: string) {}

  command<T = unknown>(method: string, params: CdpParams = {}, timeoutMs?: number): Promise<T> {
    return this.browser.command<T>(method, params, this.sessionId, timeoutMs);
  }

  /** Evaluates in the page (awaiting a returned promise) and returns the value; an exception fails the test. */
  async evaluate<T = unknown>(expression: string, timeoutMs?: number): Promise<T> {
    const result = await this.command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }

  /** Waits in the page until `expression` is truthy. The timeout error names the expression and the `describe` text. */
  async wait(expression: string, options: WaitOptions = {}): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 14_000;
    const describe = options.describe ?? this.browser.describe;
    const detailExpression = describe ? `'; ' + String(${describe})` : "''";
    await this.evaluate(`new Promise((resolve, reject) => {
      const until = Date.now() + ${timeoutMs};
      const detail = () => { try { return ${detailExpression}; } catch (error) { return '; describe failed: ' + error; } };
      const check = () => {
        if (${expression}) return resolve(true);
        if (Date.now() > until) return reject(new Error('DOM timeout: ' + ${JSON.stringify(expression)} + detail()));
        setTimeout(check, ${options.pollMs ?? 40});
      };
      check();
    })`, Math.max(this.browser.commandTimeoutMs, timeoutMs + 2_000));
  }

  /** Clicks the element's centre with real mouse events; a missing, disabled, hidden or covered element throws. */
  async click(selector: string): Promise<void> {
    const point = await this.evaluate<{ x: number; y: number }>(`(async () => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw Error('Missing ' + ${JSON.stringify(selector)});
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height || element.disabled) throw Error('Unavailable ' + ${JSON.stringify(selector)});
      if (!element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))) throw Error('Covered ' + ${JSON.stringify(selector)});
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    })()`);
    await this.command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
    await this.command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
  }

  /** Replaces the text of a field the way a person does: focus by click, select all, type. */
  async fill(selector: string, text: string): Promise<void> {
    await this.click(selector);
    await this.command("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: process.platform === "darwin" ? 4 : 2, commands: ["selectAll"] });
    await this.command("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 0 });
    await this.command("Input.insertText", { text });
  }

  /** Sets the viewport and turns reduced motion on, so screenshots and layout checks are steady. */
  async viewport(width: number, height: number, mobile = false): Promise<void> {
    await this.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await this.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  }

  async screenshot(path: string): Promise<void> {
    const result = await this.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path, Buffer.from(result.data, "base64"));
  }
}
