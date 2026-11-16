import type { ActionSubject } from "./action-subjects.js";

/** A place a workbench address may name: a surface, an item on it and its name, and what the surface itself reads from the address. */
export interface ObjectLinkPlace { surface: string; id?: string | null; title?: string; params?: Readonly<Record<string, string>>; fragment?: string }

/**
 * The one writer of a workbench address under `prefix` (a project's route, or none): nobody joins `?openPlugin=…&openItem=…` by
 * hand (specs/work-line/contract-design.md §7). An object known only by reference is written as the reference, and the page asks
 * `objects.open@1` where it opens. `template` keeps `{…}` placeholders as written (an action result's `href_template`).
 * It stands alone: a page script may carry its text.
 */
export function objectLinkAt(prefix: string, to: ActionSubject | ObjectLinkPlace, template = false): string {
  const part = (value: string) => template ? value.replace(/\{[^{}]+\}|[^{}]+/gu, piece => piece.startsWith("{") ? piece : encodeURIComponent(piece)) : encodeURIComponent(value);
  if (!("surface" in to)) return `${prefix}/?openObject=${part(to.kind)}&openItem=${part(to.id)}`;
  const extra = Object.entries(to.params ?? {}).map(([name, value]) => `&${part(name)}=${part(value)}`).join("");
  return `${prefix}/?openPlugin=${part(to.surface)}${to.id ? `&openItem=${part(to.id)}` : ""}${to.title ? `&openTitle=${part(to.title)}` : ""}${extra}${to.fragment ? `#${part(to.fragment)}` : ""}`;
}
/** A project's address for an object or a place. */
export const objectLink = (projectId: string, to: ActionSubject | ObjectLinkPlace): string => objectLinkAt(`/projects/${encodeURIComponent(projectId)}`, to);
/** The same address as an action result's `href_template`: `{project_id}` and `{/pointer}` placeholders stay as written. */
export const objectLinkTemplate = (to: ObjectLinkPlace): string => objectLinkAt("/projects/{project_id}", to, true);
