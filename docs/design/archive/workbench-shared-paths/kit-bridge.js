// Loaded before each 03 prototype's app.js, after ../kit/kit.js.
// 1. kitRing(kind): the board's state ring (renderStateRing) for the ring kinds these prototypes name.
// 2. Segmented controls are plain buttons inside .mw-toggle-group marked with aria-pressed; the board's toggle reads
//    .mw-toggle and .is-current, so the two are kept in step on every render.
// 3. Once the page has drawn, the board's own client script starts (press give, segmented thumb, ring motion, theme).
(() => {
  // ?lang=en&theme=dark (for review screenshots) is written into this prototype's saved state before app.js reads it.
  const q = new URLSearchParams(location.search), dir = location.pathname.split("/").filter(Boolean).pop();
  if (q.has("lang") || q.has("theme")) {
    try {
      const key = `molis-proto.${dir}.v1`, saved = JSON.parse(localStorage.getItem(key) || "{}");
      for (const k of ["lang", "theme"]) if (q.get(k)) saved[k] = q.get(k);
      localStorage.setItem(key, JSON.stringify(saved));
      if (q.get("theme")) localStorage.setItem("molis-work:theme", q.get("theme"));
    } catch { /* no storage: the prototype keeps its defaults */ }
  }
  const STATE = { running: "running", progress: "running", decide: "answer", accept: "approval", failed: "failed", partial: "partial",
    done: "done", stale: "stale", none: "idle", waiting: "waiting", blocked: "blocked", "": "idle" };
  window.kitRing = (kind) => window.mwKit.renderStateRing({ state: STATE[kind ?? ""] ?? "idle", size: 14, className: "ring" });
  const sync = () => {
    for (const b of document.querySelectorAll(".mw-toggle-group > button")) {
      b.classList.add("mw-toggle");
      b.classList.toggle("is-current", b.getAttribute("aria-pressed") === "true");
    }
  };
  new MutationObserver(sync).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-pressed"] });
  setTimeout(() => {
    sync();
    const client = document.createElement("script");
    client.textContent = window.mwKitClient;
    document.body.appendChild(client);
  }, 0);
})();
