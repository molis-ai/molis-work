import type { MwComposerAiLabels } from "@molis-ai/molis-work-plugin-sdk/ui";

/** Shared by the Dock's first paint and the mounted composer. The browser serializes this function. */
export function assistantComposerLabels(readText: (key: string) => string, mac: boolean): MwComposerAiLabels {
  const keys = (text: string) => mac ? text : text.replace("⌘⇧↵", "Ctrl+Shift+↵").replace("⌘↵", "Ctrl+↵");
  return {
    input: readText("workbench.assistant-dock.send-assistant"), send: readText("workbench.assistant-dock.send"), sendTitle: keys(readText("workbench.catalog-composer.send")), add: readText("workbench.assistant-dock.add-file-reference-capability"), more: readText("workbench.context-toolbar.more"),
    files: readText("workbench.assistant-composer.add-file-picture"), filesHint: readText("workbench.assistant-composer.drop-paste"), dropRefused: readText("workbench.catalog-composer.only-files-can-be-dropped-here"), commands: readText("workbench.assistant-composer.use-method-capability-start-like"),
    searching: readText("workbench.catalog-composer.searching"), nothing: readText("workbench.agent-question-card.no-matches"), unavailable: readText("workbench.catalog-composer.name-cannot-be-used-right-now"), reading: readText("workbench.assistant-context-strip.reading"), remove: readText("workbench.catalog-composer.remove-name"), retryFile: readText("workbench.catalog-composer.retry-name"),
    blocked: readText("workbench.catalog-composer.remove-the-item-that-cannot-be-attached-then"), restored: readText("workbench.catalog-composer.restored-your-unsent-draft-time"), clear: readText("workbench.catalog-composer.clear-draft"), unsaved: readText("workbench.assistant-composer-labels.the-draft-could-not-be-saved-your-words"),
    enterHint: readText("workbench.catalog-composer.return-now-starts-a-new-line-to-send"), enterHintDismiss: readText("workbench.assistant-notice.dismiss"), notice: readText("workbench.catalog-composer.note"), sending: readText("workbench.catalog-composer.sending-2"), sendingText: readText("workbench.catalog-composer.sending"),
    failed: readText("workbench.catalog-composer.not-sent"), retry: readText("common.control.retry"), unknown: readText("workbench.catalog-compose.pending-confirmation"), unknownText: readText("workbench.catalog-composer.could-not-confirm-it-arrived-don-t-send"), check: readText("workbench.catalog-composer.check"),
    notSent: readText("workbench.catalog-composer.checked-it-did-not-arrive-your-text-is"),
    to: readText("workbench.catalog-composer.send-to"), stop: readText("workbench.attention.stop"), stopTitle: readText("workbench.catalog-composer.stop-this-turn"), delivery: readText("workbench.catalog-composer.choose-how-it-is-delivered"), deliveryGroup: readText("workbench.catalog-composer.how-it-is-delivered"),
    modes: {
      "next-boundary": { name: readText("workbench.composer.next-boundary"), title: keys(readText("workbench.catalog-composer.add")), description: readText("workbench.catalog-composer.read-once-the-current-reply-or-tool") },
      interrupt: { name: readText("workbench.catalog-composer.interrupt-and-redirect"), title: readText("workbench.catalog-composer.interrupt-and-redirect"), description: readText("workbench.catalog-composer.drops-the-reply-in-progress-and-follows-this") },
      "after-run": { name: readText("workbench.catalog-composer.do-it-next-turn"), title: keys(readText("workbench.catalog-composer.do-it-next-turn-2")), description: readText("workbench.catalog-composer.waits-for-the-start-of-the-next") },
    },
    unsupported: readText("workbench.assistant-composer-labels.this-work-does-not-take-that-way-of"), running: readText("workbench.settings-plugins.running"), runningText: readText("workbench.catalog-composer.working-on-this-turn-a-new-message"),
    // Queued is both a send after the turn ended and one put off on purpose (⌘⇧↵): the words say what is true of both.
    queued: readText("workbench.assistant-send.saved-takes-effect-next-turn"), replayed: readText("workbench.catalog-composer.this-was-already-sent-it-was-not-sent"),
  };
}
