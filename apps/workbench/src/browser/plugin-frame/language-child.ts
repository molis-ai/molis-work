import { createTextReader, isFrameUiLanguage } from "@molis-ai/molis-work-plugin-sdk/ui";
import { installLanguageText } from "../language-text.js";
import { planLocaleText } from "../locale-switch.js";
import { frameTextFragment, type FrameLanguage, type FrameLanguageUpdate } from "./language.js";

/** The frame prepares from the two parent representations. Its live controls and storage never enter the parent or get replaced. */
export function frameLanguage(initial: FrameLanguage) {
  let displayed = initial, latest = 0;
  let prepared: { turn: number; use(): void } | undefined;
  if (!isFrameUiLanguage(initial.language)) throw new Error("View language is invalid");
  const intl = (text: FrameLanguage) => (tag: string) => tag === text.language.tag ? text.language.intl : undefined;
  const context = installLanguageText(initial.language.tag, initial.packs, intl(initial));
  const select = (next: FrameLanguage) => {
    const { language } = next;
    if (!isFrameUiLanguage(language) || next.owner !== initial.owner) throw new Error("View language owner does not match");
    context.select(language.tag, next.packs, intl(next));
    document.documentElement.lang = language.html_lang;
    document.documentElement.dir = language.direction;
  };
  if (initial.opening) {
    const { before, after } = initial.opening;
    const plan = planLocaleText({ root: document.body, old: frameTextFragment(before).content, next: frameTextFragment(after).content,
      produced: context.produced, retext: () => "" });
    plan.apply(() => select(initial), () => {});
  } else select(initial);
  return (message: FrameLanguageUpdate, reply?: MessagePort) => {
    if (message.language !== "prepare") {
      if (!prepared || prepared.turn !== message.turn) return;
      const update = prepared; prepared = undefined;
      if (message.language === "apply") update.use();
      return;
    }
    if (!reply) return;
    try {
      if (message.turn <= latest || message.text.owner !== initial.owner || !isFrameUiLanguage(message.text.language)) {
        reply.postMessage(false); return;
      }
      latest = message.turn; prepared = undefined;
      const old = frameTextFragment(message.before), next = frameTextFragment(message.after);
      const reader = createTextReader({ locale: message.text.language.tag, packs: message.text.packs, intlLocale: intl(message.text) });
      const plan = planLocaleText({ root: document.body, old: old.content, next: next.content, produced: context.produced, retext: reader.text });
      prepared = { turn: message.turn, use() {
        plan.apply(() => select(message.text), () => select(displayed));
        displayed = message.text;
      } };
      reply.postMessage(true);
    } catch { reply.postMessage(false); }
    finally { reply.close(); }
  };
}
