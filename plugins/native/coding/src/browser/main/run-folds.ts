import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { CONTINUATION_MARKER, HISTORY_DIGEST_MARKER, HISTORY_DIGEST_TASK_HEAD, MENTIONS_MARKER } from "../../continuation.js";
import { MODEL_DIGEST_HEAD } from "../../history-digest.js";
import { el } from "../dom.js";
import type { Page } from "./page.js";
import type { TurnView } from "./shapes.js";

const MATERIAL_HEAD = "Untrusted context data.";

/** The one-line summary of a folded turn: its mark and its words. */
function summaryOf(icon: string, label: string): HTMLElement {
  const summary = el("summary");
  summary.innerHTML = `<svg aria-hidden="true"><use href="#icon-${icon}"></use></svg>`;
  summary.append(document.createTextNode(label));
  return summary;
}

/** What a continuation asks for, without the Host's closing sentence. */
export function continuationLine(text: string): string {
  return text.slice(CONTINUATION_MARKER.length).split("\n")[0]!.replace(/请从断点继续完成原任务。?$/, "").trim();
}

/** A round that started from the digest of earlier rounds shows the person's own request; the digest stays one click away. */
function foldDigest(_page: Page, node: HTMLElement, text: string, at: number) {
  const digest = text.slice(HISTORY_DIGEST_MARKER.length, at), own = text.slice(at + HISTORY_DIGEST_TASK_HEAD.length), count = (digest.match(/前 (\d+) 轮/) || [])[1] || "";
  node.classList.add("has-digest");
  node.replaceChildren();
  const details = el("details", "", "coding-digest");
  details.append(summaryOf("history", digest.includes(MODEL_DIGEST_HEAD) ? uiText.text("coding.digest.by-model", { count }) : uiText.text("coding.digest.by-host", { count })), el("pre", digest));
  node.append(details, el("div", own.startsWith(CONTINUATION_MARKER) ? uiText.text("coding.turn.continued", { line: continuationLine(own) }) : own, "coding-turn-own"));
}

/** Files named with @ were attached after the person's words; the words show, the attachments fold away. */
function foldMentions(_page: Page, node: HTMLElement, text: string) {
  const at = text.indexOf(MENTIONS_MARKER), attached = text.slice(at + MENTIONS_MARKER.length), folders = (attached.match(/^### .*（目录/gm) || []).length, count = (attached.match(/^### /gm) || []).length - folders;
  node.replaceChildren();
  const details = el("details", "", "coding-digest"), what = [count ? uiText.text("coding.turn.attached-files", { count }) : "", folders ? uiText.text("coding.turn.attached-folders", { count: folders }) : ""].filter(Boolean).join(uiText.text("coding.list.joiner"));
  details.append(summaryOf("paperclip", uiText.text("coding.turn.attached", { what })), el("pre", attached));
  node.append(el("div", text.slice(0, at), "coding-turn-own"), details);
}

/** Material the runtime handed the model arrives wrapped as reference data; it reads as one line naming the material. */
function foldMaterial(_page: Page, node: HTMLElement, text: string) {
  let name = uiText.text("coding.turn.material");
  try {
    const outer = JSON.parse(text.slice(text.indexOf("{")));
    name = JSON.parse(String(outer.text).split("\n")[0]).title || name;
  } catch {
    // The wrapped text is not a titled material: the line keeps the plain name.
  }
  node.classList.add("is-material");
  node.replaceChildren();
  const details = el("details", "", "coding-digest");
  details.append(summaryOf("paperclip", uiText.text("coding.turn.material-named", { name })), el("pre", text));
  node.append(details);
}

/** A continuation the Host composed reads as one line; the facts it handed the model stay one click away. */
function foldContinuation(_page: Page, node: HTMLElement, text: string) {
  const body = node.innerHTML;
  node.classList.add("is-continuation");
  node.innerHTML = "";
  const details = el("details"), facts = el("div", "", "coding-continuation-facts");
  facts.innerHTML = body;
  details.append(summaryOf("play", uiText.text("coding.turn.continued", { line: continuationLine(text) })), facts);
  node.append(details);
}

/** Draws the person's turn in the form it reads best in; a turn that carries nothing special is left as it was drawn. */
export function foldTurn(page: Page, node: HTMLElement, turn: TurnView) {
  if (turn.kind !== "user") return;
  const { text } = turn, digestAt = text.startsWith(HISTORY_DIGEST_MARKER) ? text.indexOf(HISTORY_DIGEST_TASK_HEAD) : -1;
  if (digestAt >= 0) foldDigest(page, node, text, digestAt);
  else if (text.includes(MENTIONS_MARKER) && !text.startsWith(CONTINUATION_MARKER)) foldMentions(page, node, text);
  else if (text.startsWith(MATERIAL_HEAD)) foldMaterial(page, node, text);
  else if (text.startsWith(CONTINUATION_MARKER)) foldContinuation(page, node, text);
}
