import type { AssistantMaterial } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantErrors } from "./assistant-errors.js";

/** What one Send may carry beside its words: how many materials, how much text in all, and how many images. */
const MAX_MATERIALS = 20;
const MAX_MATERIAL_TEXT = 100_000;
/** Images per Send, within what the model providers take. */
const MAX_IMAGES = 6;

/** The materials as the page sent them, each kept to its own shape and bounds; what only the Host may add is read later. */
export function checkMaterials(value: unknown): AssistantMaterial[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_MATERIALS) throw assistantErrors.invalid(`一次最多带 ${MAX_MATERIALS} 份材料`);
  let total = 0;
  return value.map((raw, index) => {
    const item = raw as AssistantMaterial;
    if (!item || typeof item !== "object" || !["selection", "object", "text", "file", "image", "capability", "method"].includes(item.kind)
      || typeof item.title !== "string" || typeof item.explicit !== "boolean" || item.text !== undefined && typeof item.text !== "string") {
      throw assistantErrors.invalid(`第 ${index + 1} 份材料格式无效`);
    }
    // A capability picked with “/”: its exact identity; the words the model reads are the Host's, not the page's.
    // A method chosen with “/”: only its identity; the Host adds the registered body before the round.
    if (item.kind === "method") {
      if (typeof item.method?.method_id !== "string" || !/^[^\/\s]{1,120}\/[^\/\s]{1,80}$/.test(item.method.method_id)) throw assistantErrors.invalid(`第 ${index + 1} 份材料格式无效`);
      return { material_id: String(item.material_id || `m${index + 1}`).slice(0, 80), kind: "method" as const, title: item.title.slice(0, 200), explicit: true, method: { method_id: item.method.method_id } };
    }
    if (item.kind === "capability") {
      const cap = item.capability;
      if (!cap || typeof cap.capability_id !== "string" || !Number.isSafeInteger(cap.version) || typeof cap.provider_id !== "string" || typeof cap.title !== "string") {
        throw assistantErrors.invalid(`第 ${index + 1} 份材料格式无效`);
      }
      const capability = { capability_id: cap.capability_id.slice(0, 200), version: cap.version, provider_id: cap.provider_id.slice(0, 200), title: cap.title.slice(0, 200) };
      return { material_id: String(item.material_id || `m${index + 1}`).slice(0, 80), kind: "capability" as const, title: `用：${capability.title}`, explicit: true, capability,
        text: `用户指定这一轮用这个能力：「${capability.title}」（capability_id ${capability.capability_id}，version ${capability.version}，provider_id ${capability.provider_id}）。先用 find-capabilities 核对它的参数再用；会改变数据的照常请用户确认；它现在不可用就如实说明，不要换别的能力。` };
    }
    // An image the person added: only the reference the runtime gave when it took the picture in.
    if (item.kind === "image") {
      const image = item.image;
      if (!image || typeof image.resource_id !== "string" || !Number.isSafeInteger(image.revision) || typeof image.media_type !== "string" || !Number.isSafeInteger(image.byte_length)) {
        throw assistantErrors.invalid(`第 ${index + 1} 份材料格式无效`);
      }
      return { material_id: String(item.material_id || `m${index + 1}`).slice(0, 80), kind: "image" as const, title: item.title.slice(0, 200), explicit: true,
        image: { resource_id: image.resource_id.slice(0, 200), revision: image.revision, media_type: image.media_type.slice(0, 40), byte_length: image.byte_length },
        text: "这张图片随本轮一起发给你，只在这一轮能看到（之后的轮次看不到原图）。看不到图片内容就直接说看不到，不要猜测图里有什么。" };
    }
    // Picked with “@”: the page's words about it are only the search snippet; the Host reads the object before the round.
    if (item.reference !== undefined) {
      if (item.kind !== "object" || !item.object || typeof item.reference?.hit_id !== "string" || !item.reference.hit_id) throw assistantErrors.invalid(`第 ${index + 1} 份材料格式无效`);
      return { material_id: String(item.material_id || `m${index + 1}`).slice(0, 80), kind: "object" as const, title: item.title.slice(0, 200), explicit: true,
        reference: { hit_id: item.reference.hit_id.slice(0, 2000) },
        object: { kind: String(item.object.kind).slice(0, 80), id: String(item.object.id).slice(0, 200), ...(item.object.title ? { title: String(item.object.title).slice(0, 200) } : {}) },
        ...(item.source ? { source: { surface: String(item.source.surface).slice(0, 80), ...(item.source.plugin_id ? { plugin_id: String(item.source.plugin_id).slice(0, 120) } : {}), ...(item.source.title ? { title: String(item.source.title).slice(0, 200) } : {}) } } : {}),
        ...(typeof item.text === "string" ? { text: item.text.slice(0, 600) } : {}) };
    }
    total += item.text?.length ?? 0;
    if (total > MAX_MATERIAL_TEXT) throw assistantErrors.invalid("材料正文合计过长，请只带需要的片段");
    return { material_id: String(item.material_id || `m${index + 1}`).slice(0, 80), kind: item.kind, title: item.title.slice(0, 200), explicit: item.explicit,
      ...(item.source ? { source: { surface: String(item.source.surface).slice(0, 80), ...(item.source.plugin_id ? { plugin_id: String(item.source.plugin_id).slice(0, 120) } : {}), ...(item.source.title ? { title: String(item.source.title).slice(0, 200) } : {}) } } : {}),
      ...(item.object ? { object: { kind: String(item.object.kind).slice(0, 80), id: String(item.object.id).slice(0, 200), ...(item.object.version !== undefined ? { version: item.object.version } : {}), ...(item.object.title ? { title: String(item.object.title).slice(0, 200) } : {}) } } : {}),
      ...(item.text !== undefined ? { text: item.text } : {}), ...(item.draft ? { draft: true } : {}) };
  });
}

/** Each image is one this Host took in and still holds, at the revision the page names: the Host has restarted otherwise. */
export function checkHeldImages(materials: readonly AssistantMaterial[], held: ReadonlyMap<string, { revision: number }>): void {
  const images = materials.filter(item => item.kind === "image");
  if (images.length > MAX_IMAGES) throw assistantErrors.invalid(`一次最多带 ${MAX_IMAGES} 张图片`);
  for (const image of images) {
    const kept = held.get(image.image!.resource_id);
    if (!kept || kept.revision !== image.image!.revision) throw assistantErrors.invalid(`图片「${image.title}」已失效（应用重启过），请重新添加`);
  }
}
