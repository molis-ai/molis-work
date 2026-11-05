/**
 * The board's 工作台导航 section (apps/workbench/src/navigation-specimens.ts): each frame grows to what it draws, so the board
 * scrolls once (the frames are same-origin, so their height can be read).
 */
for (const frame of document.querySelectorAll<HTMLIFrameElement>("[data-nav-frame]")) {
  const fit = () => { const page = frame.contentDocument?.documentElement; if (page) frame.style.height = `${page.scrollHeight}px`; };
  frame.addEventListener("load", () => {
    fit();
    const body = frame.contentDocument?.body;
    if (body) new ResizeObserver(fit).observe(body);
  });
}
