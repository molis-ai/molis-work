import { createCodingTimeline } from "../timeline.js";
import { codingTimelineWords } from "../timeline-words.js";
import { createCodingTurnChanges } from "../turn-changes-client.js";
import type { Lifetime } from "./types.js";

export function codingTranscript({ readText, lifetime, turns }: {
  readText: Parameters<typeof codingTimelineWords>[0]; lifetime: Pick<Lifetime, "listen">; turns: HTMLElement;
}) {
  const timeline = createCodingTimeline(codingTimelineWords(readText));
  lifetime.listen(document, "molis-work:language-changed", () => timeline.retitleWaits(turns));
  return { timeline, turnChanges: createCodingTurnChanges(readText) };
}
