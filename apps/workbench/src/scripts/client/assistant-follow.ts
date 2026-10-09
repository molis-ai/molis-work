/**
 * Following a live work in the bottom bar. The page waits on the Host for the work's view to change (a long request that
 * returns the new view, or the same one after 20 s) instead of reading it on a timer; a burst of changes is drawn at most
 * twice a second (every 8 s while the page is hidden, so it is current when the person looks again), and a Host that is
 * away or restarting is asked again a little later (specs/prologue-adoption §4.5).
 */
export const ASSISTANT_FOLLOW_FACTORY_SCRIPT = String.raw`(input) => {
  let following = null;
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const run = async (id, controller) => {
    let since = null, failures = 0;
    while (!controller.signal.aborted && input.current() === id) {
      const started = Date.now();
      try {
        const response = await fetch(input.route("/api/assistant/works/" + encodeURIComponent(id) + "/wait?timeout=20000" + (since ? "&since=" + since : "")),
          { headers: input.headers(), signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const result = await response.json();
        failures = 0;
        if (result.version !== since && input.current() === id && !controller.signal.aborted) { since = result.version; input.show(result.view); }
        if (!input.isLive(result.view.work.state)) break;
      } catch {
        if (controller.signal.aborted) return;
        failures += 1;
        await pause(Math.min(8000, 1200 * failures));
      }
      const spent = Date.now() - started, gap = document.hidden ? 8000 : 500;
      if (spent < gap) await pause(gap - spent);
    }
    if (following === controller) following = null;
  };
  const stop = () => { if (following) { following.abort(); following = null; } };
  return { stop, follow(id) {
    if (following && following.id === id) return;
    stop();
    const controller = Object.assign(new AbortController(), { id });
    following = controller;
    void run(id, controller);
  } };
}`;
