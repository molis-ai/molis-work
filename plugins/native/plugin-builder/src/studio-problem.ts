import type { TextRef } from "@molis-ai/molis-work-contracts/platform/ui";

const word = Symbol("studio-request-word");
type StudioProblem = { readonly text: Extract<TextRef, { key: string }>; readonly detail?: string };

/** The Studio can show this refusal; the underlying diagnostic and its type remain available to other callers. */
export function studioProblem(key: string, reason: Error | string, detail?: string): Error {
  return Object.assign(typeof reason === "string" ? new Error(reason) : reason, {
    [word]: { text: { key }, ...(detail === undefined ? {} : { detail }) },
  });
}

export function studioProblemWord(error: unknown): StudioProblem | undefined {
  return error instanceof Error ? (error as Error & { [word]?: StudioProblem })[word] : undefined;
}
