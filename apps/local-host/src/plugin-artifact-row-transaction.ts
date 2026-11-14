import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type {
  PluginArtifactClient, PluginArtifactWriter, PluginDatabase, PluginDatabaseTransaction, PluginInstanceRecord, PluginProjectRowTransaction,
  PluginSqlRow, PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  assertCapturedPluginActionCurrent, currentPluginAction, insideOpenPluginCall, pluginInvocationReadOnly, runInPluginAction,
} from "@molis-ai/molis-work-plugin-runtime";

/** The storage owner binds the project and exposes only the selected row on the live joined connection. */
export interface ArtifactRootStore {
  readonly readPermission: string;
  readonly writePermission: string;
  transaction(id: string, run: (row: ArtifactRootRow) => void): void;
}

export interface ArtifactRootRow {
  readonly inTransaction: boolean;
  read(): PluginSqlRow | null;
  compareAndSet(expectedVersion: number, artifact: ArtifactReference, changes: Readonly<PluginSqlRow>, check: () => void): boolean;
}

type Scope = NonNullable<ReturnType<typeof currentPluginAction>>;
type Handle = PluginDatabaseTransaction | PluginProjectRowTransaction;
type Pin = Readonly<ArtifactReference> & { readonly revision: string };
interface State {
  join<T>(write: (writer: PluginArtifactWriter) => T): T;
}
type WriterFactory = (permit: () => void, author: () => string) => PluginArtifactWriter;
const forbidden = () => new ActionError("actions.forbidden", "需要此插件当前项目中仍在执行的成果固定事务");
const incomplete = () => new ActionError("actions.conflict", "固定成果必须同时写入一个新版本与它的源记录");

interface Authority {
  readonly context: PluginStartContext;
  readonly projectId: string;
  readonly assertActive: () => void;
  readonly assertOwner: () => void;
  readonly assertProject: () => Promise<void>;
  readonly record: () => PluginInstanceRecord | null;
}

function originalAuthority(authority: Authority, store: ArtifactRootStore) {
  const { context, projectId, assertActive, record } = authority;
  const permissions = [...new Set([store.readPermission, store.writePermission, "artifact:write"])];
  const grants = ["storage:private", ...permissions];
  const check = (scope: Scope) => {
    assertActive();
    const current = record();
    if (current?.state !== "running" || current.installation_generation !== context.installation_generation || !grants.every(grant => current.grants.includes(grant))) {
      throw forbidden();
    }
    for (const grant of grants) context.requireGrant(grant);
    assertCapturedPluginActionCurrent(scope, context);
  };
  const start = () => {
    const scope = currentPluginAction();
    if (!scope || !insideOpenPluginCall() || pluginInvocationReadOnly(scope) || scope.caller.project_id !== projectId
      || scope.definition.operation !== "command" || scope.definition.action.scheduling !== "concurrent"
      || !permissions.every(permission => scope.definition.action.permissions.includes(permission))) throw forbidden();
    check(scope);
    return scope;
  };
  return { start, check };
}

function openRowHandle(active: WeakMap<Handle, State>, row: ArtifactRootRow, writer: WriterFactory, scope: Scope, id: string, permit: () => void) {
  const child = currentPluginAction();
  let alive = true, failed = false, pinStarted = false, updateStarted = false, updated = false;
  let pin: Pin | undefined;
  const checkTransaction = () => {
    if (!row.inTransaction || currentPluginAction() !== child || !insideOpenPluginCall()) throw forbidden();
    permit();
  };
  const check = () => { if (!alive) throw forbidden(); checkTransaction(); };
  const handle: PluginProjectRowTransaction = Object.freeze<PluginProjectRowTransaction>({
    read() { check(); return row.read(); },
    compareAndSet(expected, changes) {
      check();
      if (updateStarted || !pin) { failed = true; throw incomplete(); }
      updateStarted = true;
      try {
        updated = Number.isSafeInteger(expected) && expected > 0 && String(expected) === pin.revision
          && row.compareAndSet(expected, pin, changes, check);
        return updated;
      } finally { if (!updated) failed = true; }
    },
  });
  active.set(handle, {
    join<T>(write: (writer: PluginArtifactWriter) => T): T {
      check();
      let writing = true;
      const permitWriter = () => { if (!writing) throw forbidden(); check(); };
      const artifactWriter = writer(permitWriter, () => scope.caller.actor_id);
      const bound = Object.freeze<PluginArtifactWriter>({
        head: artifactWriter.head,
        publish(input) {
          permitWriter();
          if (pinStarted) { failed = true; throw incomplete(); }
          pinStarted = true;
          try {
            const result = artifactWriter.publish(input);
            const { origin, artifact_id, version } = result.artifact;
            if (result.replayed || origin.kind !== "pinned" || origin.subject.id !== id || !scope.definition.action.subject_kinds.includes(origin.subject.kind)) throw incomplete();
            pin = { artifact_id, version, revision: origin.revision };
            return result;
          } finally { if (!pin) failed = true; }
        },
      });
      try {
        const raw = write(bound);
        writing = false;
        const result = requireSynchronous(raw, "固定成果回调必须同步完成");
        check();
        return result;
      } catch (error) { failed = true; throw error; }
      finally { writing = false; }
    },
  });
  return {
    handle,
    finish() { checkTransaction(); if (failed || !pin || !updated) throw incomplete(); },
    close() { alive = false; active.delete(handle); },
  };
}

/** Adds the Home row path to the normal clients. Ordinary Home and Feed transactions keep their existing bindings. */
export function withArtifactRootStore(database: PluginDatabase, artifacts: PluginArtifactClient, writer: WriterFactory, store: ArtifactRootStore, authority: Authority) {
  const active = new WeakMap<Handle, State>(), control = originalAuthority(authority, store);
  return {
    database: Object.freeze<PluginDatabase>({ ...database,
      async transactionProjectRow<T>(id: string, write: (tx: PluginProjectRowTransaction) => T): Promise<T> {
        if (typeof id !== "string" || id.length === 0) throw new ActionError("actions.input_invalid", "固定成果需要源记录 ID");
        const scope = control.start();
        const checkAfterWait = () => {
          if (currentPluginAction() !== scope || !insideOpenPluginCall()) throw forbidden();
          control.check(scope);
          authority.assertOwner();
        };
        await scope.caller.beforeEffect();
        checkAfterWait();
        await authority.assertProject();
        checkAfterWait();
        const caller = { ...scope.caller, read_only_effects: true as const, query_only: true as const,
          beforeEffect: async () => { throw forbidden(); }, retainAuthority: undefined, retainBackgroundAuthority: undefined, retain_background_authority: undefined };
        let result!: T;
        runInPluginAction({ ...scope, caller }, () => {
          store.transaction(id, row => {
            const tx = openRowHandle(active, row, writer, scope, id, () => control.check(scope));
            let raw: T;
            try { raw = write(tx.handle); } finally { tx.close(); }
            // Getters on plugin-owned results run under the read-only scope after the write handles expired.
            result = structuredClone(requireSynchronous(raw, "固定成果事务必须同步完成"));
            authority.assertOwner();
            tx.finish();
          });
        });
        return result;
      },
    }),
    artifacts: Object.freeze<PluginArtifactClient>({ ...artifacts,
      join<T>(tx: Handle, write: (writer: PluginArtifactWriter) => T): T {
        const state = active.get(tx);
        if (!state) {
          if (artifacts.join) return artifacts.join(tx, write);
          throw forbidden();
        }
        return state.join(write);
      },
    }),
  };
}
