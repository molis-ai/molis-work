/** The permission an installation holds to send requests through the person's connections (`services.connections`). */
export const PLUGIN_CONNECTIONS_PERMISSION = "connections:use";

/**
 * One place where a plugin may use an account the person chooses: a slot. The person binds a connection of `service_id` to it in
 * settings; until then, and whenever they unbind it, the plugin's requests go out without credentials. `service_id` names one of the
 * platform's request services (`CONNECTOR_REQUEST_SERVICES`): the plugin never names the origin its requests may reach.
 */
export interface PluginConnectionSlotDeclaration {
  readonly slot_id: string;
  readonly service_id: string;
  /** Shown to the person where they choose the account. */
  readonly reason: string;
  /**
   * `installation` (the default): one account for the installation, in every project. `per_record`: the person chooses an account for
   * each of the plugin's records in a project (a Feed source, say), and the plugin names the record with `record_key` when it sends.
   */
  readonly binding?: PluginConnectionBinding;
}

export type PluginConnectionBinding = "installation" | "per_record";

/** A `per_record` slot's record key: up to 128 characters, none of them `/`, `:` or a control character. */
export const PLUGIN_CONNECTION_RECORD_KEY_MAX = 128;
export const isPluginConnectionRecordKey = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= PLUGIN_CONNECTION_RECORD_KEY_MAX && !/[/:\u0000-\u001f\u007f]/u.test(value);

export interface PluginConnectionsDeclaration {
  readonly slots: readonly PluginConnectionSlotDeclaration[];
}

export type PluginConnectionMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface PluginConnectionRequest {
  /** An https address on the slot's service origin. */
  readonly url: string;
  /** Which record's account, on a `per_record` slot (and only there). */
  readonly record_key?: string;
  readonly method?: PluginConnectionMethod;
  /** Credential, cookie and hop-by-hop headers are the Host's and are refused here. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

export interface PluginConnectionResponse {
  readonly status: number;
  /** Only the response headers a plugin may see (no cookies, no credentials). */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  /** Whether the Host added the bound account's credential; `false` means the request went out anonymously. */
  readonly authenticated: boolean;
}

/**
 * Requests through the account the person bound to a slot. The plugin never receives the credential and cannot send it elsewhere:
 * only the service's own origin is reachable, only public addresses, redirects are returned and never followed, and only from this
 * instance's own running action or kept job that declares `connections:use`, the grant checked on every call.
 */
export interface PluginConnectionsClient {
  request(slot_id: string, request: PluginConnectionRequest): Promise<PluginConnectionResponse>;
  /** Whether the slot (the record's, on a `per_record` slot) has an account, its name and state; never which connection or a credential. */
  describe(slot_id: string, record_key?: string): Promise<PluginConnectionDescription>;
  /** Unbinds a record's account on a `per_record` slot, when the plugin removes the record: its requests go out without credentials again. */
  release(slot_id: string, record_key: string): Promise<void>;
}

/** What a plugin may know about the account behind a slot. */
export interface PluginConnectionDescription {
  readonly bound: boolean;
  /** The account's display name, when bound. */
  readonly display_name?: string;
  readonly state?: "connected" | "reauth_required" | "disconnected";
}
