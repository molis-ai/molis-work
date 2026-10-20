// Project knowledge organizes what enters a project in the background (specs/project-knowledge §5): a couple of seconds after a
// change it asks the Home's text model for a card. A fixture model that stands for one agent answers that call apart and keeps it
// out of the agent's own requests, so counting the agent's calls does not depend on when organizing happens to run. The marker is
// the opening line of the registered instruction `knowledge.organize`.
const MARKER = "你在给项目里的一份资料写卡片";

export const isKnowledgeOrganize = (body: string): boolean => body.includes(MARKER);

/** A card the organizer accepts. */
export const organizedCard = JSON.stringify({ title: "夹具资料", brief: "夹具整理出的卡片。", keywords: [], sections: [] });

const strings = (value: unknown): string[] => typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];

/**
 * The card for the piece an organize request (`raw`, its JSON body) asks about, keeping the piece's own title as the instruction
 * asks of a clear one: a catalog a test reads after organizing still names each piece by it. The organizer's input follows the
 * instruction as `{"title":…}`.
 */
export function organizedCardFor(raw: string): string {
  for (const text of strings(JSON.parse(raw))) {
    const found = /\{"title":("(?:[^"\\]|\\.)*")/.exec(text);
    if (found) return JSON.stringify({ ...JSON.parse(organizedCard), title: JSON.parse(found[1]!) });
  }
  return organizedCard;
}
