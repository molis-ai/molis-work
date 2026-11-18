import type { EnvelopeAttachment, ExactRef, Runtime } from "@prologue/sdk";
import type { PrologueEvent } from "./prologue-stream.js";

const same = (left: ExactRef<string>, right: ExactRef<string>) => left.kind === right.kind && left.id === right.id && left.revision === right.revision;
const matches = (attachment: EnvelopeAttachment | undefined, ref: ExactRef<string>) => attachment?.id === ref.id && attachment.version === ref.revision;
const CHILD_FACTS = new Set(["subagent-parent-run", "subagent-message", "subagent-child", "subagent-result", "subagent-input"]);

/** Display only: the original SDK ledger and model protocol remain with their owners. */
export function projectPeerNotice(runtime: Runtime, recipient: ExactRef<"session">, event: PrologueEvent): PrologueEvent {
  if (event.type !== "prompt" || event.role !== "user" || event.source !== "peer") return event;
  const prompt = event as Extract<PrologueEvent, { type: "prompt" }>;
  const unknown = { ...prompt, text: "", notice: "peer-update" as const };
  if (!prompt.injection) return unknown;
  try {
    const envelope = runtime.delivery.get(prompt.injection);
    if (!same(envelope.ref, prompt.injection) || !same(envelope.to, recipient) || envelope.kind !== "inject"
      || envelope.audience !== "agents" || envelope.body !== prompt.text) return unknown;
    if (same(envelope.from, recipient)) return unknown;
    const children = runtime.subagents.list().filter(child => same(child.session, envelope.from));
    const attachments = envelope.attachments;
    if (!children.length && !attachments.some(one => CHILD_FACTS.has(one.kind))) return { ...prompt, text: envelope.body };
    const one = (kind: string) => { const found = attachments.filter(one => one.kind === kind); return found.length === 1 ? found[0] : undefined; };
    const childRef = one("subagent-child"), parent = one("subagent-parent-run");
    const child = children.find(child => matches(childRef, child.ref));
    if (!child || children.length !== 1 || !same(child.parentSession, recipient) || !matches(parent, child.parentRun)) return unknown;
    const contents = attachments.filter(one => one.kind === "subagent-result" || one.kind === "subagent-input");
    const content = contents.length === 1 ? contents[0] : undefined;
    if (!content || !(child.attempts ?? [child.run]).some(run => matches(content, run))) return unknown;
    if (content.kind === "subagent-input") return { ...prompt, text: "", notice: "subagent-input" };
    return content.summary?.trim() ? { ...prompt, text: content.summary } : unknown;
  } catch { return unknown; }
}
