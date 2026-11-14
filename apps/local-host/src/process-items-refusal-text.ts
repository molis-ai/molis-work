/**
 * Why a Files-era library cannot be adopted, as a code the workbench says in the person's language, with the values the sentence needs.
 * The raw diagnostic stays in `refused` for logs and reports (BL-adoption-refusal-text).
 */
export type AdoptionRefusalCode = "layout" | "output" | "unsettled" | "private_value" | "position" | "retired" | "other";
export interface AdoptionRefusalText {
  readonly code: AdoptionRefusalCode;
  readonly params: Readonly<Record<string, string | number>>;
  readonly detail: string;
}

export function adoptionRefusalText(detail: string): AdoptionRefusalText {
  const layout = /^layout (.+)$/u.exec(detail);
  if (layout) return { code: "layout", params: { layout: layout[1]! }, detail };
  const output = /^output ([^:]+): (.+) is not a Files process item$/u.exec(detail);
  if (output) return { code: "output", params: { port: output[1]!, artifact: output[2]! }, detail };
  const changes = /^(\d+) process item change\(s\)/u.exec(detail);
  if (changes) return { code: "unsettled", params: { count: Number(changes[1]) }, detail };
  const frozen = /^(\d+) frozen process item upload\(s\)/u.exec(detail);
  if (frozen) return { code: "unsettled", params: { count: Number(frozen[1]) }, detail };
  const conflicts = /^(\d+) process item sync conflict\(s\)/u.exec(detail);
  if (conflicts) return { code: "unsettled", params: { count: Number(conflicts[1]) }, detail };
  const failures = /^(\d+) process item sync failure\(s\)/u.exec(detail);
  if (failures) return { code: "unsettled", params: { count: Number(failures[1]) }, detail };
  const value = /^private value (.+?)(?: cannot| is|$)/u.exec(detail);
  if (value) return { code: "private_value", params: { key: value[1]! }, detail };
  if (/(?:reading )?position/iu.test(detail)) return { code: "position", params: {}, detail };
  if (/\b(?:install|cursor)\b/iu.test(detail)) return { code: "retired", params: {}, detail };
  return { code: "other", params: {}, detail };
}
