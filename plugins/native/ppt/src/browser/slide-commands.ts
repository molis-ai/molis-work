import type { PptPage, Slide } from "./types.js";

/** A color chosen from the swatches: the deck is changed, saved later, and shown again. */
export function pickColor(page: PptPage, swatch: HTMLElement): void {
  page.setColor(swatch.closest("[role=radiogroup]"), swatch.dataset.pptSwatch || "");
  page.queueSave();
  page.paintView(page.liveRecord());
}

/** Shows the deck with its slides replaced, the strip and the preview drawn again. */
function showSlides(page: PptPage, slides: Slide[], key: string): void {
  const { s } = page;
  s.selected = { ...page.open(), slides };
  s.slideKey = key;
  page.fillSlideFields(page.currentSlide());
  page.renderSlideList(s.selected);
  page.paintView(s.selected);
}

export function addSlide(page: PptPage): void {
  const { L, el, s } = page;
  const slides: Slide[] = [...page.slidesFromEditor(), { id: "s-" + crypto.randomUUID(), title: L("ppt.slide.untitled"), bullets: [], notes: "", order: page.open().slides.length + 1 }];
  s.selected = { ...page.open(), slides };
  s.slideKey = slides.at(-1)!.id;
  page.fillSlideFields(slides.at(-1));
  page.renderSlideList(s.selected);
  page.paintView(s.selected);
  page.arrive(el.slideList.lastElementChild as HTMLElement | null);
  page.arrive(el.previewEl.lastElementChild as HTMLElement | null);
  page.paintStatus(s.selected);
  page.queueSave();
}

/** Another slide chosen in the strip: the typed fields are kept in the deck, then the chosen slide's are filled in. */
export function selectSlide(page: PptPage, row: HTMLElement): void {
  const { s } = page;
  s.selected = page.liveRecord();
  s.slideKey = row.dataset.slideId || "";
  page.fillSlideFields(page.currentSlide());
  page.renderSlideList(s.selected);
  page.paintView(s.selected);
  page.queueSave();
}

export function moveSlide(page: PptPage, button: HTMLElement): void {
  const id = button.closest<HTMLElement>("[data-slide-id]")?.dataset.slideId;
  const slides = page.slidesFromEditor();
  const index = slides.findIndex((slide) => slide.id === id);
  const next = index + Number(button.dataset.slideMove);
  if (!id || index < 0 || next < 0 || next >= slides.length) return;
  const swap = slides[index]!;
  slides[index] = slides[next]!;
  slides[next] = swap;
  showSlides(page, slides, id);
  page.queueSave();
}

export function removeSlide(page: PptPage, button: HTMLElement): void {
  const { L } = page;
  const id = button.closest<HTMLElement>("[data-slide-id]")?.dataset.slideId;
  const slides = page.slidesFromEditor().filter((slide) => slide.id !== id);
  if (!slides.length) { page.showNote(L("ppt.slide.keep-one"), true); return; }
  showSlides(page, slides, slides[0]?.id || "");
  page.paintStatus(page.open());
  page.queueSave();
}

export async function presentDeck(page: PptPage): Promise<void> {
  const { s } = page;
  await page.save();
  const index = Math.max(0, (page.open().slides || []).findIndex((slide) => slide.id === s.slideKey));
  page.present(page.liveRecord(), index);
}
