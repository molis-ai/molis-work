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
  /**
   * `read`: the Host's document and file readers (`sdk.materials`); the plugin's package also declares `materials:read`.
   * `fetch`: `readSource`, a public https page the Host reads and answers as text (`materials:fetch`); the operation also names the page's host in
   * `networkDomains`, because the person approves a page's host the way they approve a network request's.
   * `fetch_local`: `readLocalPage`, a page on this machine that the Host fetches and answers as extracted text (`materials:fetch_local`).
   * `original`: `claimOriginal`, `readOriginal` and `releaseOriginal`, the file the person handed the Host's entry, by the plugin's own key
   * (`materials:original`). The last two are never in a query.
   */
  materials?: Array<'read' | 'fetch' | 'fetch_local' | 'original'>;
  /**
   * `read`: `stat`, `list` and `read` of the files the plugin's Manifest declares (`owner_files`, PG-017 P2c); `write`: `write`, never in a query.
   * The package also declares `storage:private` and the Manifest's read and write permissions.
   */
  ownerFiles?: Array<'read' | 'write'>;
  /**
   * `read`: `choices` and `availability` of the Host's text model (`sdk.model`, PG-017 P1); `invoke`: `complete`, which spends the person's model
   * and is never in a query. The package also declares `model:read` or `model:invoke`; `complete` runs only inside one of its own concurrent
   * actions that declares `model:invoke`.
   */
  model?: Array<'read' | 'invoke'>;
  /**
   * The ids of this contract's command operations the operation may start in the background (`sdk.background.start`, PG-017 P3). Each is a
   * command of its own with no `background` effect, and the operation that starts it is a command too. The package also declares the Manifest's
   * `background_job` metadata on the action that runs the starting operation.
   */
  background?: string[];
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
  /** Which record's account, on a `per_record` slot (and only there). */
  record_key?: string;
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
/** Whether a slot (a record's, on a `per_record` slot) has an account, its name and state; never which connection or a credential. */
export interface SandboxConnectionDescription {
  bound: boolean;
  display_name?: string;
  state?: 'connected' | 'reauth_required' | 'disconnected';
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
/**
 * What `extract` answers, as plain JSON. These are the sandbox's own types, not the Host's `MaterialExtraction`: the declarations a generated
 * plugin is compiled against must stand alone (the isolated compiler has no DOM or Node library, and the Host's service types name a
 * DOM global). The broker passes the Host's answer through `extractionJson`, so a Host type that drifts away from this one stops the build.
 */
export interface SandboxMaterialExtraction {
  text: string;
  title?: string;
  extractor: string;
  pages: Array<{ number: number; text: string; method: string; confidence: number | null; lines?: Array<{ text: string; confidence: number | null }> }>;
  segments?: Array<{ start_seconds: number; end_seconds: number; text: string }>;
  frames?: Array<{ seconds: number; text: string; confidence?: number | null }>;
  duration_seconds?: number;
  coverage: { status: 'sufficient' | 'partial' | 'insufficient'; truncated?: boolean; processed_pages: number; total_pages: number; issues: string[] };
}
/** What `readSource` answers, as plain JSON: the page's text with where it came from (see `SandboxMaterialExtraction`). */
export interface SandboxMaterialSourceContent {
  text: string;
  title?: string;
  source_url: string;
  provider: string;
  extractor: string;
  coverage: SandboxMaterialExtraction['coverage'];
  pages?: SandboxMaterialExtraction['pages'];
  segments?: SandboxMaterialExtraction['segments'];
  frames?: SandboxMaterialExtraction['frames'];
  model_required?: { approximate_bytes?: number; variant?: string };
}
/** What `readDocuments` answers, as plain JSON (see `SandboxMaterialExtraction`). */
export interface SandboxMaterialDocumentBatch {
  documents: Array<{ name: string; format: 'markdown' | 'html' | 'text' | 'csv'; content: string; coverage: { status: 'sufficient' | 'partial' | 'insufficient'; issues: string[]; truncated?: boolean } }>;
  warnings: string[];
}

/**
 * One file or folder of the plugin's own files (`owner_files`) as it crosses the channel. A path is relative to the files' root, `/`-separated,
 * and starts with one of the top-level entries the Manifest declares; the Host refuses anything else, links and special nodes included.
 */
export type SandboxOwnerFileInfo = { kind: 'file'; byte_length: number } | { kind: 'directory' };
export interface SandboxOwnerFileEntry { name: string; kind: 'file' | 'directory' }
/** A file's bytes as base64; one file is at most 256 KiB, so a read fits the channel. */
export interface SandboxOwnerFileContent { data_base64: string; byte_length: number }
/** One step of a write; the steps of one call run in order on the Host's side and stop at the first one it refuses. */
export type SandboxOwnerFileChange =
  | { op: 'mkdir'; path: string }
  | { op: 'write'; path: string; data_base64: string; mode: 'create' | 'replace' }
  | { op: 'replace_atomic'; path: string; data_base64: string }
  | { op: 'copy'; from: string; to: string }
  | { op: 'remove'; path: string }
  | { op: 'set_access'; path: string; access: 'readonly' | 'readwrite' };

/** One part of an original file as it crosses the channel: at most 256 KiB of bytes, the file's size and the opaque revision a later part passes back. */
export interface SandboxOriginalPart { data_base64: string; byte_length: number; size: number; revision: string }

/** A model the person configured in this Home, as it crosses the channel: names and capabilities, never an endpoint or a credential. */
export interface SandboxModelSelection { provider_id: string; model_id: string }
export interface SandboxModelChoice extends SandboxModelSelection { label: string; vision: boolean; reasoning_effort: boolean }
export type SandboxModelAvailability =
  | { available: true; runtime_label?: string; vision?: boolean }
  | { available: false; code: string; reason: string; runtime_label?: string; vision?: boolean };
/**
 * One request to the model. The text is never the package's own: `prompt_id` names one of the instructions the package registered with the Host
 * (`PluginDefinition.instructions`), whose body is the person's version of it, and `data` is this call's material, appended after it by the Host.
 * `system_id` names a second registered instruction, sent as the system prompt. No images, callbacks or signals cross the channel.
 */
export interface SandboxModelRequest {
  prompt_id: string;
  data: string;
  system_id?: string;
  selection?: SandboxModelSelection;
  /** `json`: the answer is decoded and handed over as `value` too; the plugin checks its shape. The default is `text`. */
  output?: 'text' | 'json';
  timeout_ms?: number;
  max_output_tokens?: number;
}
export interface SandboxModelResult { text: string; value?: SandboxJson; usage?: { input_tokens: number; output_tokens: number } }

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
   * `describe` tells whether there is an account; `release` unbinds a record's account on a `per_record` slot (not from a query).
   */
  connections: {
    request(slot_id: string, request: SandboxConnectionRequest): Promise<SandboxConnectionResponse>;
    describe(slot_id: string, record_key?: string): Promise<SandboxConnectionDescription>;
    release(slot_id: string, record_key: string): Promise<void>;
  };
  /**
   * The Host's readers of files the plugin already holds (`services.materials`): `readDocuments` reads Markdown, HTML, text, CSV, DOCX or
   * a ZIP of those, `extract` reads one file (PDF, image, office document) as text, `imageTextAvailable` says whether an image's text can
   * be read on this machine now. Declare `effects.materials: ['read']` on the operation. A file and a result cross as JSON, so a read
   * is bounded by the channel (half of 1 MiB for the result); pages and the Host's helpers are not the plugin's to choose.
   * `readSource` (`effects.materials: ['fetch']`) reads a public https page for its text: the page's host must be one of the operation's approved
   * `networkDomains`, and the read (its redirects, and the interfaces and media of sites the Host knows) goes to those hosts only.
   * `readLocalPage` (`effects.materials: ['fetch_local']`) is a page on this machine: the plugin names an address as data, the Host decides
   * whether it may be read (plain HTTP to a loopback name, never the Host's own ports) and fetches it, and only the extracted text comes back.
   * `claimOriginal`, `readOriginal` and `releaseOriginal` (`effects.materials: ['original']`) keep, read and forget the file the person handed
   * the Host's entry, by a key the plugin chooses; no path is ever shown, and `readOriginal` takes the file (at most 32 MiB, or `maxBytes`) in
   * parts over the channel, each part checked by the Host, the whole refused if the file changes meanwhile. Neither is allowed in a query.
   */
  materials: {
    imageTextAvailable(): Promise<boolean>;
    readDocuments(files: SandboxMaterialFile[], request?: Pick<SandboxMaterialRequest, 'timeoutMs'>): Promise<SandboxMaterialDocumentBatch>;
    extract(file: SandboxMaterialFile, request?: SandboxMaterialRequest): Promise<SandboxMaterialExtraction>;
    readSource(url: string): Promise<SandboxMaterialSourceContent>;
    readLocalPage(url: string): Promise<SandboxMaterialExtraction>;
    claimOriginal(record_key: string): Promise<void>;
    readOriginal(record_key: string, request?: { maxBytes?: number }): Promise<{ bytes: Uint8Array }>;
    releaseOriginal(record_key: string): Promise<void>;
  };
  /**
   * The plugin's own files, the ones its Manifest declares (`owner_files`): by relative path only, never the folder's location. `read` is
   * one file of at most 256 KiB (`null` when there is none); `write` takes up to 16 steps and 512 KiB of bytes at once, each file at most
   * 256 KiB. Declare `effects.ownerFiles: ['read']` or `['read', 'write']` on the operation; a query cannot write.
   */
  ownerFiles: {
    stat(path: string): Promise<SandboxOwnerFileInfo | null>;
    list(path: string): Promise<SandboxOwnerFileEntry[]>;
    read(path: string): Promise<SandboxOwnerFileContent | null>;
    write(changes: SandboxOwnerFileChange[]): Promise<void>;
  };
  /**
   * The Host's text model (`services.model`, PG-017 P1). `choices` and `availability` need `effects.model: ['read']`; `complete` needs `['invoke']`, in a
   * command only, and the Host runs it inside the operation's own concurrent action that declares `model:invoke`. A request names a registered
   * instruction instead of carrying text (see `SandboxModelRequest`), so nothing the package writes reaches the model except as data after it.
   */
  model: {
    choices(): Promise<SandboxModelChoice[]>;
    availability(selection?: SandboxModelSelection): Promise<SandboxModelAvailability>;
    complete(request: SandboxModelRequest): Promise<SandboxModelResult>;
  };
  /**
   * Background work (`services.background`, PG-017 P3). `start` accepts one run of a command operation the calling operation declared in
   * `effects.background`, with a JSON input, and returns its execution id as soon as the Host has accepted it; the run happens in a second
   * sandbox process of the same package, one operation at a time, so it never holds up the operations of the first. Nothing carries its
   * result back: the operation writes what it means to keep through the SDK, and it is not replayed if its process dies. `cancel` stops an
   * execution this sandbox accepted (`false` for one that has already ended). The Host stops every execution when the installation stops,
   * is revoked, or its project is deleted, and an execution that is stopped writes nothing more.
   */
  background: {
    start(operation: string, input: SandboxJson): Promise<string>;
    cancel(id: string): Promise<boolean>;
  };
  /** The platform's question card, action card and next-step row as html, in the call's language (`services.interaction`); nothing to declare. */
  interaction: import('./plugin-interaction.js').PluginInteractionClient;
}

export type SandboxOperations = Record<string, (input: SandboxJson, sdk: SandboxSdk) => Promise<SandboxJson>>;
export type SandboxSdkMethod = 'storage.get' | 'storage.set' | 'storage.delete' | 'storage.list'
  | 'artifacts.get' | 'artifacts.put' | 'capability.call' | 'events.publish' | 'network.request' | 'resource.read'
  | 'projectDatabase.get' | 'projectDatabase.all' | 'projectDatabase.transaction' | 'connections.request' | 'connections.describe' | 'connections.release'
  | 'materials.imageTextAvailable' | 'materials.readDocuments' | 'materials.extract' | 'materials.readSource' | 'materials.readLocalPage'
  | 'materials.claimOriginal' | 'materials.readOriginalRange' | 'materials.releaseOriginal'
  | 'ownerFiles.stat' | 'ownerFiles.list' | 'ownerFiles.read' | 'ownerFiles.write'
  | 'model.choices' | 'model.availability' | 'model.complete'
  | 'background.start' | 'background.cancel'
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
