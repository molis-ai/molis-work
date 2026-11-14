import { actionEffect, isSubjectReader, type ActionSubject, type ActionSubjectContext, type ActionView, type SubjectContextRequest } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SurfacePlugin } from "./ports.js";

export type SurfaceSubjectReader = (view: ActionView, input: SubjectContextRequest, signal: AbortSignal, current: () => void) => Promise<ActionSubjectContext>;
export type SurfaceSubjectSummary = Pick<ActionSubjectContext, "title" | "revision" | "open">;
export interface SurfaceFallbackProof extends SurfaceSubjectSummary {
  readonly subject: ActionSubject;
  readonly plugin: SurfacePlugin;
  readonly reader: ActionView;
}

/** The extra automatic read is only for a free, local subject query. */
export function isSurfaceFallbackReader(view: ActionView): boolean {
  const { action } = view;
  return view.availability.available && isSubjectReader(action) && view.operation === "query" && action.kind === "query"
    && actionEffect(action, view.capability_id) === "read" && !action.external && action.execution?.cost === "none"
    && !action.permissions.some(permission => /^(model|network|connections|image-api|agent):/u.test(permission)
      || permission === "actions:delegate" || permission === "terminal:run" || permission === "materials:fetch");
}

/** Use the original gateway, then drop everything but this display proof. */
export async function readSurfaceSubject(reader: ActionView, subject: ActionSubject, invoke: SurfaceSubjectReader,
  signal: AbortSignal, current: () => void): Promise<SurfaceSubjectSummary | undefined> {
  if (!isSurfaceFallbackReader(reader) || !reader.action.subject_kinds.includes(subject.kind)) return undefined;
  const answer = await invoke(reader, { subject_id: subject.id }, signal, current);
  current();
  signal.throwIfAborted();
  if (answer.subject.kind !== subject.kind || answer.subject.id !== subject.id || !answer.revision) return undefined;
  const title = answer.title.trim();
  if (!title || title === subject.id.trim()) return undefined;
  return { title, revision: answer.revision, ...(answer.open ? { open: { surface: answer.open.surface, id: answer.open.id } } : {}) };
}
