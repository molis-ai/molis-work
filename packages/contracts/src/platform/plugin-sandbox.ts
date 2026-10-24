/** JSON-only contract shared by generated plugins and the trusted host. */
export type SandboxJson = null | boolean | number | string | SandboxJson[] | { [key: string]: SandboxJson };

/** Deliberately bounded JSON Schema subset. Unknown keywords are rejected. */
export interface SandboxSchema {
  type: 'null' | 'boolean' | 'number' | 'integer' | 'string' | 'array' | 'object';
  description?: string;
  enum?: SandboxJson[];
  const?: SandboxJson;
  properties?: Record<string, SandboxSchema>;
  required?: string[];
  additionalProperties?: false;
  items?: SandboxSchema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  format?: 'date' | 'date-time' | 'uri';
  minimum?: number;
  maximum?: number;
}

/** All effects default to denied; installation grants must explicitly contain them. */
export interface SandboxEffects {
  storage?: Array<'read' | 'write'>;
  artifacts?: Array<'read' | 'write'>;
  capabilities?: string[];
  events?: string[];
  networkDomains?: string[];
  secretRefs?: string[];
  resources?: string[];
  /** The plugin's own tables in the project's library, which its Manifest declares (`databases.project`). */
  projectDatabase?: Array<'read' | 'write'>;
  /** Slots of the Manifest's `connections.slots` the operation sends requests through (`sdk.connections`); the plugin's package also declares `connections:use`. */
  connections?: string[];
  /** `read`: the Host's document and file readers (`sdk.materials`); the plugin's package also declares `materials:read`. */
  materials?: Array<'read'>;
}

export interface SandboxOperationExample {
  input: SandboxJson;
  /** Exactly one expectation: exact output, recursive object subset, or declared error code. */
  output?: SandboxJson;
  outputIncludes?: SandboxJson;
  error?: string;
}

export interface SandboxOperationContract {
  id: string;
  kind: 'query' | 'command';
  description?: string;
  input: SandboxSchema;
  output: SandboxSchema;
  errors: Array<{ code: string; description: string }>;
  effects: SandboxEffects;
  examples: SandboxOperationExample[];
}

export interface SandboxPluginContract {
  version: 1;
  pluginId: string;
  revision: string;
  operations: SandboxOperationContract[];
  entities: Array<{ id: string; schema: SandboxSchema; description?: string }>;
  pages: Array<{
    id: string;
    title: string;
    regions: Array<{ id: string; title: string; description?: string; operationIds: string[] }>;
  }>;
  acceptance: Array<{
    id: string;
    description: string;
    steps: Array<{ description: string; operationId?: string; input?: SandboxJson; expected: string }>;
  }>;
}

export interface SandboxIdentity {
  projectId: string;
  installationId: string;
  pluginId: string;
  namespace: 'preview' | 'installed';
}

export interface SandboxNetworkRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  /** References only. The host determines the header and prefix for each secret. */
  secretRefs?: string[];
}
export interface SandboxNetworkResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** A request through the account the person bound to a slot (`sdk.connections`): only https addresses on the slot's service, never a credential header. */
export interface SandboxConnectionRequest {
  url: string;
  method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
}
export interface SandboxConnectionResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  /** Whether the Host added the bound account's credential; `false` means the request went out anonymously. */
  authenticated: boolean;
}

/** A file as it crosses the channel: its name and its bytes in base64 (the Host decodes and checks it before it reads any of it). */
export interface SandboxMaterialFile { file_name: string; data_base64: string }
/** What a plugin chooses for one read; the Host's own limits, its model downloads and its progress reports are not the plugin's to set. */
export interface SandboxMaterialRequest {
  timeoutMs?: number;
  textFormat?: 'text' | 'markdown';
  pdfMode?: 'text' | 'ocr';
  ocrLanguages?: Array<'zh-Hans' | 'zh-Hant' | 'en-US'>;
}

/** What a statement in the project's library takes and gives back across the channel: no BLOBs, no integers past 2^53. */
export type SandboxSqlValue = null | number | string;
export type SandboxSqlRow = { [column: string]: SandboxSqlValue };
export interface SandboxSqlStatement { sql: string; parameters?: SandboxSqlValue[] }

export interface SandboxSdk {
  storage: {
    get(key: string): Promise<SandboxJson>;
    set(key: string, value: SandboxJson): Promise<void>;
    delete(key: string): Promise<void>;
    list(prefix?: string): Promise<Array<{ key: string; value: SandboxJson }>>;
  };
  artifacts: {
    get(reference: { artifact_id: string; version: number }): Promise<SandboxJson>;
    put(value: SandboxJson): Promise<SandboxJson>;
  };
  capability: { call(id: string, input: SandboxJson): Promise<SandboxJson> };
  events: { publish(id: string, payload: SandboxJson): Promise<void> };
  network: { request(request: SandboxNetworkRequest): Promise<SandboxNetworkResponse> };
  resource: { read(name: string): Promise<string> };
  /**
   * The plugin's own tables in the project's library. The Host checks every statement against the tables the plugin's Manifest
   * declares: a read is one `SELECT` or `WITH`, and `transaction` runs `INSERT`, `UPDATE` or `DELETE` statements in one write
   * transaction on the Host's side, all of them or none.
   */
  projectDatabase: {
    get(sql: string, parameters?: SandboxSqlValue[]): Promise<SandboxSqlRow | null>;
    all(sql: string, parameters?: SandboxSqlValue[]): Promise<SandboxSqlRow[]>;
    transaction(statements: SandboxSqlStatement[]): Promise<Array<{ changes: number }>>;
  };
  /**
   * Requests through the account the person bound to one of the Manifest's connection slots. The credential never reaches the plugin and
   * only the slot's service can be reached; a query may only send `GET` and `HEAD`. Declare the slot in the operation's `effects.connections`.
   */
  connections: { request(slot_id: string, request: SandboxConnectionRequest): Promise<SandboxConnectionResponse> };
  /**
   * The Host's readers of files the plugin already holds (`services.materials`): `readDocuments` reads Markdown, HTML, text, CSV, DOCX or
   * a ZIP of those, `extract` reads one file (PDF, image, office document) as text, `imageTextAvailable` says whether an image's text can
   * be read on this machine now. Declare `effects.materials: ['read']` on the operation. A file and a result cross as JSON, so a read
   * is bounded by the channel (half of 1 MiB for the result); pages and the Host's helpers are not the plugin's to choose.
   */
  materials: {
    imageTextAvailable(): Promise<boolean>;
    readDocuments(files: SandboxMaterialFile[], request?: Pick<SandboxMaterialRequest, 'timeoutMs'>): Promise<import('../services/materials.js').MaterialDocumentBatch>;
    extract(file: SandboxMaterialFile, request?: SandboxMaterialRequest): Promise<import('../services/materials.js').MaterialExtraction>;
  };
  /** The platform's question card, action card and next-step row as html, in the call's language (`services.interaction`); nothing to declare. */
  interaction: import('./plugin-interaction.js').PluginInteractionClient;
}

export type SandboxOperations = Record<string, (input: SandboxJson, sdk: SandboxSdk) => Promise<SandboxJson>>;
export type SandboxSdkMethod = 'storage.get' | 'storage.set' | 'storage.delete' | 'storage.list'
  | 'artifacts.get' | 'artifacts.put' | 'capability.call' | 'events.publish' | 'network.request' | 'resource.read'
  | 'projectDatabase.get' | 'projectDatabase.all' | 'projectDatabase.transaction' | 'connections.request'
  | 'materials.imageTextAvailable' | 'materials.readDocuments' | 'materials.extract'
  | 'interaction.questionHtml' | 'interaction.cardHtml' | 'interaction.nextStepsHtml';

/** Only one active operation per channel. Every host request belongs to that invocation. */
export type SandboxWorkerMessage =
  | { type: 'ready'; operations: string[] }
  | { type: 'result'; id: string; value: SandboxJson }
  | { type: 'error'; id: string; code: string; message: string }
  | { type: 'sdk'; id: string; callId: string; method: SandboxSdkMethod; args: SandboxJson[] };
export type SandboxHostMessage =
  | { type: 'call'; id: string; operationId: string; input: SandboxJson }
  | { type: 'sdk-result'; id: string; value: SandboxJson }
  | { type: 'sdk-error'; id: string; code: string; message: string };
