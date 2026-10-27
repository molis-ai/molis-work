import { ActionError, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalEntryActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import type { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";

type Reference = Parameters<MolisWorkLocalHost["withProject"]>[0];

/** A library the test made itself becomes a project the platform runs plugins in once it holds the root row a catalog gives every project. */
export async function ensureProjectRoot(host: MolisWorkLocalHost, reference: Reference): Promise<void> {
  await host.withProject(reference, runtime => { writeProjectRoot(runtime.store.db, reference.project_id, new Date().toISOString()); });
}

/**
 * A project's board the way the product makes one (PG-094 S12: the Host holds no Goals application to ask): the library's root row,
 * then Goals' own `goals.board.initialize` as the person at a management entrance. Goals makes the board itself when it starts over a
 * library that has the root row, so a board that is already there is left as it is.
 */
export async function initializeBoard(host: MolisWorkLocalHost, reference: Reference, options: { actor_id?: string; idempotency_key?: string } = {}): Promise<void> {
  await ensureProjectRoot(host, reference);
  const person: ActionCallContext = { actor_id: options.actor_id ?? "owner", actor_kind: "user", audience: "user", project_id: reference.project_id,
    permissions: ["goals:read", "goals:write"], user_action: { source: "management", conversation_ref: "test://board", message_ref: "test://board-initialize" } };
  try {
    await bindActionClient(host.actionClient(reference), () => person).invoke(goalEntryActions.initialize, { idempotency_key: options.idempotency_key ?? "init" });
  } catch (error) {
    if (!(error instanceof ActionError && error.code === "goals.board.exists")) throw error;
  }
}
