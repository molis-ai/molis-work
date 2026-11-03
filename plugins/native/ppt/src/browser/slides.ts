import type { Ppt, PptPage, Slide } from "./types.js";

const textOf = (tag: string, className: string, text: string): HTMLElement => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};

const iconButton = (label: string, svg: string, dataset: Record<string, string>): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mw-btn mw-btn--ghost mw-btn--icon-only";
  Object.assign(button.dataset, dataset);
  button.setAttribute("aria-label", label);
  button.innerHTML = `<svg aria-hidden="true"><use href="#${svg}"></use></svg>`;
  return button;
};

/** The deck's pieces on screen: colors, the slide being edited, the slide strip and the preview, and the deck they add up to. */
export function installSlides(page: PptPage): void {
  const { L, el, s } = page;

  page.currentSlide = () => (s.selected?.slides || []).find((slide) => slide.id === s.slideKey) || s.selected?.slides?.[0];

  page.slidesFromEditor = () => {
    const slides: Slide[] = [...(s.selected?.slides || [])];
    const index = slides.findIndex((slide) => slide.id === s.slideKey);
    if (index < 0) return slides;
    slides[index] = {
      ...slides[index]!,
      title: el.slideTitle.value,
      bullets: el.slideBullets.value.split("\n").map((line) => line.trim()).filter(Boolean),
      notes: el.slideNotes.value,
      order: index + 1,
    };
    return slides;
  };

  const colorOf = (root: HTMLElement) => root.dataset.value || "";
  page.setColor = (root, value) => {
    if (!(root instanceof HTMLElement)) return;
    root.dataset.value = value;
    root.querySelectorAll<HTMLElement>("[data-ppt-swatch]").forEach((button) => {
      button.setAttribute("aria-checked", String(button.dataset.pptSwatch === value));
    });
  };

  page.liveRecord = () => ({
    ...page.open(),
    title: el.titleInput.value,
    description: el.descriptionInput.value,
    color_primary: colorOf(el.colorPrimary),
    color_background: colorOf(el.colorBackground),
    color_text: colorOf(el.colorText),
    slides: page.slidesFromEditor(),
  });

  page.draftFromDom = () => {
    const value = page.liveRecord();
    return { title: value.title, description: value.description, color_primary: value.color_primary,
      color_background: value.color_background, color_text: value.color_text, slides: [...value.slides] };
  };

  page.paintView = (record) => {
    el.previewEl.replaceChildren();
    (record.slides || []).forEach((slide, index) => {
      const card = document.createElement("article");
      card.className = "ppt-card" + (slide.id === s.slideKey ? " is-current" : "");
      card.style.background = record.color_background;
      card.style.color = record.color_text;
      card.style.borderColor = record.color_primary;
      const kicker = document.createElement("small");
      kicker.textContent = String(index + 1);
      kicker.style.color = record.color_primary;
      const heading = document.createElement("h2");
      heading.textContent = slide.title || L("ppt.slide.untitled");
      const bullets = document.createElement("ul");
      (slide.bullets || []).forEach((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        bullets.append(li);
      });
      if (!bullets.childElementCount) card.append(kicker, heading, textOf("p", "ppt-card-empty", L("ppt.slide.no-bullets")));
      else card.append(kicker, heading, bullets);
      const item = document.createElement("div");
      item.className = "ppt-preview-item";
      item.append(card);
      if (slide.notes) item.append(textOf("p", "ppt-card-notes", slide.notes));
      el.previewEl.append(item);
    });
  };

  page.renderSlideList = (record: Ppt) => {
    el.slideList.replaceChildren();
    (record.slides || []).forEach((slide, index) => {
      const row = document.createElement("div");
      row.className = "ppt-slide-row" + (slide.id === s.slideKey ? " is-selected" : "");
      row.dataset.slideId = slide.id;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.slideSelect = "true";
      button.append(textOf("span", "ppt-slide-index", String(index + 1)), textOf("span", "ppt-slide-title", slide.title || L("ppt.slide.untitled")));
      row.append(
        button,
        iconButton(L("ppt.slide.up"), "icon-chevron-up", { slideMove: "-1" }),
        iconButton(L("ppt.slide.down"), "icon-chevron-down", { slideMove: "1" }),
        iconButton(L("ppt.slide.remove"), "icon-x", { slideRemove: "true" }),
      );
      el.slideList.append(row);
    });
  };

  page.syncSlideLabel = () => {
    const button = el.slideList.querySelector(`[data-slide-id="${s.slideKey}"] [data-slide-select]`);
    if (!button) return;
    const index = (s.selected?.slides || []).findIndex((slide) => slide.id === s.slideKey);
    const indexMark = button.querySelector(".ppt-slide-index");
    const label = button.querySelector(".ppt-slide-title");
    if (indexMark) indexMark.textContent = String(index + 1);
    if (label) label.textContent = el.slideTitle.value.trim() || L("ppt.slide.untitled");
  };

  page.fillSlideFields = (slide) => {
    s.slideKey = slide?.id || "";
    el.slideTitle.value = slide?.title || "";
    el.slideBullets.value = (slide?.bullets || []).join("\n");
    el.slideNotes.value = slide?.notes || "";
    [el.slideBullets, el.slideNotes].forEach((field) => window.molisFit?.(field));
  };
}
