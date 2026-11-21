import { createCodingTimeline, retitleCodingWaits, type CodingChangeTally } from "../timeline.js";
import { codingTimelineWords } from "../timeline-words.js";
import { createCodingTurnChanges } from "../turn-changes-client.js";
import type { Lifetime } from "./types.js";

export function codingTranscript({ readText, lifetime, turns, changeTally }: {
  readText: Parameters<typeof codingTimelineWords>[0]; lifetime: Pick<Lifetime, "listen">; turns: HTMLElement; changeTally?: CodingChangeTally;
}) {
  const timeline = createCodingTimeline(codingTimelineWords(readText), changeTally);
  lifetime.listen(document, "molis-work:language-changed", () => retitleCodingWaits(turns));
  return { timeline, turnChanges: createCodingTurnChanges(readText) };
}
