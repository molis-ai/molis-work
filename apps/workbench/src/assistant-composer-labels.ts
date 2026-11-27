import type { MwComposerAiLabels } from "@molis-ai/molis-work-plugin-sdk/ui";

/** Shared by the Dock's first paint and the mounted composer. The browser serializes this function. */
export function assistantComposerLabels(readText: (key: string) => string, mac: boolean): MwComposerAiLabels {
  const keys = (text: string) => mac ? text : text.replace("⌘⇧↵", "Ctrl+Shift+↵").replace("⌘↵", "Ctrl+↵");
  return {
    input: readText("workbench.assistant-dock.send-assistant"), send: readText("workbench.assistant-dock.send"), sendTitle: keys(readText("workbench.composer.send")), add: readText("workbench.assistant-dock.add-file-reference-capability"), more: readText("workbench.context-toolbar.more"),
    files: readText("workbench.assistant-composer.add-file-picture"), filesHint: readText("workbench.assistant-composer.drop-paste"), dropRefused: readText("workbench.composer.only-files-can-be-dropped-here"), commands: readText("workbench.assistant-composer.use-method-capability-start-like"),
    searching: readText("workbench.composer.searching"), nothing: readText("workbench.agent-question-card.no-matches"), unavailable: readText("workbench.composer.name-cannot-be-used-right-now"), reading: readText("workbench.assistant-context-strip.reading"), remove: readText("workbench.composer.remove-name"), retryFile: readText("workbench.composer.retry-name"),
    blocked: readText("workbench.composer.remove-the-item-that-cannot-be-attached-then"), restored: readText("workbench.composer.restored-your-unsent-draft-time"), clear: readText("workbench.composer.clear-draft"), unsaved: readText("workbench.assistant-composer-labels.the-draft-could-not-be-saved-your-words"),
    notice: readText("workbench.composer.note"), sending: readText("workbench.composer.sending-2"), sendingText: readText("workbench.composer.sending"),
    failed: readText("workbench.composer.not-sent"), retry: readText("common.control.retry"), unknown: readText("workbench.composer.pending-confirmation"), unknownText: readText("workbench.composer.could-not-confirm-it-arrived-don-t-send"), check: readText("workbench.composer.check"),
    notSent: readText("workbench.composer.checked-it-did-not-arrive-your-text-is"),
    to: readText("workbench.composer.send-to"), stop: readText("workbench.attention.stop"), stopTitle: readText("workbench.composer.stop-this-turn"), delivery: readText("workbench.composer.choose-how-it-is-delivered"), deliveryGroup: readText("workbench.composer.how-it-is-delivered"),
    modes: {
      "next-boundary": { name: readText("workbench.composer.next-boundary"), title: keys(readText("workbench.composer.add")), description: readText("workbench.composer.read-once-the-current-reply-or-tool") },
      interrupt: { name: readText("workbench.composer.interrupt-and-redirect"), title: readText("workbench.composer.interrupt-and-redirect"), description: readText("workbench.composer.drops-the-reply-in-progress-and-follows-this") },
      "after-run": { name: readText("workbench.composer.do-it-next-turn"), title: keys(readText("workbench.composer.do-it-next-turn-2")), description: readText("workbench.composer.waits-for-the-start-of-the-next") },
    },
    unsupported: readText("workbench.assistant-composer-labels.this-work-does-not-take-that-way-of"), running: readText("workbench.settings-plugins.running"), runningText: readText("workbench.composer.working-on-this-turn-a-new-message"),
    // Queued is both a send after the turn ended and one put off on purpose (⌘⇧↵): the words say what is true of both.
    queued: readText("workbench.assistant-send.saved-takes-effect-next-turn"), replayed: readText("workbench.composer.this-was-already-sent-it-was-not-sent"),
  };
}
