import { cutCharacters, exceedsCharacters } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { IMAGES_INPUT_LIMITS } from "../limits.js";
import type { ImagesPage } from "./types.js";

const uiText = globalThis.t;

type LimitedField = HTMLInputElement | HTMLTextAreaElement;
interface Limit { readonly field: LimitedField; readonly max: number; readonly name: string; readonly note: string }

const count = (text: string) => [...text].length;

/**
 * The five texts the service bounds, with the service's own limits (BL-985). The page counts as the service does: characters
 * (an emoji is one) of the trimmed text. HTML `maxlength` counts UTF-16 units, so it let a size or ratio past the service's 64
 * and 32 and stopped a prompt of emoji at half its 32,000; these fields have none, and the page keeps them in bounds itself.
 */
function limitsOf(page: ImagesPage): Limit[] {
  const { el } = page, compose = "[data-images-note]", dialog = "[data-images-connection-note]";
  return [
    { field: el.prompt, max: IMAGES_INPUT_LIMITS.prompt, name: uiText.text("images.limit.prompt"), note: compose },
    { field: el.size, max: IMAGES_INPUT_LIMITS.size, name: uiText.text("images.limit.size"), note: compose },
    { field: el.ratio, max: IMAGES_INPUT_LIMITS.aspect_ratio, name: uiText.text("images.limit.ratio"), note: compose },
    { field: el.connectionName, max: IMAGES_INPUT_LIMITS.connection_name, name: uiText.text("images.service.name"), note: dialog },
    { field: el.connectionModel, max: IMAGES_INPUT_LIMITS.model, name: uiText.text("images.service.model-name"), note: dialog },
  ];
}

function alignCaret(text: string, index: number): number {
  let at = Math.max(0, Math.min(index, text.length));
  if (at > 0 && at < text.length) {
    const prev = text.charCodeAt(at - 1);
    const next = text.charCodeAt(at);
    if (prev >= 0xd800 && prev <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      at += 1;
    }
  }
  return at;
}

/**
 * Keeps a field within its limit the way `maxlength` does, by characters: what was typed or pasted last (the characters just
 * before the caret) is left out, whole, until the trimmed text fits. Text after the caret stays. Whether anything was cut.
 */
function cutToLimit({ field, max }: Limit): boolean {
  const value = field.value;
  if (!exceedsCharacters(value.trim(), max)) return false;
  const caret = alignCaret(value, field.selectionEnd ?? value.length);
  const head = value.slice(0, caret);
  const tail = value.slice(caret);
  const trimmedTail = tail.trim();
  if (trimmedTail.length > 0 && exceedsCharacters(trimmedTail, max)) {
    // Only the text after the caret is already too long (set by the page, not typed): keep its first characters.
    field.value = cutCharacters(value.trim(), max);
    return true;
  }
  const headLeading = head.length - head.trimStart().length;
  const headPrefix = head.slice(0, headLeading);
  const body = head.slice(headLeading);
  let kept: string;
  if (trimmedTail.length > 0) {
    const tailEndCount = count(tail.trimEnd());
    kept = tailEndCount >= max ? headPrefix : headPrefix + cutCharacters(body, max - tailEndCount);
  } else {
    kept = max <= 0 ? "" : headPrefix + cutCharacters(body, max);
  }
  field.value = kept + tail;
  field.setSelectionRange(kept.length, kept.length);
  return true;
}

/** Marks a field the page filled (a saved draft, an earlier job, a saved service) that is past its limit, so submitting stops there and says why. */
function markOver({ field, max, name }: Limit): boolean {
  // A hidden field (the ratio for a service that takes a size, say) is not sent, and the form could not point at it.
  const over = !field.closest("[hidden]") && exceedsCharacters(field.value.trim(), max);
  field.setCustomValidity(over ? uiText.text("images.limit.over", { field: name, max, count: count(field.value.trim()) }) : "");
  return over;
}

/** Checks every field before a submission: the form's own `reportValidity` then shows the first one that is too long. */
export function checkLimits(page: ImagesPage): void {
  for (const limit of limitsOf(page)) markOver(limit);
}

export function installLimits(page: ImagesPage): void {
  for (const limit of limitsOf(page)) {
    const { field, max, name, note } = limit;
    let said = "";
    const keep = () => {
      if (cutToLimit(limit)) {
        said = uiText.text("images.limit.cut", { field: name, max });
        page.say(said, false, note);
      } else if (said && page.root.querySelector(note)?.textContent === said) {
        page.say("", false, note);
        said = "";
      }
      markOver(limit);
    };
    // While an input method is composing, the text is not final: it is kept in bounds once the composition ends.
    page.life.listen(field, "input", (event) => { if (!(event as InputEvent).isComposing) keep(); });
    page.life.listen(field, "compositionend", () => {
      const before = field.value;
      keep();
      // Some browsers send no input after the composition ends: the draft and the buttons hear of the cut text all the same.
      if (field.value !== before) field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
}
