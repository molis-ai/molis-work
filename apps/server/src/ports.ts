import type { ActionFactory } from "@molis-ai/molis-work-server";
export interface ServerCompositionPorts {
  gatewayFactory(options: { url: string; homeDirectory: string }): ActionFactory;
  configureMemberActions(input: { hostUrl: string; homeDirectory: string; controlTokenFile: string; memberId: string; projectId: string; role: "owner" | "editor" | "viewer" | "revoked" }): Promise<unknown>;
  restoreWorkAssets(bundle: unknown, destination: string): Promise<unknown>;
  readRestoredAssets(destination: string, projectId: string): Promise<unknown>;
  diagnostics: {
    debug(event: string, fields: Record<string, unknown>): void;
    warn(event: string, fields: Record<string, unknown>): void;
    error(event: string, error: unknown, fields: Record<string, unknown>): void;
  };
}
