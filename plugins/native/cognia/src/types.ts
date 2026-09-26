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
export class CogniaError extends Error { readonly code: string; constructor(message: string, public readonly status = 400) { super(message); this.code = status === 404 ? "cognia.not_found" : status === 409 ? "cognia.conflict" : status === 499 ? "cognia.cancelled" : "cognia.invalid"; } }
export function requireCognia(condition: unknown, message: string, status = 400): asserts condition { if (!condition) throw new CogniaError(message, status); }
export function stringField(value: unknown, label: string, max = 500): string { requireCognia(typeof value === "string" && value.trim().length > 0 && value.length <= max, label); return value.trim(); }
