/**
 * The stable key of a relation word: both renderers and the page client select a word by the relation's saved type and the
 * part of the interface being drawn. It imports nothing, so the page client's bundle (src/browser/) can share it.
 */
export function relationWordKey(type: string, part: "out" | "in" | "label" | "description"): string {
  return "goals.relation-kind." + type.replaceAll("_", "-") + "." + part;
}
