import type { openGoalBrowser } from "./goal-browser.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

/** Pause the real browser draft CAS before the first child command can reach either product's transport. */
export async function holdSubtaskDraft(browser: Browser, command: string) {
  let posts = 0;
  await browser.command("Network.enable", {}, browser.sessionId);
  const off = browser.on("Network.requestWillBeSent", event => {
    const { method, postData } = event.request as { method: string; postData?: string };
    if (method === "POST" && postData?.includes(JSON.stringify(command))) posts++;
  });
  await browser.evaluate(`(() => {
    const put = Cache.prototype.put;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const state = window.b59Draft = { entered: false, finish() { Cache.prototype.put = put; release(); } };
    Cache.prototype.put = async function (input, response) {
      if (!state.entered && String(input).includes('/.molis-draft/')) {
        const value = await response.clone().json().catch(() => null);
        if (value?.pending?.kind === 'action') { state.entered = true; await gate; }
      }
      return put.call(this, input, response);
    };
  })()`);
  return {
    wait: () => browser.waitFor("window.b59Draft.entered"),
    posts: () => posts,
    async release() { await browser.evaluate("window.b59Draft.finish()"); },
    dispose: off,
  };
}
