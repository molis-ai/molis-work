import { UI_LANGUAGES } from "@molis-ai/molis-work-contracts/platform/ui";
import { createTextReader } from "@molis-ai/molis-work-plugin-sdk/ui";
import { installLanguageText } from "../language-text.js";
import { planLocaleText } from "../locale-switch.js";
import { frameTextFragment, type FrameLanguage, type FrameLanguageUpdate } from "./language.js";

/** The frame prepares from the two parent representations. Its live controls and storage never enter the parent or get replaced. */
export function frameLanguage(initial: FrameLanguage) {
  let displayed = initial, latest = 0;
  let prepared: { turn: number; use(): void } | undefined;
  const context = installLanguageText(initial.locale, initial.packs);
  const select = (next: FrameLanguage) => {
    const language = UI_LANGUAGES.find(row => row.tag === next.locale);
    if (!language || next.owner !== initial.owner) throw new Error("View language owner does not match");
    context.select(next.locale, next.packs);
    document.documentElement.lang = language.html_lang;
    document.documentElement.dir = language.direction;
  };
  select(initial);
  return (message: FrameLanguageUpdate, reply?: MessagePort) => {
    if (message.language !== "prepare") {
      if (!prepared || prepared.turn !== message.turn) return;
      const update = prepared; prepared = undefined;
      if (message.language === "apply") update.use();
      return;
    }
    if (!reply) return;
    try {
      if (message.turn <= latest || message.text.owner !== initial.owner || !UI_LANGUAGES.some(row => row.tag === message.text.locale)) {
        reply.postMessage(false); return;
      }
      latest = message.turn; prepared = undefined;
      const old = frameTextFragment(message.before), next = frameTextFragment(message.after);
      const reader = createTextReader({ locale: message.text.locale, packs: message.text.packs });
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
