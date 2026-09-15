import { LocalMcpServer, type MolisWorkMcpAudience, type MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import type { MolisWorkRuntimeConnection, MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import { withMolisWorkProjectCatalog } from "./project-catalog.js";

/** Supply the desktop Catalog adapter while the Host owns MCP resource lifecycle. */
export class MolisWorkServer extends LocalMcpServer {
  constructor(audience?: MolisWorkMcpAudience | null, connection?: MolisWorkRuntimeConnection | null,
    runtimeHost?: MolisWorkRuntimeContextHost | null, localHost?: MolisWorkLocalHost) {
    super(withMolisWorkProjectCatalog, audience, connection, runtimeHost, localHost);
  }
}
