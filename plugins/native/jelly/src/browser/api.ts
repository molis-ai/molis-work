import type { Failure, JellyHost } from "./types.js";

const uiText = globalThis.t;
/** The page's own actions and the versions it was written for. */
const VERSIONS = {
  "jelly.calendar.list": /* @version action.jelly.calendar.list */ 1,
  "jelly.item.get": /* @version action.jelly.item.get */ 1,
  "jelly.note.days": /* @version action.jelly.note.days */ 1,
  "jelly.note.list": /* @version action.jelly.note.list */ 1,
  "jelly.note.get": /* @version action.jelly.note.get */ 1,
  "jelly.item.create": /* @version action.jelly.item.create */ 1,
  "jelly.item.update": /* @version action.jelly.item.update */ 1,
  "jelly.item.delete": /* @version action.jelly.item.delete */ 1,
  "jelly.series.create": /* @version action.jelly.series.create */ 1,
  "jelly.series.update": /* @version action.jelly.series.update */ 1,
  "jelly.series.delete": /* @version action.jelly.series.delete */ 1,
  "jelly.category.save": /* @version action.jelly.category.save */ 1,
  "jelly.category.delete": /* @version action.jelly.category.delete */ 1,
  "jelly.note.save": /* @version action.jelly.note.save */ 1,
  "jelly.note.delete": /* @version action.jelly.note.delete */ 1,
  "jelly.restore": /* @version action.jelly.restore */ 1,
} as const;
export type JellyAction = keyof typeof VERSIONS;

/** One action call. A refusal for who-may-read reasons is said as the platform says it; a conflict keeps which row and its revision. */
export async function call<O>(host: JellyHost, capability: JellyAction, input: unknown): Promise<O> {
  try {
    return await host.invokeAction<O>({ capability_id: capability, version: VERSIONS[capability] }, input);
  } catch (error) {
    const failure = (
      error instanceof Error ? error : new Error(uiText.text("jelly.error.action-failed"))
    ) as Failure & { body?: { details?: Failure["details"] } };
    if (failure.body?.details && !failure.details) failure.details = failure.body.details;
    const refusal = host.readRefusal(failure.status ?? 0, failure.code);
    if (refusal) failure.message = refusal;
    else if (!failure.message) failure.message = uiText.text("jelly.error.action-failed");
    throw failure;
  }
}
export const isConflict = (error: unknown): boolean => {
  const code = (error as Failure | null)?.code;
  return code === "jelly.conflict" || code === "jelly.not_found";
};
export const messageOf = (error: unknown): string =>
  (error instanceof Error && error.message) || uiText.text("jelly.error.action-failed");
