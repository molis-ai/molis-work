/**
 * Logging in again to a remote MCP service (spec assistant-service-connections §13.2, ASC-59). MCP gives no stable account identity,
 * so a new login is always a new connection; the page then offers to move what used the old one to it. DOM-independent, and
 * serialized into the settings client like the authorization monitor.
 */

/** A connection row as the page shows it: its id, the service it belongs to, and whether it is an MCP login of the person's own. */
export interface ReplacementRow { id: string; service: string; mcp: boolean }

/**
 * Whether the connection just made may be offered as the replacement of `oldId`: both rows on the page, two different connections
 * of the one service the login was started for, and the old one an MCP login the person manages. Anything else gets no offer. This
 * only decides what the page offers; the switch and the removal check both connections again themselves.
 */
export function connectorReplacementPair(login: { service: string; newId?: unknown; oldId?: unknown }, rows: readonly ReplacementRow[]): { newId: string; oldId: string } | null {
  const { service, newId, oldId } = login;
  if (typeof newId !== "string" || typeof oldId !== "string" || !newId || !oldId || newId === oldId) return null;
  const made = rows.find(row => row.id === newId), old = rows.find(row => row.id === oldId);
  if (!made || !old || made.service !== service || old.service !== service || !old.mcp) return null;
  return { newId, oldId };
}

/**
 * How a switch went, counted against the usages read before it: how many moved, how many did not, and why (by stable code, the page
 * words them). A consumer that failed as a whole is counted only for the usages left over, so nothing is counted twice.
 */
export function connectorSwitchSummary(report: { results?: Array<{ switched?: unknown[]; refused?: Array<{ code?: unknown }> }>; failed?: Array<{ code?: unknown }> }, usages: number): { switched: number; unswitched: number; reasons: Array<{ code: string; count: number }> } {
  const results = Array.isArray(report?.results) ? report.results : [], failed = Array.isArray(report?.failed) ? report.failed : [];
  const switched = results.reduce((total, result) => total + (Array.isArray(result.switched) ? result.switched.length : 0), 0);
  const refused = results.flatMap(result => Array.isArray(result.refused) ? result.refused : []);
  const unswitched = Math.max(refused.length, usages - switched, 0);
  const counts = new Map<string, number>();
  for (const entry of refused) { const code = typeof entry.code === "string" ? entry.code : ""; counts.set(code, (counts.get(code) ?? 0) + 1); }
  const left = unswitched - refused.length;
  if (left > 0) for (const entry of failed) { const code = typeof entry.code === "string" ? entry.code : ""; if (!counts.has(code)) counts.set(code, 0); }
  const reasons = [...counts].map(([code, count]) => ({ code, count }));
  // What failed as a whole shares the usages not otherwise accounted for; with one reason it takes them all.
  const shared = reasons.filter(reason => reason.count === 0);
  if (shared.length === 1) shared[0]!.count = left;
  return { switched, unswitched, reasons };
}
