import { defineErrorCodes, type ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
export const COGNIA_PLUGIN_ID = "io.molis.work.cognia";
export const COGNIA_PROJECT_PLUGIN_ID = "cognia";
export const COGNIA_LIMITS = { files: 1000, text_bytes: 2_000_000, attachment_bytes: 8_000_000, batch_bytes: 32_000_000, ai_characters: 100_000 } as const;
export type SourceKind = "obsidian" | "llm-wiki" | "markdown";
export interface Domain { id: string; name: string }
export interface Source { id: string; name: string; kind: SourceKind; locator: string; domain_id: string | null }
export interface ImportFile { path: string; data?: string; reason?: string }
export interface Metadata { title: string; tags: string[]; aliases: string[]; frontmatter: string }
export interface Material extends Metadata { id: string; source_id: string; path: string; domain_id: string | null; role: "material" | "wiki" | "index" | "log" | "attachment"; revision: number; hash: string; bytes: number; updated_at: string; mime: string; body: string }
export interface Reference { label: string; material_id: string; revision: number; title: string; path: string; body: string }
export interface Draft { id: string; title: string; body: string; domain_id: string | null; references: Reference[]; mode: "synthesize" | "query"; saved_id: string | null; created_at: string }
export interface ImportEntry { path: string; status: "new" | "update" | "unchanged" | "skipped"; reason?: string; role?: Material["role"]; bytes?: number }
export interface Preview { id: string; source: Source; entries: ImportEntry[]; expires_at: number }
export interface Receipt { id: string; source_id: string; added: number; updated: number; unchanged: number; skipped: number; material_ids: string[]; entries: ImportEntry[] }
export interface Link { target: string; label: string; status: "resolved" | "missing" | "ambiguous" | "external" | "unsafe"; material_id?: string }
/**
 * Cognia's own error codes, every one `cognia.<reason>`. The kind is the sort of failure; the Host's edge turns it into the status (plugin SDK
 * `actionHttpStatus`), so Cognia keeps no status table of its own. Before, the code followed the status the caller picked (404, 409 and 499 had a
 * code of their own, every other status was `cognia.invalid`); now each status that the routes really answered has its own code.
 */
export const cogniaErrors = defineErrorCodes("cognia", {
  cancelled: "cancelled",
  conflict: "conflict",
  invalid: "invalid",
  /** The model answered, but not with a result Cognia can use. */
  model_invalid: "upstream",
  /** No text model is configured or reachable. */
  model_unavailable: "unavailable",
  not_found: "not_found",
  too_large: "too_large",
  directory_unavailable: "unavailable",
});
export function requireCognia(condition: unknown, message: string, raise: (message: string) => ActionError = cogniaErrors.invalid): asserts condition { if (!condition) throw raise(message); }
export function stringField(value: unknown, label: string, max = 500): string { requireCognia(typeof value === "string" && value.trim().length > 0 && [...value].length <= max, label); return value.trim(); }
