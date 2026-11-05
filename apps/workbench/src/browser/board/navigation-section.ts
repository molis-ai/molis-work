/**
 * The board's 工作台导航 section (apps/workbench/src/navigation-specimens.ts): its frame grows to what it draws, so the board
 * scrolls once (the frame is same-origin, so its height can be read).
 */
const frame = document.querySelector<HTMLIFrameElement>("[data-nav-frame]");
if (frame) {
  const fit = () => { const page = frame.contentDocument?.documentElement; if (page) frame.style.height = `${page.scrollHeight}px`; };
  frame.addEventListener("load", () => {
    fit();
    const body = frame.contentDocument?.body;
    if (body) new ResizeObserver(fit).observe(body);
  });
}
