import { createHash } from "node:crypto";
import type { Runtime } from "@prologue/sdk";
import type { AgentRunInstructions } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PrologueStartInput } from "./prologue-ports.js";

type Packed = Awaited<ReturnType<Runtime["startAgentRun"]>>["pack"];

/** The runtime's own words when it cut an instruction file at its limit; the item may not say so itself. */
const CUT = /\n…\[truncated: this instruction file was cut at \d+ characters\]$/;

/**
 * What a round records of the repository's instruction files (specs/coding-harness-optimization/batch12-design.md §3.6): the items
 * the runtime packed as project instructions, each with the length and hash of the packed text, never the file on disk. A round that
 * was not trusted records `files: []`; a round without a directory records nothing.
 */
export function roundInstructions(input: Pick<PrologueStartInput, "workspace" | "project_trusted">, pack: Packed | undefined): AgentRunInstructions | undefined {
  if (input.workspace === "none" || input.workspace === "business" || !pack) return undefined;
  const trusted = input.project_trusted === true;
  return { trusted, files: trusted ? pack.items.filter(item => item.source === "project-instructions").map(item => ({
    path: item.origin, chars: item.chars, truncated: item.truncated || CUT.test(item.text), sha256: createHash("sha256").update(item.text).digest("hex"),
  })) : [] };
}
