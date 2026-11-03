/**
 * The board's 协作零件 section and its palette switch (apps/workbench/src/collab-specimens.ts, board-palettes.ts), both
 * proposals for review. The specimens answer: a check counts when it has evidence, a topic switches, the Assistant's line
 * changes, an answer folds the card to one line (and comes back), and sending waits until every platform is reviewed. The
 * palette switch restates the shell tokens on the page and keeps the choice in the address.
 */
const root = document.getElementById("collab");
const pressed = (node: Element) => node.getAttribute("aria-pressed") === "true";
const nodes = <T extends Element = HTMLElement>(scope: ParentNode, selector: string) => [...scope.querySelectorAll<T>(selector)];

function countRequirements(reqs: HTMLElement): void {
  const checks = nodes(reqs, ".mw-req__check"), done = checks.filter(pressed).length;
  const count = reqs.querySelector("[data-reqs-count]");
  if (count) count.textContent = `${done}/${checks.length}`;
  nodes(reqs, ".mw-reqs__bars i").forEach((bar, index) => bar.toggleAttribute("data-on", index < done));
}

function check(button: HTMLButtonElement): void {
  const row = button.closest<HTMLElement>(".mw-req"), reqs = button.closest<HTMLElement>("[data-collab-reqs]");
  if (!row || !reqs) return;
  const on = !pressed(button), title = row.querySelector(".mw-req__title")?.textContent ?? "";
  button.setAttribute("aria-pressed", String(on));
  button.setAttribute("aria-label", `${title}：${on ? "已验过，点一下取消" : "验过就勾上"}`);
  row.dataset.state = on ? "done" : "open";
  countRequirements(reqs);
}

function chooseTopic(topic: HTMLElement, scope: HTMLElement): void {
  nodes(scope, ".mw-topic").forEach((chip) => chip.setAttribute("aria-pressed", String(chip === topic)));
  topic.removeAttribute("data-unread");
  topic.querySelector(".mw-sr-only")?.remove();
  const status = scope.querySelector<HTMLElement>("[data-topic-status]"), to = scope.querySelector("[data-topic-to]");
  if (status) { status.textContent = topic.dataset.status ?? ""; status.dataset.tone = topic.dataset.tone ?? ""; }
  if (to) to.textContent = `发到 ${topic.firstChild?.textContent ?? ""}`;
}

function answer(card: HTMLElement, said: string | null): void {
  const result = card.querySelector<HTMLElement>("[data-brought-result]"), line = card.querySelector("[data-brought-said]");
  if (!result || !line) return;
  card.toggleAttribute("data-answered", said !== null);
  result.hidden = said === null;
  if (said !== null) { line.textContent = said; result.querySelector("button")?.focus(); }
  else card.querySelector<HTMLElement>("[data-answer]")?.focus();
}

function review(button: HTMLElement): void {
  const box = button.closest<HTMLElement>("[data-collab-review]");
  if (!box || pressed(button)) return;
  button.setAttribute("aria-pressed", "true");
  const label = button.querySelector("[data-slot=button-label]");
  if (label) label.textContent = "已过目";
  const looks = nodes(box, "[data-review]"), seen = looks.filter(pressed).length;
  const count = box.querySelector("[data-review-count]"), send = box.querySelector<HTMLButtonElement>("[data-review-send]");
  if (count) count.textContent = `${seen}/${looks.length}`;
  if (send) send.disabled = seen < looks.length;
}

if (root) {
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const box = target.closest<HTMLButtonElement>(".mw-req__check");
    if (box && !box.disabled) { check(box); return; }
    const topic = target.closest<HTMLElement>(".mw-topic"), topics = topic?.closest<HTMLElement>("[data-collab-topics]");
    if (topic && topics) { chooseTopic(topic, topics); return; }
    const card = target.closest<HTMLElement>("[data-collab-brought]");
    const said = target.closest<HTMLElement>("[data-answer]");
    if (card && said) { answer(card, said.dataset.answer ?? ""); return; }
    if (card && target.closest("[data-brought-undo]")) { answer(card, null); return; }
    const look = target.closest<HTMLElement>("[data-review]");
    if (look) review(look);
  });
  // The Assistant preparing: one line that changes, never a spinner; still when motion is reduced.
  const LINES = ["读了阿哲的文档", "查了现成的能力", "画好一版插件草图"];
  let line = root.querySelector<HTMLElement>("[data-preparing-line]"), at = 0;
  if (line && !matchMedia("(prefers-reduced-motion: reduce)").matches) setInterval(() => {
    if (!line) return;
    at = (at + 1) % LINES.length;
    const next = line.cloneNode(false) as HTMLElement;
    next.textContent = LINES[at] ?? "";
    line.replaceWith(next);
    line = next;
  }, 1800);
}

const marks = (option: HTMLElement) => {
  const group = option.closest("[data-board-palettes]");
  if (!group) return;
  nodes(group, "[data-board-palette-option]").forEach((node) => {
    const on = node === option;
    node.classList.toggle("is-current", on);
    node.setAttribute("aria-pressed", String(on));
  });
};
const applied = document.querySelector<HTMLElement>(`[data-board-palette-option="${document.documentElement.dataset.boardPalette ?? "current"}"]`);
if (applied) marks(applied);
document.addEventListener("click", (event) => {
  const option = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-board-palette-option]") : null;
  if (!option) return;
  const id = option.dataset.boardPaletteOption ?? "current", url = new URL(location.href);
  if (id === "current") { delete document.documentElement.dataset.boardPalette; url.searchParams.delete("palette"); }
  else { document.documentElement.dataset.boardPalette = id; url.searchParams.set("palette", id); }
  history.replaceState(null, "", url.href);
  marks(option);
});
