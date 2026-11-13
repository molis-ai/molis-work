import type { MolisWorkRuntimeContextUnbindResult } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

export const bindingErrors = defineErrorCodes("work.context", {
  user_confirmation_required: "invalid",
  suggestion_not_available: "invalid",
  workspace_default_unsupported: "invalid",
  workspace_required: "invalid",
  idempotency_conflict: "invalid",
  rebind_confirmation_required: "invalid",
  stable_identity_required: "invalid",
  idempotency_key_required: "invalid",
  project_relation_missing: "invalid",
  person_relation_kept: "invalid",
});

/** Not thrown: nothing failed, the tool is told why nothing was unlinked and what to pass on to the person. */
export function personRelationKept(): NonNullable<MolisWorkRuntimeContextUnbindResult["kept"]> {
  const { code, message } = bindingErrors.person_relation_kept("这个目录关系是用户本人建的，工具解除不了；请告诉用户到项目设置里解除");
  return { code: code as "work.context.person_relation_kept", message };
}
