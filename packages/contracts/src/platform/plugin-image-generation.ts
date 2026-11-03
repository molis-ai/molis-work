import type { ConnectorConnectionView } from "../services/connector-host.js";

/** A business slot in this installation's trusted Home connection namespace. */
export interface PluginImageTarget {
  readonly slot_id: string;
  readonly base_url: string;
}
export interface PluginImageConnectionState {
  readonly connection_id: string | null;
  readonly available: boolean;
  readonly has_key: boolean;
  readonly reason?: string;
  /** Opaque concurrency precondition; contains no credential, ciphertext or secret reference. */
  readonly revision: string;
}
export interface PluginImageGenerationRequest extends PluginImageTarget {
  readonly expected_revision: string;
  readonly protocol: "openai-images" | "gemini";
  readonly model: string;
  readonly prompt: string;
  readonly size?: string;
  readonly aspect_ratio?: string;
}
export interface PluginImageGenerationClient {
  connections(): readonly ConnectorConnectionView[];
  /** Read-only: inspecting an address never pins a connection to it. */
  inspect(target: PluginImageTarget): PluginImageConnectionState;
  bind(target: PluginImageTarget, connection_id: string): Promise<void>;
  unbind(slot_id: string): Promise<void>;
  generate(request: PluginImageGenerationRequest, options?: { readonly signal?: AbortSignal }): Promise<{
    readonly images: readonly { readonly bytes: Uint8Array; readonly mime?: string }[];
    /** Host snapshot checked for this result; consumers recheck it before later business writes. */
    readonly revision: string;
  }>;
}
/**
 * What a plugin's Manifest declares (`image_generation`, PG-102), like any plugin's: the binding namespace and the permissions
 * that read, bind and generate. The Host gives the service only to a definition on its start list, whose namespace its store
 * registry holds as this plugin's.
 */
export interface PluginImageGenerationDeclaration {
  readonly store_name: string;
  readonly read_permission: string;
  readonly write_permission: string;
  readonly generate_permission: string;
}
