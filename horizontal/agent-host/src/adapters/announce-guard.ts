import { APP_MODE_SURFACE_TOOLS, APP_MODE_SYSTEM_TOOLS, decodeJsonOutput } from "@prologue/sdk";
import { DELEGATION_TOOLS, GATEWAY_TOOLS, HOST_GOVERNED_TOOLS, MEMORY_TOOLS } from "./prologue-action-gateway.js";

/**
 * What a round's ending is held for, and what the model then reads. Whether a reply claims something its round did
 * not do is read by the ending review against the round's facts (ending-review.ts); what stays here is what the Host
 * can see by itself: a tool call written out as text, and identifiers the Host itself handed the model.
 * An ending that only announces is held once and continued (the person chose this on 2026-09-28: one automatic
 * continuation, shown in the round, at the cost of one more model call).
 */

/** What the model reads when its announcement is held. */
export const ANNOUNCE_HELD =
  "Your last message only said what you would do next and called no tool, so nothing has happened yet. If the work is not finished, call the tools now. If it is finished, needs the person's decision, or cannot proceed, say so plainly.";

/** What the model reads when it claimed a memory change in a round the person gave no memory (switched off in settings). */
const MEMORY_OFF_HELD =
  "This round has no authorized memory tools, so the claimed memory change was not made. Say plainly what was not kept or forgotten. Follow the actual memory settings supplied for this work; do not infer that reading permission grants permission to form or disable a memory.";

/** What the model reads when it claimed a memory change it did not make. */
const MEMORY_CLAIM_HELD = {
  keep: "You said you remembered it, but no remember call succeeded in this round, so nothing was kept. Call remember now if the person asked you to keep it; otherwise say plainly that it was not kept.",
  forget: "You said you forgot it, but no forget-memory call succeeded in this round, so it is still in use. Call forget-memory now if the person asked; otherwise say plainly that it was not forgotten. (forget-memory switches it off; it does not delete it.)",
} as const;

/** Missing change tools can follow delegation or independent formation/read permissions. Do not guess why. */
const MEMORY_NOT_GIVEN_HELD =
  "This round has no authorized tool for the memory change you claimed. Nothing was kept or forgotten by that claim. Say plainly that the requested change was not made. Reading remembered information does not mean you can keep or forget it.";

/** What the model reads when a round's reply claims `claim` that no call made: switched off, no such tool in a handed-down work, or just not done. */
export function memoryHeld(round: { off: boolean; without: { keep: boolean; forget: boolean } }, claim: "keep" | "forget"): string {
  return round.off ? MEMORY_OFF_HELD : round.without[claim] ? MEMORY_NOT_GIVEN_HELD : MEMORY_CLAIM_HELD[claim];
}

/** What the model reads when it said something was saved or created but no change succeeded this round. */
export const SAVED_CLAIM_HELD =
  "You said it was saved, created or changed, but no change succeeded in this round, so nothing was kept. If the person asked for it, make the change now with the tools; if it was done in an earlier round, say that it was done earlier; otherwise say plainly that it was not done.";

/** What the model reads when it said a button is ready but made none. */
export const BUTTON_CLAIM_HELD =
  "You said a button or card is ready, but no suggest-action call succeeded in this round, so the person has nothing new to click. If they asked for a button now, call suggest-action for it; if you meant one offered in an earlier round, say that it is that earlier one; otherwise say plainly that no button was made.";

/**
 * A reply that writes a tool call out as text instead of making it. Seen from MiniMax-M3: asked for buttons, it
 * answered with “[suggest-action] … capability_id: pages.create …” blocks, so the person saw markup and no card.
 * Held once whatever the round's execution: nothing it wrote happened.
 */
// Every tool a business round can be given, from the same constants that register them: a new tool is covered by itself.
export const GUARDED_TOOL_NAMES: readonly string[] = [...Object.values(GATEWAY_TOOLS), ...Object.values(DELEGATION_TOOLS), ...Object.values(MEMORY_TOOLS),
  ...APP_MODE_SYSTEM_TOOLS, ...APP_MODE_SURFACE_TOOLS];
const TOOL_NAMES = GUARDED_TOOL_NAMES.join("|");
const WRITTEN_CALL = new RegExp(`\\[\\/?(?:${TOOL_NAMES})\\]|<\\/?(?:${TOOL_NAMES})>|(?:^|\\n)\\s*(?:capability_id|provider_id)\\s*[:=：]|"capability_id"\\s*:`);
export function writesToolCallAsText(text: string): boolean {
  return WRITTEN_CALL.test(text);
}

/** What the model reads when it wrote a call instead of making it. */
export const WRITTEN_CALL_HELD =
  "Your reply wrote a tool call out as text (a [tool] block or capability_id lines), so nothing happened: the person sees that text, not a button or an action. Make the call itself now with the tool, or answer in plain words without it.";


/**
 * Identifiers the Host itself handed the model, shown to the person in a reply: a tool's name, a capability or provider
 * id the round found, a field's own name, an object's id or an error code from a tool's result. Only those count, each
 * as the Host gave it (the person chose this on 2026-10-16): no pattern guesses what looks like an identifier, so a file name, a path
 * or an address the person uses is never one. One that cannot be an ordinary word (a separator in it, four characters
 * or more) is matched; one the person wrote in their own message is theirs.
 */
const SPOKEN_TOOLS = GUARDED_TOOL_NAMES.filter(name => name.includes("-"));
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function mentionsInternalIds(text: string, given: Iterable<string>, theirs = ""): string[] {
  // Addresses are usable destinations, not spoken identifiers. Preserve their labels for the normal check.
  text = text.replace(/(?:https?:\/\/|\/(?!\/))[\w][^\s<>`"\u3000-\u303f\uff00-\uffef)\]]*/g, "");
  const found = new Set<string>();
  for (const id of new Set([...SPOKEN_TOOLS, ...given])) {
    if (id.length < 4 || !/[._:-]/.test(id) || theirs.includes(id)) continue;
    if (new RegExp(`(?<![\\w./@#:-])${escape(id)}(?![\\w/@-]|\\.\\w)`).test(text)) found.add(id);
  }
  return [...found];
}

/** What the model reads when its reply showed internal identifiers. */
export function internalIdsHeld(found: readonly string[]): string {
  return `Your reply shows the person internal identifiers (${found.slice(0, 4).join(", ")}). Write it again naming things by their titles and names — the capability's title, the plugin, the document or project title — and leave the identifiers out. Keep one only if the person asked for that identifier itself.`;
}

/**
 * What a round really did, from its own events, for the ending review (ending-review.ts): which tools it called and how
 * each ended, what it said before its last answer, and the identifiers its results handed the model.
 */

/** One tool call of the round and how it ended, as the round's own events say. */
interface RoundCall { readonly id: string; readonly tool: string; ended: "running" | "returned" | "failed" | "unknown" }

/** What a round said and called, kept per run from its events. */
export interface RoundFacts {
  readonly calls: RoundCall[];
  /** The round's words before its last answer, the tail only: a claim made there counts as much as one at the end. */
  said: string;
  /** Identifiers the round's tool results handed the model: field names, object ids, error codes (never titles). */
  readonly ids: Set<string>;
}

export function emptyRoundFacts(): RoundFacts { return { calls: [], said: "", ids: new Set() }; }

/** The round's events, as facts: which tools were called and how each ended, and what the results named. */
export function noteRoundEvent(facts: RoundFacts, event: { type: string; [key: string]: unknown }): void {
  if (event.type === "text-delta" && typeof event.text === "string") facts.said = (facts.said + event.text).slice(-4000);
  if (event.type === "tool-call") {
    const call = event.call as { id?: unknown; name?: unknown } | undefined;
    if (typeof call?.name === "string") facts.calls.push({ id: String(call.id), tool: call.name, ended: "running" });
  }
  if (event.type === "tool-result" && typeof event.name === "string") {
    const call = [...facts.calls].reverse().find(item => item.id === String(event.callId));
    if (call) call.ended = event.outcome === "returned" ? "returned" : event.outcome === "failed" ? "failed" : "unknown";
    if (typeof event.errorCode === "string") facts.ids.add(event.errorCode);
    if (typeof event.text === "string") collectIds(event.text, facts.ids);
  }
}

/**
 * Tools that act in the person's world when they return: the Host-governed records, and acting on a page or an app.
 * Keeping and forgetting a memory are counted by what they really did (a forget may return having switched nothing off).
 */
const ACTING_TOOLS = new Set([...HOST_GOVERNED_TOOLS.filter(name => name !== MEMORY_TOOLS.remember && name !== MEMORY_TOOLS.forget), "surface-act"]);
/** Whether a returned call this round recorded or acted on something (a capability change is judged by its effect, a memory by its count). */
export function actedThisRound(facts: RoundFacts, options: { readonly except?: ReadonlySet<string> } = {}): boolean {
  return facts.calls.some(call => call.ended === "returned" && ACTING_TOOLS.has(call.tool) && !options.except?.has(call.tool));
}

/** Field names, object ids and error codes in a tool's JSON result: things the Host named, never words of the person. */
function collectIds(text: string, into: Set<string>): void {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return; /* a plain-text result names no fields */ }
  const walk = (node: unknown, key: string | undefined, depth: number) => {
    if (depth > 12 || into.size > 2000) return;
    if (Array.isArray(node)) { for (const item of node) walk(item, key, depth + 1); return; }
    if (node && typeof node === "object") {
      for (const [name, child] of Object.entries(node)) { if (name.includes("_")) into.add(name); walk(child, name, depth + 1); }
      return;
    }
    if (typeof node !== "string" || node.length < 4 || node.length > 200 || !key) return;
    if ((key === "id" || /_id$|Id$/.test(key)) && /[-_.:\d]/.test(node)) into.add(node);
    if ((key === "code" || key === "error_code") && /^[a-z]+(?:\.[a-z_]+)+$/.test(node)) into.add(node);
  };
  walk(value, undefined, 0);
}

/** What a reply may claim against the facts. */
const ENDING_CLAIMS = ["changed", "kept", "forgot", "button", "will_do"] as const;
export type EndingClaim = typeof ENDING_CLAIMS[number];

/**
 * The claims a review answered. The owner's instructions ask for one JSON line, {"last", "changed", "kept", "forgot",
 * "button"}: an ending that is the next step to take (last: "next_step"), and each kind of change for which it copied a
 * sentence saying the round made it. Anything else (not that JSON, an unknown value) reads as none.
 */
export function endingClaims(text: string): EndingClaim[] {
  const decoded = decodeJsonOutput(text.trim(), { allowCodeFence: true });
  if (!decoded.ok || !decoded.value || typeof decoded.value !== "object") return [];
  const answer = decoded.value as Record<string, unknown>;
  return ENDING_CLAIMS.filter(name => name === "will_do" ? answer.last === "next_step" : typeof answer[name] === "string" && Boolean((answer[name] as string).trim()));
}
