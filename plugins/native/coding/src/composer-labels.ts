import type { MwComposerAiLabels } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * Coding's words for the unified input (unified-input-voice K4): one set for the first screen (ui.ts, the Host's `p.text`) and the
 * page's `molisComposer` (browser, `host.translate`), so the two never say it differently. The keys are Coding's own
 * (`coding.composer.*` in messages.ts); `{name}` and the like stay in them for the composer to fill. The key glyphs follow the
 * platform: ⌘ on a Mac, Ctrl elsewhere.
 */
export function codingComposerLabels(L: (key: string) => string, mac: boolean): MwComposerAiLabels {
  const keys = (text: string) => mac ? text : text.replace("⌘⇧↵", "Ctrl+Shift+↵").replace("⌘↵", "Ctrl+↵");
  return {
    input: L("coding.composer.task-label"), send: L("coding.composer.send"), sendTitle: keys(L("coding.composer.send-title")), add: L("coding.attach.title"),
    more: L("coding.composer.more"), files: L("coding.composer.files"), filesHint: L("coding.composer.files-hint"), dropRefused: L("coding.composer.drop-refused"),
    commands: L("coding.slash.label"), adding: L("coding.composer.adding"), searching: L("coding.composer.searching"), nothing: L("coding.composer.nothing"), unavailable: L("coding.composer.unavailable"),
    reading: L("coding.composer.reading"), remove: L("coding.composer.remove"), retryFile: L("coding.composer.retry-file"), blocked: L("coding.composer.blocked"),
    restored: L("coding.composer.restored"), clear: L("coding.composer.clear"), unsaved: L("coding.composer.draft-unsaved-short"),
    enterHint: L("coding.composer.enter-hint"), enterHintDismiss: L("coding.composer.enter-hint-dismiss"), notice: L("coding.composer.notice"),
    sending: L("coding.composer.sending-caption"), sendingText: L("coding.composer.sending"), failed: L("coding.composer.failed"), retry: L("coding.composer.retry"),
    unknown: L("coding.composer.unknown"), unknownText: L("coding.composer.unknown-text"), check: L("coding.composer.check"), notSent: L("coding.composer.not-sent"),
    to: L("coding.composer.to"), stop: L("coding.run.stop"), stopTitle: L("coding.run.stop-title"), delivery: L("coding.send-mode.label"), deliveryGroup: L("coding.send-mode.group"),
    modes: {
      "next-boundary": { name: L("coding.send-mode.next-boundary"), title: keys(L("coding.send-mode.next-boundary-title")), description: L("coding.send-mode.next-boundary-hint") },
      interrupt: { name: L("coding.send-mode.interrupt"), title: L("coding.send-mode.interrupt"), description: L("coding.send-mode.interrupt-hint") },
      "after-run": { name: L("coding.send-mode.after-run"), title: keys(L("coding.send-mode.after-run-title")), description: L("coding.send-mode.after-run-hint") },
    },
    unsupported: L("coding.send-mode.unsupported"), running: L("coding.composer.running"), runningText: L("coding.composer.running-text"),
    queued: L("coding.sent.just-ended"), replayed: L("coding.sent.again"),
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
export function codingIntentOptions(L: (key: string) => string, offered: (intent: string) => boolean): { value: string; label: string; disabled?: boolean }[] {
  return INTENT_WORDS.map(([value, word, pending]) => {
    const on = offered(value);
    return { value, label: L(!on && pending ? pending : word), ...(on ? {} : { disabled: true }) };
  });
}
