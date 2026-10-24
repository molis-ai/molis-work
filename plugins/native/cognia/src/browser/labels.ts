import type { Material } from "../types.js";

/** The words for a material's role and an import entry's status, as stable keys. */
export const ROLE_KEY: Record<Material["role"], string> = {
  material: "cognia.role.material", wiki: "cognia.role.wiki", index: "cognia.role.index", log: "cognia.role.log", attachment: "cognia.role.attachment",
};
export const STATUS_KEY = {
  new: "cognia.status.new", update: "cognia.status.update", unchanged: "cognia.status.unchanged", skipped: "cognia.status.skipped",
} as const;

/** The two sources every library has that are not an import: a person's own material and the saved drafts. They cannot be renamed or deleted. */
export const OWN_SOURCES: readonly string[] = ["manual", "knowledge"];
