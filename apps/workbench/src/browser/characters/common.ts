import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";

/** The page's one request helper (packages/ui-host request-client): control headers, one origin, plain Errors with `code`. */
export const pageRequest = (): UiRequest => molisWorkRequest;

export type Method = "GET" | "POST" | "PUT";
/** One Characters request: the page's API prefix is already applied; a failure says `角色请求失败` unless the answer explains itself. */
export type CharacterRequest = <T>(method: Method, path: string, body?: unknown) => Promise<T>;
/** `[data-character-<name>]` in the page, or null when the markup lacks it. */
export type FindPart = <T extends HTMLElement = HTMLElement>(name: string) => T | null;
/** The same, for a part the page cannot work without. */
export type Part = <T extends HTMLElement = HTMLElement>(name: string) => T;

/** What the page's server markup gives: the parts of one Characters page. */
export function partsOf(root: HTMLElement): { find: FindPart; q: Part } {
  const find: FindPart = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>("[data-character-" + name + "]");
  const q: Part = <T extends HTMLElement = HTMLElement>(name: string): T => {
    const node = find<T>(name);
    if (!node) throw new Error("Characters page part missing: data-character-" + name);
    return node;
  };
  return { find, q };
}

/** An exact action reference, as a Character keeps it. */
export interface ActionRef { capability_id: string; version: number; provider_id: string }
/** A published version of a Character package (an Artifact reference). */
export interface ArtifactVersionRef { artifact_id: string; version: number }

export interface SnapshotFile { path: string; bytes?: number | null }
export interface SnapshotRule { path: string; scope: string; content: string; condition?: string | null }
export interface SnapshotSkill {
  id: string; name: string; description: string; path: string; files: SnapshotFile[];
  compatibility: string; reason?: string | null;
}
export interface ImportSnapshot {
  runtime_id: string; config_root: string; project_root?: string | null; captured_at: string;
  rules: SnapshotRule[]; skills: SnapshotSkill[];
}

export type CharacterState = "active" | "disabled" | "tombstoned";
/** What the person edits: the draft's content. `action_tools` null or absent inherits the run's choice. */
export interface CharacterContent {
  title: string; instructions: string; host_tools: string[] | null; action_tools?: ActionRef[] | null;
}
/** A saved personal draft. */
export interface CharacterRecord extends CharacterContent {
  character_id: string; revision: number; state: CharacterState; import_snapshot?: ImportSnapshot;
}
/** An unsaved edit kept in this window's session storage. */
export interface StoredDraft extends CharacterContent { expected_revision: number }

export interface PublicationPayload extends CharacterContent {
  character_id: string; source: { draft_revision: number }; import_snapshot?: ImportSnapshot;
}
/** A published, fixed version of a Character in the current project. */
export interface CharacterPublication {
  artifact_id: string; version: number; lifecycle_state: string; availability: string; payload: PublicationPayload;
}

export const RUNTIME_NAMES: Record<string, string> = {
  codex: "Codex", "claude-code": "Claude Code", cursor: "Cursor", opencode: "OpenCode", "grok-build": "Grok Build",
};

/** What a failure says: the message of whatever was thrown, empty when it has none. */
export function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
  return "";
}

/** An element with its text and class name, when given. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
}

export function tag(text: string, tone?: string): HTMLSpanElement {
  return el("span", text, "characters-tag" + (tone ? " characters-tag--" + tone : ""));
}

export function chevron(): SVGSVGElement {
  const mark = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  mark.setAttribute("class", "characters-row-chevron");
  mark.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#icon-chevron-right");
  mark.append(use);
  return mark;
}

/** The first line of a text that has any characters. */
export const firstLine = (text: string | null | undefined): string => String(text || "").split("\n").map(line => line.trim()).find(Boolean) || "";

/** The newest active published version of a Character, if it has one. */
export const latestActive = (publications: CharacterPublication[], characterId: string): CharacterPublication | undefined =>
  publications.filter(item => item.payload?.character_id === characterId && item.lifecycle_state === "active").sort((a, b) => b.version - a.version)[0];

/** Every published version of a Character, newest first. */
export const versionsOf = (publications: CharacterPublication[], characterId: string | null): CharacterPublication[] =>
  publications.filter(record => record.payload?.character_id === characterId).sort((a, b) => b.version - a.version);

/** The fixed text of a Character as the person reads it before and after publishing. */
export function readableContent(content: CharacterContent, describeActions: (tools: ActionRef[] | null | undefined) => string): string {
  const tools = content.host_tools === null ? "沿用调用方" : content.host_tools.join(", ") || "不用内置工具";
  return content.instructions + "\n\n内置工具：" + tools + "\n动作能力：" + describeActions(content.action_tools);
}
