import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PlanningMethodPack, PlanningMethodPackInput } from "@molis-ai/molis-work-contracts/modules/goals";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { personalPlanningActions } from "@molis-ai/molis-work-plugin-goals";

const person: ActionCallContext = { actor_id: "owner", actor_kind: "user", audience: "user", project_id: null,
  permissions: ["goals:read", "goals:write"], user_action: { source: "management", conversation_ref: "test://planning", message_ref: "test://personal-save" } };

/** A planning method as the person's pack library holds it, however it was read (a resolved pack carries the fields the library sets). */
export type PersonalMethodSource = PlanningMethodPackInput | PlanningMethodPack;

/** Saves the person's method the way the product does (PG-094 S13): the Home half of Goals, as the person, never a catalog write. */
export async function savePersonalMethod(host: MolisWorkLocalHost, method: PersonalMethodSource): Promise<PlanningMethodPack> {
  const { scope: _scope, created_at: _created, updated_at: _updated, ...input } = method as PlanningMethodPack;
  return (await bindActionClient(host.homeActionClient(), () => person).invoke(personalPlanningActions.save, { method: input })).method;
}

/** The same, for a Home no Host has open: a Host is opened for the one save and closed again. */
export async function savePersonalMethodInHome(homeDirectory: string, method: PersonalMethodSource): Promise<PlanningMethodPack> {
  const host = new MolisWorkLocalHost({ homeDirectory, completeText: null });
  try { return await savePersonalMethod(host, method); } finally { await host.close(); }
}
