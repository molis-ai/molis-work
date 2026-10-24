import type { UiClientTranslate, UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";
import type { Domain, Draft, Link, Material, Preview, Receipt, Reference, Source } from "../types.js";

export type Translate = UiClientTranslate;

/** What Cognia's page takes from the workbench's client host: the fields it uses, nothing it declares for itself. */
export type CogniaClientHost = Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement>,
  "scope" | "translate" | "route" | "pluginRoute" | "pluginId" | "confirm" | "prompt">;

/** A material as the list shows it: no body, a short excerpt around the search term. */
export type Summary = Omit<Material, "body" | "frontmatter"> & { excerpt: string };
export type DraftSummary = Omit<Draft, "body" | "references">;

/** The answer of `GET /library`: everything the list, the filters and the model line draw. */
export interface Workspace {
  materials: Summary[];
  domains: Domain[];
  sources: Source[];
  drafts: DraftSummary[];
  ai_available: boolean;
  ai_runtime: string | null;
  ai_unavailable_reason: string | null;
}
/** One material opened for reading, with the links it makes and receives and the sources it cites. */
export interface Detail { material: Material; outgoing: Link[]; incoming: Material[]; references: Reference[] }

/** Which step the dialog is on; the submit button does what the step says. */
export type Flow = "" | "import" | "preview" | "receipt" | "add" | "edit" | "domain" | "ai" | "review" | "drafts";

/** One request to Cognia's library routes; `path` is relative to `/library`. A body makes it a POST. */
export type CogniaApi = <T>(path: string, body?: unknown) => Promise<T>;

export type { Domain, Draft, Link, Material, Preview, Receipt, Reference, Source };
export type { ImportEntry } from "../types.js";
