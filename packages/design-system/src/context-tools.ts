/**
 * What a plugin may publish as its tools (`molis:context-tools`, context-toolbar §5.2): plain data, read bounded and closed. Whatever
 * does not fit the shape or the limits is dropped, not repaired. No import and nothing outside its own body: the toolbar program
 * carries this function as source text (`.toString()`), so the page and the unit tests run one and the same function.
 */
export function sanitizeContextTools(
  raw: unknown,
  limits: { readonly groups: number; readonly items: number; readonly label: number },
): { context_id: string; groups: Array<{ id: string; collapse?: string; items: Array<Record<string, unknown>> }> } | null {
  type Loose = Record<string, unknown>;
  const id = (value: unknown, pattern = /^[A-Za-z0-9_.-]{1,40}$/): string => (typeof value === "string" && pattern.test(value) ? value : "");
  const text = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const offer = raw as Loose | null;
  const context_id = offer && text(offer.context_id, 240);
  if (!offer || !context_id || !Array.isArray(offer.groups)) return null;
  const groups: Array<{ id: string; collapse?: string; items: Array<Record<string, unknown>> }> = [];
  const seen = new Set<string>();
  let count = 0;
  for (const group of (offer.groups as Loose[]).slice(0, 64)) {
    const gid = group && Array.isArray(group.items) && id(group.id);
    if (!gid || seen.has(gid) || groups.length >= limits.groups) continue;
    const items: Array<Record<string, unknown>> = [];
    const ids = new Set<string>();
    for (const item of (group.items as Loose[]).slice(0, 64)) {
      const iid = item && id(item.id), label = item && text(item.label, limits.label);
      if (!iid || !label || ids.has(iid) || count >= limits.items) continue;
      ids.add(iid); count += 1;
      const icon = id(item.icon, /^[a-z0-9-]{1,40}$/), shortcut = text(item.shortcut, 20);
      items.push({
        id: iid, label, ...(icon && { icon }), ...(["B", "I", "U", "S", "H1", "H2", "H3", "A"].includes(item.glyph as string) && { glyph: item.glyph }),
        ...(typeof item.pressed === "boolean" && { pressed: item.pressed }), ...(typeof item.disabled === "boolean" && { disabled: item.disabled }),
        ...(shortcut && { shortcut }), ...(item.opens === "panel" && { opens: "panel" }),
      });
    }
    if (!items.length) continue;
    seen.add(gid);
    groups.push({ id: gid, items, ...((group.collapse === "never" || group.collapse === "overflow") && { collapse: group.collapse }) });
  }
  return { context_id, groups };
}
