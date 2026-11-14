/// <reference lib="dom" />
// The board's design-language chapter (`primitives/catalog-language.ts`): the index's find field, the measured contrast of each
// ink on each surface, and the three motion specimens that go through `molisCraft`. Presentation only.
type Craft = { turn(node: Element, back?: boolean): void; ask(node: Element): void; carry(from: Element, change: () => unknown): unknown };
const craft = () => (globalThis as typeof globalThis & { molisCraft?: Partial<Craft> }).molisCraft;
const all = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = document) => [...scope.querySelectorAll<T>(selector)];

/** Any CSS colour as the three channels the screen shows: one pixel is painted with it and read back. */
function channels(context: CanvasRenderingContext2D, colour: string): [number, number, number] {
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = "#000";
  context.fillStyle = colour;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return [red!, green!, blue!];
}
const luminance = (rgb: [number, number, number]) => rgb
  .map(value => value / 255).map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index]!, 0);

/** Each cell says what it measures now, so a theme, a skin or a changed token is checked by looking at the board. */
function measureContrast(): void {
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!context) return;
  for (const cell of all("[data-lang-contrast]")) {
    const style = getComputedStyle(cell);
    const [light, dark] = [luminance(channels(context, style.color)), luminance(channels(context, style.backgroundColor))].sort((a, b) => b - a);
    const ratio = (light! + .05) / (dark! + .05);
    cell.querySelector("small")!.textContent = ratio.toFixed(1) + " : 1";
    cell.toggleAttribute("data-lang-low", ratio < 4.5);
  }
}

/** The find field narrows the index to the names that hold what was typed; a chapter with nothing left steps aside. */
function wireFind(): void {
  const field = document.querySelector<HTMLInputElement>("[data-catalog-find]");
  const index = field?.closest("[data-catalog-index]");
  if (!field || !index) return;
  const apply = () => {
    const wanted = field.value.trim().toLowerCase();
    let shown = 0, heading: HTMLElement | undefined, inGroup = 0;
    const close = () => { if (heading) heading.hidden = inGroup === 0; };
    for (const node of all(":scope > a, :scope > [data-catalog-group]", index)) {
      if (node.hasAttribute("data-catalog-group")) { close(); heading = node; inGroup = 0; continue; }
      const hit = !wanted || [node.textContent, node.getAttribute("title"), node.getAttribute("href")].some(text => text?.toLowerCase().includes(wanted));
      node.hidden = !hit;
      if (hit) { shown += 1; inGroup += 1; }
    }
    close();
    const none = index.querySelector<HTMLElement>("[data-catalog-none]");
    if (none) none.hidden = shown > 0;
  };
  field.addEventListener("input", apply);
  field.addEventListener("keydown", event => {
    if (event.key === "Enter") index.querySelector<HTMLElement>(":scope > a:not([hidden])")?.click();
    if (event.key === "Escape" && field.value) { field.value = ""; apply(); }
  });
}

function wireMotion(): void {
  let page = 1, asked: ReturnType<typeof setTimeout> | undefined;
  document.addEventListener("click", event => {
    const origin = event.target as Element;
    const demo = origin.closest<HTMLElement>("[data-lang-demo]")?.dataset.langDemo;
    if (demo === "ask") {
      const node = document.querySelector("[data-lang-ask]");
      if (!node) return;
      const show = (state: string) => all("[data-lang-ask-state]", node).forEach(mark => { mark.hidden = mark.dataset.langAskState !== state; });
      show("attention");
      craft()?.ask?.(node);
      clearTimeout(asked);
      asked = setTimeout(() => show("progress"), 3200);
    }
    if (demo === "forward" || demo === "back") {
      const node = document.querySelector<HTMLElement>("[data-lang-page]");
      if (!node) return;
      page = Math.max(1, page + (demo === "back" ? -1 : 1));
      node.textContent = (node.dataset.pageTemplate || "Page {page}").replace("{page}", String(page));
      craft()?.turn?.(node, demo === "back");
    }
    const stage = origin.closest<HTMLElement>("[data-lang-carry]");
    const open = origin.closest<HTMLElement>("[data-lang-carry-open]"), back = origin.closest("[data-lang-carry-back]");
    if (!stage || !open && !back) return;
    const list = stage.querySelector<HTMLElement>("ul")!, detail = stage.querySelector<HTMLElement>("article")!;
    const title = detail.querySelector<HTMLElement>("[data-lang-carry-title]")!;
    const carried = () => all("[data-craft-carried]", stage).forEach(node => node.removeAttribute("data-craft-carried"));
    const carry = (from: Element, change: () => void) => craft()?.carry ? craft()!.carry!(from, change) : change();
    if (open) carry(open, () => {
      carried(); stage.dataset.langCarryFrom = String(all("[data-lang-carry-open]", stage).indexOf(open));
      title.textContent = open.textContent; title.setAttribute("data-craft-carried", "");
      list.hidden = true; detail.hidden = false;
    });
    else carry(title, () => {
      carried(); all("[data-lang-carry-open]", stage)[Number(stage.dataset.langCarryFrom ?? 0)]?.setAttribute("data-craft-carried", "");
      detail.hidden = true; list.hidden = false;
    });
  });
}

/** Called once by the board script, after the board is on the page. */
export function wireCatalogLanguage(): void {
  wireFind();
  wireMotion();
  measureContrast();
  // A theme or skin switch changes what the cells measure.
  new MutationObserver(() => requestAnimationFrame(measureContrast))
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-resolved-theme", "data-skin", "style", "class"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => requestAnimationFrame(measureContrast));
}
