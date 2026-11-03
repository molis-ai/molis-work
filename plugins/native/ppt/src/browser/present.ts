import type { Ppt, PptPage, Slide } from "./types.js";

/** One slide drawn at presenting or printing size, in the deck's colors. */
function slideNode(record: Ppt, slide: Slide, index: number): HTMLElement {
  const card = document.createElement("article");
  card.className = "ppt-present-slide";
  card.style.background = record.color_background;
  card.style.color = record.color_text;
  card.style.setProperty("--ppt-accent", record.color_primary);
  const heading = document.createElement("h2");
  heading.textContent = slide.title || (index === 0 ? record.title : "");
  card.append(heading);
  if ((slide.bullets || []).length) {
    const bullets = document.createElement("ul");
    slide.bullets.forEach((item) => { const li = document.createElement("li"); li.textContent = item; bullets.append(li); });
    card.append(bullets);
  } else if (index === 0 && record.description) {
    const lede = document.createElement("p");
    lede.textContent = record.description;
    card.append(lede);
  }
  return card;
}

const PRINT_PAGE = "<!doctype html><html><head><meta charset='utf-8'><title></title><style>@page{size:A4 landscape;margin:0}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}.ppt-present-slide{box-sizing:border-box;width:100vw;height:100vh;padding:7vh 8vw;page-break-after:always;border-left:1.2vw solid var(--ppt-accent)}h2{font-size:5vh;margin:0 0 4vh}ul{font-size:3vh;line-height:1.6;margin:0;padding-left:1.2em}p{font-size:3vh}</style></head><body></body></html>";

/** Full-screen presenting on this computer, and every slide on its own landscape page for the browser's print dialog. */
export function installPresent(page: PptPage): void {
  const { L, el, s } = page;

  /** Arrows or click to move, N for speaker notes, Esc to leave. */
  page.present = (record, start) => {
    const slides = record.slides || [];
    if (!slides.length) return;
    let index = Math.max(0, Math.min(slides.length - 1, start));
    let notes = false;
    const stage = document.createElement("div");
    stage.className = "ppt-present";
    stage.tabIndex = -1;
    stage.setAttribute("role", "dialog");
    stage.setAttribute("aria-label", L("ppt.present.action") + " · " + record.title);
    const frame = document.createElement("div");
    frame.className = "ppt-present-frame";
    const notesEl = document.createElement("aside");
    notesEl.className = "ppt-present-notes";
    const bar = document.createElement("div");
    bar.className = "ppt-present-bar";
    stage.append(frame, notesEl, bar);
    // The slide's canvas is 960×540; the stage scales it to the largest size the screen holds.
    const fit = () => stage.style.setProperty("--present-scale", String(Math.min(window.innerWidth / 960, window.innerHeight / 540)));
    fit();
    window.addEventListener("resize", fit);
    const draw = () => {
      const slide = slides[index]!;
      frame.replaceChildren(slideNode(record, slide, index));
      const text = slide.notes || "";
      notesEl.hidden = !notes || !text;
      notesEl.textContent = text;
      bar.textContent = (index + 1) + " / " + slides.length + " · " + L("ppt.present.bar");
    };
    let watch: ReturnType<typeof setInterval> | undefined;
    const leave = () => {
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", fit);
      clearInterval(watch);
      if (document.fullscreenElement === stage) document.exitFullscreen().catch(() => {});
      stage.remove();
      s.slideKey = slides[index]!.id;
      if (s.selected && s.selected.id === record.id) {
        page.renderSlideList(s.selected);
        page.fillSlideFields(page.currentSlide());
        page.paintView(page.liveRecord());
      }
    };
    function key(event: KeyboardEvent): void {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(event.key)) index = Math.min(slides.length - 1, index + 1);
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(event.key)) index = Math.max(0, index - 1);
      else if (event.key === "Home") index = 0;
      else if (event.key === "End") index = slides.length - 1;
      else if (event.key === "n" || event.key === "N") notes = !notes;
      else if (event.key === "Escape") { event.preventDefault(); leave(); return; }
      else return;
      event.preventDefault();
      draw();
    }
    stage.addEventListener("click", (event) => {
      if ((event.target as Element).closest(".ppt-present-notes")) return;
      index = Math.min(slides.length - 1, index + 1);
      draw();
    });
    stage.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && stage.isConnected) leave(); });
    document.addEventListener("keydown", key, true);
    // Switching to another plugin hides this surface; the show must not stay on top of the next one.
    // The surface hides through an ancestor (the tab workspace pool), so visibility is what to watch.
    watch = setInterval(() => { if (!el.bench.isConnected || (el.bench.checkVisibility && !el.bench.checkVisibility())) leave(); }, 250);
    draw();
    document.body.append(stage);
    stage.focus();
    stage.requestFullscreen?.().catch(() => {});
  };

  /** Every slide on its own landscape page, for the browser's print dialog (“存储为 PDF”). */
  page.printDeck = (record) => {
    const doc = document.implementation.createHTMLDocument();
    doc.open();
    doc.write(PRINT_PAGE);
    doc.close();
    doc.title = record.title;
    (record.slides || []).forEach((slide, index) => doc.body.append(doc.importNode(slideNode(record, slide, index), true)));
    page.host.printDocument(doc.documentElement.outerHTML);
    page.placed({ verb: "printed", title: record.title });
  };
}
