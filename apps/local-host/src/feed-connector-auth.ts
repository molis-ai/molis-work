import type { ConnectorAuthStatus } from "@molis-ai/molis-work-plugin-feed";
import { withConnectorConnections } from "./connector-connection-store.js";

/** Whether this Home has a GitHub or Gmail connection that is not disconnected; read from metadata, never decrypting a key. */
export function feedConnectorAuthStatus(home: string | undefined): ConnectorAuthStatus {
  if (!home) return { github: { bound: false }, gmail: { bound: false } };
  return withConnectorConnections(home, store => {
    const bound = (service: string) => store.list(service).some(row => !row.disconnected_at);
    return { github: { bound: bound("github") }, gmail: { bound: bound("gmail") } };
  });
}
