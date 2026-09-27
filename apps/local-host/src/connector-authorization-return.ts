import type { ServerResponse } from "node:http";

/** A provider callback is a human-facing page, not a JSON API error. */
export function connectorAuthorizationFailed(response: ServerResponse, service?: string, cancelled = false): void {
  const query = new URLSearchParams({ connection_error: cancelled ? "cancelled" : "failed" });
  if (service) query.set("connector", service);
  response.writeHead(302, { location: `/settings/connectors?${query}`, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  response.end();
}
