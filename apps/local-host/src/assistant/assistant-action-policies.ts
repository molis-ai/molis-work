import { createHash } from "node:crypto";
import { rollbackPreservingError, type openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { assistantErrors } from "./assistant-errors.js";

type DatabaseSync = ReturnType<typeof openHomeSqliteDatabase>;

/** Per-action Assistant access and confirmation switches stored in `assistant_settings`, with in-memory revocation fences. */
export class AssistantActionPolicies {
  readonly #changes = new Map<string, { access?: object; confirmation?: object }>();

  constructor(private readonly db: DatabaseSync, private readonly setSetting: (actorId: string, key: string, value: string) => void) {}

  read(actorId: string) {
    const rows = this.db.prepare("SELECT key, value, revision FROM assistant_settings WHERE actor_id=? AND key IN ('disabled_actions', 'confirm_always')").all(actorId);
    const values = (name: string) => {
      const row = rows.find(item => item.key === name);
      return { keys: new Set(JSON.parse(String(row?.value ?? "[]")) as string[]), revision: Number(row?.revision ?? 0) };
    };
    const disabled = values("disabled_actions"), confirmation = values("confirm_always");
    return { disabled: disabled.keys, confirmation: confirmation.keys, forAction: (key: string) => ({
      enabled: !disabled.keys.has(key), confirm_always: confirmation.keys.has(key),
      expected: createHash("sha256").update(JSON.stringify([actorId, key, disabled.revision, confirmation.revision])).digest("hex"),
    }) };
  }

  /** Both switches belong to this exact action and change under one check on the original settings rows. */
  change(actorId: string, key: string, input: { expected: string; enabled?: boolean; confirm_always?: boolean }, assertCurrent: () => void) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const policies = this.read(actorId), current = policies.forAction(key);
      if (input.expected !== current.expected) throw assistantErrors.conflict("这项能力的授权已变化，请刷新后再决定", { current });
      const enabled = input.enabled ?? current.enabled, confirm = input.confirm_always ?? current.confirm_always;
      assertCurrent();
      const update = (name: string, keys: Set<string>, add: boolean) => {
        if (add) keys.add(key); else keys.delete(key);
        this.setSetting(actorId, name, JSON.stringify([...keys].sort()));
      };
      if (enabled !== current.enabled) update("disabled_actions", policies.disabled, !enabled);
      if (confirm !== current.confirm_always) update("confirm_always", policies.confirmation, confirm);
      this.db.exec("COMMIT");
      if (enabled !== current.enabled) this.recordChange(actorId, key, "access");
      if (confirm !== current.confirm_always) this.recordChange(actorId, key, "confirmation");
      return this.read(actorId).forAction(key);
    } catch (error) { rollbackPreservingError(error, () => this.db.exec("ROLLBACK")); throw error; }
  }

  recordChange(actorId: string, key: string, field: "access" | "confirmation"): void {
    const id = JSON.stringify([actorId, key]);
    this.#changes.set(id, { ...this.#changes.get(id), [field]: {} });
  }

  /** An old action approval remains revoked even after the person turns the same switch back on. */
  hold(actorId: string, key: string, includeConfirmation = false): () => void {
    const id = JSON.stringify([actorId, key]), previous = this.#changes.get(id);
    return () => {
      const current = this.#changes.get(id);
      if (current?.access !== previous?.access || includeConfirmation && current?.confirmation !== previous?.confirmation) {
        throw assistantErrors.action_revoked("原操作的权限已变化，旧确认不能继续使用");
      }
    };
  }
}
