import { createHash } from "node:crypto";
import { createActionDefinition } from "@molis-ai/molis-work-plugin-sdk";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { defineErrorCodes, type InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { ONBOARDING_CODE_ROOT_TAKE_INPUT_SCHEMA, ONBOARDING_TAKE_RESULT_SCHEMA, type OnboardingTakeResult } from "@molis-ai/molis-work-contracts/platform/plugin-onboarding";
import { projectDirectories } from "./project-folders.js";
import { materialSelection } from "./materials.js";
import type { CodingActivation } from "./route-activation.js";
import { codingActions } from "./route-entry.js";
import { requireProjectRuntime, runtimeDirectory } from "./runtime-choice.js";

/**
 * Coding takes the person's code folder from onboarding (batch12-design §7.4, decision 43②): the platform finds it by the Manifest's
 * `onboarding.takes` and calls this as the person, once the folder is the project's output. Only the person can call it.
 */
export const codingOnboardingTake = createActionDefinition<InferActionInput<typeof ONBOARDING_CODE_ROOT_TAKE_INPUT_SCHEMA>, OnboardingTakeResult>("coding.onboarding.take", "command", {
  title: "从上手接手代码文件夹", description: "上手时把本人选的代码文件夹交给 Coding：新建一个会话，这一轮带来的材料放进它的下一轮",
  audiences: ["user"], permissions: ["storage:private"], subject_kinds: ["coding_session"],
  input_schema: ONBOARDING_CODE_ROOT_TAKE_INPUT_SCHEMA, output_schema: ONBOARDING_TAKE_RESULT_SCHEMA,
}, /* @version action.coding.onboarding.take */ 1);

const onboardingErrors = defineErrorCodes("coding", { onboarding_root_mismatch: "conflict" });

/** The session a take makes, named by the take itself: a retry, even after a crash between the two writes, finds the same one. */
function sessionFor(projectId: string, requestId: string): string {
  const hex = createHash("sha256").update(`coding.onboarding.take\0${projectId}\0${requestId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${(8 | (parseInt(hex[16]!, 16) & 3)).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function codingOnboarding(a: CodingActivation): void {
  a.route.action(codingOnboardingTake, async (input, { api, execution, beforeWrite }) => {
    const projectId = a.context.project_id!, sessionId = sessionFor(projectId, input.request_id);
    const storage = a.context.services!.storage!, materials = materialSelection(input.materials);
    // The next round's draft holds what onboarding brought, as a delegated session's does; each piece is read when that round starts.
    const keepMaterials = async () => { if (materials.length && storage.get(`materials:${sessionId}`) === undefined) { await beforeWrite(); storage.set(`materials:${sessionId}`, JSON.stringify(materials)); } };
    const existing = execution.sessions.list(projectId).find(record => record.session_id === sessionId);
    if (existing) { await keepMaterials(); return { open: { item_id: existing.session_id, title: existing.title } }; }
    // Coding works where the project writes: the folder must be its output now, as the platform set it just before.
    const output = (await projectDirectories(api)).directories.find(folder => folder.roles.includes("output"));
    if (output?.workspace_id !== input.code_root.workspace_id) throw onboardingErrors.onboarding_root_mismatch("这个文件夹现在不是项目的输出，Coding 不接手");
    const runtime = requireProjectRuntime(await runtimeDirectory(codingActions(a.context, beforeWrite), api));
    const record = await execution.sessions.create(beforeWrite, { project_id: projectId, session_id: sessionId, title: t.text("coding.onboarding.session-title"),
      runtime_id: runtime.runtime_id, at: new Date().toISOString() });
    await keepMaterials();
    return { open: { item_id: record.session_id, title: record.title } };
  });
}
