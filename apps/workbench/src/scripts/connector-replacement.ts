/**
 * Logging in again to a remote MCP service (spec assistant-service-connections §13.2, ASC-59). MCP gives no stable account identity,
 * so a new login is always a new connection; the page then offers to move what used the old one to it. DOM-independent, and
 * serialized into the settings client like the authorization monitor.
 */

type Report = {
  results?: Array<{ provider_id?: unknown; switched?: unknown[]; refused?: Array<{ usage_id?: unknown; code?: unknown }> }>;
  failed?: Array<{ provider_id?: unknown; code?: unknown }>;
};

/**
 * How a switch went, against the usages read before it: how many moved, and each usage that did not with the stable code of why
 * (the page words it). A usage its consumer refused takes that refusal's code; one whose consumer failed as a whole takes the
 * consumer's; one no consumer answered for (it reports usages but declares no switch) gets "" and the page's general advice.
 */
export function connectorSwitchLeft(report: Report, usages: ReadonlyArray<{ usage_id: string; title: string; source?: { provider_id?: string } }>): { switched: number; left: Array<{ title: string; code: string }> } {
  const results = report?.results || [], failed = report?.failed || [];
  const switched = results.reduce((total, result) => total + (result.switched?.length || 0), 0), left: Array<{ title: string; code: string }> = [];
  for (const usage of usages) {
    const provider = usage.source?.provider_id, own = results.filter(result => result.provider_id === provider);
    if (own.some(result => result.switched?.includes(usage.usage_id))) continue;
    const code = own.flatMap(result => result.refused || []).find(entry => entry.usage_id === usage.usage_id)?.code ?? failed.find(entry => entry.provider_id === provider)?.code;
    left.push({ title: usage.title, code: typeof code === "string" ? code : "" });
  }
  return { switched, left };
}
