import type { AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantContextSnapshot, AssistantLanding } from "@molis-ai/molis-work-contracts/services/assistant";
import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * Where something would be put on the left, told to a round (specs/context-program §21.8 step 7, decision L-2).
 *
 * The page's landing is a claim: before a round hears it, the object is read again from its owner with the person's
 * authority in that project, through the interaction line's H3 reader (horizontal/search `readReferences`, the same read
 * as `confirmReferences` before an `attach.` runs). Not read, nothing is said; read, the object is named as its owner names
 * it. What the round is told is facts only: the object, the place in it and the text around that place.
 */
export interface AssistantLandingPorts {
  /** H3's owner read for a project: each object's label as its owner has it for the person now, or null. */
  readReferences?(projectId: string, picked: readonly ActionSubject[]): Promise<readonly ({ label: string } | null)[]>;
}

const WHERE: Record<AssistantLanding["position"], string> = { cursor: "光标处", selection: "选中的文字", end: "文末", object: "整个对象" };
const text = (value: unknown, max: number) => typeof value === "string" && value ? { value: value.slice(0, max) } : null;

/**
 * The landing a Send carried, bounded; anything not in this shape is left out rather than refused. It goes only with the
 * object the Send carries (§21.5 L-1): a landing in any other object, or with none, is dropped here, whatever the page did.
 */
export function checkLanding(context: AssistantContextSnapshot): { landing?: AssistantLanding } {
  const value = context.landing, object = context.object;
  if (!value || typeof value !== "object" || !value.object || typeof value.object.kind !== "string" || typeof value.object.id !== "string"
    || typeof value.plugin_id !== "string" || typeof value.position !== "string" || !Object.hasOwn(WHERE, value.position)
    || !object || object.kind !== value.object.kind || object.id !== value.object.id) return {};
  const headings = Array.isArray(value.heading_path) ? value.heading_path.filter((item): item is string => typeof item === "string").slice(-6).map(item => item.slice(0, 120)) : [];
  const [before, after, selected] = [text(value.before, 400), text(value.after, 400), text(value.selected, 4000)];
  return { landing: { plugin_id: value.plugin_id.slice(0, 120), position: value.position,
    object: { kind: value.object.kind.slice(0, 80), id: value.object.id.slice(0, 200), ...(typeof value.object.title === "string" ? { title: value.object.title.slice(0, 200) } : {}) },
    ...(headings.length ? { heading_path: headings } : {}), ...(before ? { before: before.value } : {}), ...(after ? { after: after.value } : {}), ...(selected ? { selected: selected.value } : {}) } };
}

/** The round's material for the landing, when its object is still the person's to use in the work's project. */
export async function landingMaterials(ports: AssistantLandingPorts, projectId: string | null, context: AssistantContextSnapshot | null,
  base: Omit<AgentTextMaterial, "text" | "material_id" | "title">): Promise<AgentTextMaterial[]> {
  const landing = context?.landing;
  if (!landing || !projectId || !ports.readReferences) return [];
  const [owned] = await ports.readReferences(projectId, [{ kind: landing.object.kind, id: landing.object.id }]).catch(() => [null]);
  if (!owned) return [];
  const lines = [`对象：${owned.label}（${landing.object.kind}，标识 ${landing.object.id}）`,
    `位置：${landing.heading_path?.length ? `「${landing.heading_path.join(" › ")}」下，` : ""}${WHERE[landing.position]}`,
    landing.selected ? `选中的文字：\n${landing.selected}` : "",
    landing.before ? `位置之前的原文：\n${landing.before}` : "",
    landing.after ? `位置之后的原文：\n${landing.after}` : ""].filter(Boolean);
  return [{ ...base, material_id: "landing", title: "左边可以放进去的位置（页面报告，对象已由所有者确认）", text: lines.join("\n") }];
}
