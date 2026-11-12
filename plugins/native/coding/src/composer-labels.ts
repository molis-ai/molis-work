import type { MwComposerAiLabels } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * Coding's words for the unified input (unified-input-voice K4): one set for the first screen (ui.ts, the Host's `p.text`) and the
 * page's `molisComposer` (browser, `host.translate`), so the two never say it differently. The keys are Coding's own
 * (`coding.composer.*` in messages.ts); `{name}` and the like stay in them for the composer to fill. The key glyphs follow the
 * platform: ⌘ on a Mac, Ctrl elsewhere.
 */
export function codingComposerLabels(readText: (key: string) => string, mac: boolean): MwComposerAiLabels {
  const keys = (text: string) => mac ? text : text.replace("⌘⇧↵", "Ctrl+Shift+↵").replace("⌘↵", "Ctrl+↵");
  return {
    input: readText("coding.composer.task-label"), send: readText("coding.composer.send"), sendTitle: keys(readText("coding.composer.send-title")), add: readText("coding.attach.title"),
    more: readText("coding.composer.more"), files: readText("coding.composer.files"), filesHint: readText("coding.composer.files-hint"), dropRefused: readText("coding.composer.drop-refused"),
    commands: readText("coding.slash.label"), adding: readText("coding.composer.adding"), searching: readText("coding.composer.searching"), nothing: readText("coding.composer.nothing"), unavailable: readText("coding.composer.unavailable"),
    reading: readText("coding.composer.reading"), remove: readText("coding.composer.remove"), retryFile: readText("coding.composer.retry-file"), blocked: readText("coding.composer.blocked"),
    restored: readText("coding.composer.restored"), clear: readText("coding.composer.clear"), unsaved: readText("coding.composer.draft-unsaved-short"),
    enterHint: readText("coding.composer.enter-hint"), enterHintDismiss: readText("coding.composer.enter-hint-dismiss"), notice: readText("coding.composer.notice"),
    sending: readText("coding.composer.sending-caption"), sendingText: readText("coding.composer.sending"), failed: readText("coding.composer.failed"), retry: readText("coding.composer.retry"),
    unknown: readText("coding.composer.unknown"), unknownText: readText("coding.composer.unknown-text"), check: readText("coding.composer.check"), notSent: readText("coding.composer.not-sent"),
    to: readText("coding.composer.to"), stop: readText("coding.run.stop"), stopTitle: readText("coding.run.stop-title"), delivery: readText("coding.send-mode.label"), deliveryGroup: readText("coding.send-mode.group"),
    modes: {
      "next-boundary": { name: readText("coding.send-mode.next-boundary"), title: keys(readText("coding.send-mode.next-boundary-title")), description: readText("coding.send-mode.next-boundary-hint") },
      interrupt: { name: readText("coding.send-mode.interrupt"), title: readText("coding.send-mode.interrupt"), description: readText("coding.send-mode.interrupt-hint") },
      "after-run": { name: readText("coding.send-mode.after-run"), title: keys(readText("coding.send-mode.after-run-title")), description: readText("coding.send-mode.after-run-hint") },
    },
    unsupported: readText("coding.send-mode.unsupported"), running: readText("coding.composer.running"), runningText: readText("coding.composer.running-text"),
    queued: readText("coding.sent.just-ended"), replayed: readText("coding.sent.again"),
  };
}

/** The ways of working, in the bar's order, with their words (and, for writing and running, the words while they are not there yet). */
const INTENT_WORDS: readonly (readonly [string, string, string?])[] = [
  ["discuss", "coding.intent.discuss"], ["plan", "coding.intent.plan"], ["collaborate", "coding.intent.collaborate"], ["parallel", "coding.intent.parallel"],
  ["edit", "coding.intent.edit", "coding.intent.edit-pending"], ["execute", "coding.intent.execute", "coding.intent.execute-pending"], ["review", "coding.intent.review"],
];

/**
 * The ways of working as the bar's select lists them: one this session's runtime has no role for (`offered` false) is listed and
 * cannot be chosen, writing and running saying they are not there yet. The first screen offers what every runtime has.
 */
export function codingIntentOptions(readText: (key: string) => string, offered: (intent: string) => boolean): { value: string; label: string; disabled?: boolean }[] {
  return INTENT_WORDS.map(([value, word, pending]) => {
    const on = offered(value);
    return { value, label: readText(!on && pending ? pending : word), ...(on ? {} : { disabled: true }) };
  });
}
