import type {
  ModelApiFormat,
  ModelProviderHealth,
  ModelProviderRecord,
  ModelPromptCacheMode,
  ModelRecord,
} from "@molis-ai/molis-work-contracts/modules/model-providers";
import {
  inspectPromptCacheChoice,
  providerHealth,
} from "@molis-ai/molis-work-contracts/modules/model-providers";

/**
 * Where configured model providers live.
 *
 * The records sit in the Home catalog because a provider is a property of this
 * installation, not of one project. The **key never touches this table**: it
 * goes to the secret store under `credential_ref`, and the table only carries
 * that reference. Anything that reads providers — settings, logs, exports —
 * therefore cannot leak a credential.
 */

export interface ModelProviderSqlite {
  exec(sql: string): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
}

/** The slice of the Host's secret store this needs. */
export interface ModelSecretPort {
  put(authRef: string, plaintext: string): void;
  get(authRef: string): string | null;
  delete(authRef: string): void;
}

export class ModelProviderError extends Error {
  constructor(
    readonly code: "model-provider.unknown" | "model-provider.invalid",
    message: string,
  ) {
    super(message);
    this.name = "ModelProviderError";
  }
}

export function createModelProviderTables(db: ModelProviderSqlite): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_providers (
      provider_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_format TEXT NOT NULL,
      credential_ref TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      prompt_cache TEXT NOT NULL DEFAULT 'off',
      models_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS model_providers_enabled_idx
      ON model_providers(enabled, display_name);
  `);
  addPromptCacheColumn(db);
}

/**
 * Add `prompt_cache` to a table that predates it.
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, and the table may or may not
 * already have it depending on when the catalog was created — so this asks
 * first and does nothing when it is there. Existing rows default to `off`,
 * which is the mode that behaves as if caching had never been added.
 */
export function addPromptCacheColumn(db: ModelProviderSqlite): void {
  const columns = db.prepare("PRAGMA table_info(model_providers)").all() as Array<{ name?: unknown }>;
  if (columns.some((column) => String(column.name) === "prompt_cache")) return;
  db.exec("ALTER TABLE model_providers ADD COLUMN prompt_cache TEXT NOT NULL DEFAULT 'off'");
}

/** The reference a provider's key is stored under. Derived, never user supplied. */
export function modelCredentialRef(providerId: string): string {
  return `model-provider:${providerId}`;
}

const API_FORMATS: readonly ModelApiFormat[] = ["anthropic-messages", "openai-chat-completions"];
const PROMPT_CACHE_MODES: readonly ModelPromptCacheMode[] = ["off", "best-effort", "required"];
const PROVIDER_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;

type Row = Record<string, unknown>;

function mapProvider(row: Row): ModelProviderRecord {
  let models: ModelRecord[] = [];
  try {
    const parsed: unknown = JSON.parse(String(row.models_json ?? "[]"));
    if (Array.isArray(parsed)) models = parsed as ModelRecord[];
  } catch {
    // A row whose model list cannot be read still describes a real provider.
    // Dropping the provider would hide it from settings, where it can be fixed.
    models = [];
  }
  return {
    provider_id: String(row.provider_id),
    display_name: String(row.display_name),
    base_url: String(row.base_url),
    api_format: String(row.api_format) as ModelApiFormat,
    credential_ref: String(row.credential_ref),
    enabled: Number(row.enabled) === 1,
    // A row written before this column existed, or holding something this build
    // does not recognise, reads as `off` — the mode that behaves as if caching
    // were not there. Guessing `best-effort` would turn an old row into a
    // request nobody made.
    prompt_cache: PROMPT_CACHE_MODES.includes(row.prompt_cache as ModelPromptCacheMode)
      ? row.prompt_cache as ModelPromptCacheMode
      : "off",
    models,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export interface ModelProviderStoreOptions {
  db: ModelProviderSqlite;
  secrets: ModelSecretPort;
  now?: () => Date;
}

export class ModelProviderStore {
  readonly #db: ModelProviderSqlite;
  readonly #secrets: ModelSecretPort;
  readonly #now: () => Date;

  constructor(options: ModelProviderStoreOptions) {
    this.#db = options.db;
    this.#secrets = options.secrets;
    this.#now = options.now ?? (() => new Date());
    createModelProviderTables(this.#db);
  }

  list(): ModelProviderRecord[] {
    return (this.#db.prepare(
      "SELECT * FROM model_providers ORDER BY display_name, provider_id",
    ).all() as Row[]).map(mapProvider);
  }

  get(providerId: string): ModelProviderRecord | null {
    const row = this.#db.prepare(
      "SELECT * FROM model_providers WHERE provider_id = ?",
    ).get(providerId) as Row | undefined;
    return row ? mapProvider(row) : null;
  }

  upsert(input: {
    provider_id: string;
    display_name: string;
    base_url: string;
    api_format: ModelApiFormat;
    enabled?: boolean;
    prompt_cache?: ModelPromptCacheMode;
    models?: readonly ModelRecord[];
  }): ModelProviderRecord {
    if (!PROVIDER_ID.test(input.provider_id)) {
      throw new ModelProviderError("model-provider.invalid", `供应商 id 不合法：${input.provider_id}`);
    }
    if (!API_FORMATS.includes(input.api_format)) {
      throw new ModelProviderError("model-provider.invalid", `不认识的 API 格式：${input.api_format}`);
    }
    if (input.base_url.trim() === "") {
      throw new ModelProviderError("model-provider.invalid", "Base URL 不能为空");
    }
    const at = this.#now().toISOString();
    const existing = this.get(input.provider_id);
    const promptCache = input.prompt_cache ?? existing?.prompt_cache ?? "off";
    if (!PROMPT_CACHE_MODES.includes(promptCache)) {
      throw new ModelProviderError("model-provider.invalid", `不认识的缓存档位：${promptCache}`);
    }
    // Refused here, while the user is looking at the field they just changed —
    // not at the first Run, days later, on a different screen.
    const cacheProblem = inspectPromptCacheChoice({
      api_format: input.api_format,
      prompt_cache: promptCache,
    });
    if (cacheProblem !== null) {
      throw new ModelProviderError("model-provider.invalid", cacheProblem);
    }
    const record: ModelProviderRecord = {
      provider_id: input.provider_id,
      display_name: input.display_name.trim() === "" ? input.provider_id : input.display_name.trim(),
      base_url: input.base_url.trim().replace(/\/+$/u, ""),
      api_format: input.api_format,
      credential_ref: modelCredentialRef(input.provider_id),
      enabled: input.enabled ?? existing?.enabled ?? true,
      prompt_cache: promptCache,
      models: [...(input.models ?? existing?.models ?? [])],
      created_at: existing?.created_at ?? at,
      updated_at: at,
    };
    this.#db.prepare(`
      INSERT INTO model_providers
        (provider_id, display_name, base_url, api_format, credential_ref, enabled, prompt_cache, models_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id) DO UPDATE SET
        display_name = excluded.display_name,
        base_url = excluded.base_url,
        api_format = excluded.api_format,
        enabled = excluded.enabled,
        prompt_cache = excluded.prompt_cache,
        models_json = excluded.models_json,
        updated_at = excluded.updated_at
    `).run(
      record.provider_id, record.display_name, record.base_url, record.api_format,
      record.credential_ref, record.enabled ? 1 : 0, record.prompt_cache,
      JSON.stringify(record.models), record.created_at, record.updated_at,
    );
    return record;
  }

  /**
   * Remove a provider **and its key**.
   *
   * Deleting the row alone would leave the secret behind with nothing pointing
   * at it: invisible in settings, still on disk, and re-adopted by the next
   * provider that happens to take the same id.
   */
  remove(providerId: string): boolean {
    const existing = this.get(providerId);
    if (existing === null) return false;
    this.#db.prepare("DELETE FROM model_providers WHERE provider_id = ?").run(providerId);
    this.#secrets.delete(existing.credential_ref);
    return true;
  }

  setCredential(providerId: string, plaintext: string): void {
    const existing = this.get(providerId);
    if (existing === null) {
      throw new ModelProviderError("model-provider.unknown", `找不到供应商：${providerId}`);
    }
    if (plaintext.trim() === "") {
      throw new ModelProviderError("model-provider.invalid", "API Key 不能是空的");
    }
    this.#secrets.put(existing.credential_ref, plaintext.trim());
  }

  /** Whether a key is really stored. Asked of the secret store, never cached on the row. */
  hasCredential(providerId: string): boolean {
    const existing = this.get(providerId);
    if (existing === null) return false;
    const value = this.#secrets.get(existing.credential_ref);
    return typeof value === "string" && value.trim() !== "";
  }

  health(): ModelProviderHealth[] {
    return this.list().map((provider) =>
      providerHealth(provider, this.hasCredential(provider.provider_id)));
  }

  /**
   * The configuration one Run needs, or null when nothing usable is configured.
   *
   * Returns null rather than a half-filled object: a caller that got a record
   * with an empty key would fail at the provider instead of at setup, where the
   * user can actually fix it.
   */
  resolveConfiguration(input?: { provider_id?: string; model_id?: string }): {
    provider: ModelProviderRecord;
    model: ModelRecord;
    api_key: string;
  } | null {
    const candidates = input?.provider_id === undefined
      ? this.list()
      : [this.get(input.provider_id)].filter((entry): entry is ModelProviderRecord => entry !== null);
    for (const provider of candidates) {
      if (!provider.enabled) continue;
      const apiKey = this.#secrets.get(provider.credential_ref);
      if (typeof apiKey !== "string" || apiKey.trim() === "") continue;
      const model = provider.models.find((entry) =>
        entry.enabled && (input?.model_id === undefined || entry.model_id === input.model_id));
      if (model === undefined) continue;
      return { provider, model, api_key: apiKey };
    }
    return null;
  }
}
