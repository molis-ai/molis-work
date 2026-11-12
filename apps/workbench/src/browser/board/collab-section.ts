/**
 * The program of the board's 协作零件 section (apps/workbench/src/collab-specimens.ts), a proposal for review. The specimens
 * answer: a check counts when it has evidence, a topic switches, the Assistant's line changes, an answer folds the card to one
 * line (and comes back), and sending waits until every platform is reviewed. Words the program rebuilds come from the board's
 * translation channel (`#collab-words`, as `platform-area-words` does).
 */
const root = document.getElementById("collab");
const t = globalThis.t.text;
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
  button.setAttribute("aria-label", t(on ? "workbench.collab-specimens.title-verified-tap-to-uncheck" : "workbench.collab-specimens.title-check-it-once-verified", { title }));
  row.dataset.state = on ? "done" : "open";
  countRequirements(reqs);
}

function chooseTopic(topic: HTMLElement, scope: HTMLElement): void {
  nodes(scope, ".mw-topic").forEach((chip) => chip.setAttribute("aria-pressed", String(chip === topic)));
  topic.removeAttribute("data-unread");
  topic.querySelector(".mw-sr-only")?.remove();
  const status = scope.querySelector<HTMLElement>("[data-topic-status]"), to = scope.querySelector("[data-topic-to]");
  if (status) { status.textContent = topic.dataset.status ?? ""; status.dataset.tone = topic.dataset.tone ?? ""; }
  if (to) to.textContent = t("workbench.collab-section.to-name", { name: String(topic.firstChild?.textContent ?? "") });
}

function answer(card: HTMLElement, said: string | null): void {
  const result = card.querySelector<HTMLElement>("[data-brought-result]"), line = card.querySelector("[data-brought-said]");
  const fold = card.querySelector<HTMLElement>(".mw-brought__fold");
  if (!result || !line) return;
  if (said !== null) {
    // The focus goes to the visible result before the body folds away and leaves the tab order.
    line.textContent = said;
    result.hidden = false;
    result.querySelector("button")?.focus();
    card.toggleAttribute("data-answered", true);
    if (fold) fold.inert = true;
  } else {
    // Taking it back releases the fold before the answers are reached again.
    if (fold) fold.inert = false;
    card.removeAttribute("data-answered");
    result.hidden = true;
    card.querySelector<HTMLElement>("[data-answer]")?.focus();
  }
}

function review(button: HTMLElement): void {
  const box = button.closest<HTMLElement>("[data-collab-review]");
  if (!box || pressed(button)) return;
  button.setAttribute("aria-pressed", "true");
  const label = button.querySelector("[data-slot=button-label]");
  if (label) label.textContent = t("workbench.collab-section.reviewed");
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
  // The Assistant preparing: one line that changes, never a spinner; still when motion is reduced. The interval is
  // symmetric: a re-run clears the one before it, and a removed root or a hidden page stops it.
  const holder = document.documentElement;
  const previous = Number(holder.dataset.collabPreparingTimer || 0);
  if (previous) clearInterval(previous);
  let line = root.querySelector<HTMLElement>("[data-preparing-line]");
  if (line && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const LINES = [t("workbench.collab-section.read-zhe-s-document"), t("workbench.collab-section.checked-the-ready-capabilities"), t("workbench.collab-section.drew-a-first-plugin-sketch")];
    let at = 0, timer = 0;
    const stop = () => { if (timer) { clearInterval(timer); timer = 0; } delete holder.dataset.collabPreparingTimer; };
    timer = window.setInterval(() => {
      if (!line || !line.isConnected) { stop(); return; }
      at = (at + 1) % LINES.length;
      const next = line.cloneNode(false) as HTMLElement;
      next.textContent = LINES[at] ?? "";
      line.replaceWith(next);
      line = next;
    }, 1800);
    holder.dataset.collabPreparingTimer = String(timer);
    window.addEventListener("pagehide", stop, { once: true });
  }
}
