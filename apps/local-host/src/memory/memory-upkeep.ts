import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { isSubjectReader, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryUpkeepReport } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryCaller, MemoryService } from "@molis-ai/molis-work-service-memory";
import { MEMORY_TIDY } from "../agent-definitions/system-prompts.js";
import { resolveModelPrompt } from "../agent-definitions/instructions.js";
import { hostTextGeneration, type HostTextGeneration } from "../host-complete-text.js";
import { localWebActionContext } from "../local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "../local-owner-permissions.js";
import type { MolisWorkLocalHost } from "../project-host.js";

/**
 * One upkeep pass (specs/memory-system §6.4): the memory service's deterministic rules, with the model only asked for
 * possible duplicates and contradictions (they go to the person), and each memory's object checked through its own
 * plugin's reader — never a plugin's store.
 */
const PAIRS_SCHEMA = {
  type: "object",
  properties: {
    duplicates: { type: "array", maxItems: 20, items: { type: "array", minItems: 2, maxItems: 2, items: { type: "string", maxLength: 200 } } },
    conflicts: { type: "array", maxItems: 20, items: { type: "object", properties: { a: { type: "string", maxLength: 200 }, b: { type: "string", maxLength: 200 }, why: { type: "string", maxLength: 200 } },
      required: ["a", "b", "why"], additionalProperties: false } },
  },
  required: ["duplicates", "conflicts"],
  additionalProperties: false,
} as const;

export async function runUpkeep(service: MemoryService, input: { homeDirectory: string; localHost: MolisWorkLocalHost; caller: MemoryCaller; projects: readonly string[];
  generate?: HostTextGeneration | undefined }): Promise<MemoryUpkeepReport> {
  const generate = "generate" in input ? input.generate : hostTextGeneration({ homeDirectory: input.homeDirectory });
  return service.upkeep(input.caller, {
    projects: input.projects,
    ...(generate ? { tidy: async entries => {
      const result = await generate(resolveModelPrompt(input.homeDirectory, instructed(MEMORY_TIDY, JSON.stringify({ 记忆: entries })), "memory.tidy"), {
        structured: { mode: "local", name: "memory_pairs", schema: PAIRS_SCHEMA as never }, timeoutMs: 120_000, maxOutputTokens: 1200 });
      const found = result.structured as { duplicates?: Array<[string, string]>; conflicts?: Array<{ a: string; b: string; why: string }> } | undefined;
      return found && Array.isArray(found.duplicates) && Array.isArray(found.conflicts) ? { duplicates: found.duplicates, conflicts: found.conflicts } : null;
    } } : {}),
    objectState: ref => objectState(input.localHost, ref),
  });
}

/** Whether an object a memory rests on can still be read, asked of its own plugin's reader; unknown when that cannot be told. */
export async function objectState(localHost: MolisWorkLocalHost, ref: { kind: string; id: string; project_id: string | null }): Promise<"ok" | "missing" | "unknown"> {
  const reference = ref.project_id ? localHost.status().projects.find(row => row.project_id === ref.project_id && row.state !== "closing") : undefined;
  if (ref.project_id && !reference) return "unknown";
  const client = reference ? localHost.actionClient(reference) : localHost.homeActionClient();
  const context = await localWebActionContext(localHost, reference, LOCAL_OWNER_PERMISSIONS);
  const views: readonly ActionView[] = await Promise.resolve(client.discover(context)).catch(() => []);
  const reader = views.find(view => isSubjectReader(view.action) && view.availability.available && view.action.subject_kinds.includes(ref.kind));
  if (!reader) return "unknown";
  try {
    await client.invoke(context, { capability_id: reader.capability_id, version: reader.version, provider_id: reader.provider.provider_id }, { subject_id: ref.id });
    return "ok";
  } catch (error) {
    return /not_found|missing|deleted|forbidden|permission/.test(String((error as { code?: string }).code ?? "")) ? "missing" : "unknown";
  }
}
