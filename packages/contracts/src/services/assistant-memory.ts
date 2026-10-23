import type { MemoryScope } from "./memory.js";

export interface AssistantRoundMemory { memory_id: string; scope: MemoryScope; text: string; origin: string; version?: number; content_changed?: true }

/** Something the person asked the Assistant to keep: personal (all their work) or one project's. */
export interface AssistantMemory {
  memory_id: string;
  scope: "personal" | "project" | "character";
  /** For a project memory: which project. */
  project_id?: string;
  text: string;
  /** Where it came from: the work, the date and the person's own words. */
  origin: string;
  /** Kept, but not used in work until switched on again (different from deleting it). */
  disabled: boolean;
}

/** What the Assistant may do with memory, set by the person; applied exactly as written. */
export interface AssistantMemoryPrefs {
  /** May keep what the person explicitly asks it to remember. It never keeps anything the person did not ask for or accept. */
  form: boolean;
  /** Personal memories are used in work. */
  use_personal: boolean;
  /** A project's memories are used in that project's work. */
  use_project: boolean;
  /** May propose, from work, a personal preference or lesson worth keeping — only as a candidate the person accepts. */
  learn_personal: boolean;
  /** May propose, from a project's work, a convention or lesson for that project — only as a candidate. */
  learn_project: boolean;
}

/**
 * Something a work suggests keeping (a preference seen more than once, a lesson from how a work went). It takes effect
 * only when the person accepts it; declined or left alone for 14 days, it goes.
 */
export interface AssistantMemoryCandidate {
  candidate_id: string;
  work_id: string;
  work_title: string;
  scope: "personal" | "project" | "character";
  project_id?: string;
  text: string;
  /** What in the work it rests on. */
  why: string;
  /** When it applies. */
  applies: string;
  state: "pending" | "accepted" | "discarded" | "expired" | "cancelled";
  created_at: string;
  memory_id?: string;
  /** Why the write gate held back what the person asked to keep, in the memory service's words; absent for the work's own suggestions. */ held?: string;
}
