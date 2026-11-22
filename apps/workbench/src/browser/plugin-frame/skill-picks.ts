import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { SkillPick } from "@molis-ai/molis-work-contracts/services/skills";
import type { FrameDown, FrameScope, FrameUp } from "./types.js";

type PickUp = Extract<FrameUp, { type: "skill-pick" }>;

const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const shaped = (value: unknown): value is SkillPick => {
  const pick = value as Partial<SkillPick> | null;
  try { return Boolean(pick && text(pick.name, 400) && (pick.picked === "named" || pick.picked === "auto") && pick.ref && typeof pick.ref === "object" && JSON.stringify(pick.ref).length <= 2000); }
  catch { return false; }
};
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value);
// Who a Skill line belongs to: the Assistant, plugin work, or a plugin's declared scene (`isSkillPickConsumer`); kept local so the
// frame bundle does not pull the whole Skill contract.
const pickConsumer = (value: unknown): value is string => value === "assistant" || value === "agent"
  || typeof value === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(value) && value !== "common" && value !== "both";

/**
 * The 「依据」 panel for a plugin frame (specs/prologue-strategies/skill.md §10). The frame asks with the same `molis:skill-pick-open`
 * it would send on its own page; this trusted document asks the shell's one panel under a mark of its own, only for a press the
 * person just made in a view they can see, with the button's box moved from the frame into the window. The person's choice for another
 * round comes back to this frame alone. The panel reads and changes the person's Skill settings as the person: the frame hears only
 * which Skills to run the round again with.
 */
export function pageSkillPicks(port: MessagePort, scope: FrameScope, frame: HTMLElement, pageId: string) {
  const asked = new Map<string, string>(); let sequence = 0;
  scope.listen(document, "molis:skill-redo", event => {
    const detail = (event as CustomEvent<{ reply?: string; named?: Array<{ ref: SkillRef; name: string }> }>).detail, reply = detail?.reply === undefined ? undefined : asked.get(detail.reply);
    if (reply === undefined || !scope.alive) return;
    asked.delete(detail.reply!);
    port.postMessage({ type: "skill-redo", reply, named: Array.isArray(detail.named) ? detail.named : [] } satisfies FrameDown);
  });
  return (message: PickUp): void => {
    const { box } = message;
    if (!text(message.reply, 200) || !pickConsumer(message.consumer) || !Array.isArray(message.picks) || message.picks.length > 40
      || !message.picks.every(shaped) || !(message.index === null || (Number.isSafeInteger(message.index) && message.index >= 0 && message.index < message.picks.length))
      || !box || ![box.x, box.y, box.width, box.height].every(number)) return;
    // A frame cannot open a panel over the page by itself: only for a press the person just made in a view they can see.
    if (!scope.visible || !navigator.userActivation.isActive) return;
    const at = frame.getBoundingClientRect(), reply = "frame:" + pageId + ":" + ++sequence;
    asked.clear(); asked.set(reply, message.reply);
    document.dispatchEvent(new CustomEvent("molis:skill-pick-open", { cancelable: true, detail: { reply, consumer: message.consumer, picks: message.picks, index: message.index,
      box: { x: at.left + box.x, y: at.top + box.y, width: box.width, height: box.height } } }));
  };
}

/** The frame's side: its page asks and hears as on any page; the trusted document answers through the port. */
export function childSkillPicks(port: MessagePort, scope: FrameScope): void {
  scope.listen(document, "molis:skill-pick-open", event => {
    const detail = (event as CustomEvent<Omit<PickUp, "type">>).detail;
    if (!detail || typeof detail.reply !== "string") return;
    event.preventDefault();
    let picks: SkillPick[] = [];
    try { picks = structuredClone(Array.isArray(detail.picks) ? detail.picks : []); } catch { picks = []; }
    port.postMessage({ type: "skill-pick", reply: detail.reply, consumer: detail.consumer, picks, index: detail.index ?? null,
      box: { x: detail.box?.x, y: detail.box?.y, width: detail.box?.width, height: detail.box?.height } } satisfies FrameUp);
  });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    if (event.data.type !== "skill-redo") return;
    document.dispatchEvent(new CustomEvent("molis:skill-redo", { detail: { reply: event.data.reply, named: event.data.named } }));
  });
}
