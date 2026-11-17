import { CONVERSATION_ATTACHMENT_IMAGE_TYPES, CONVERSATION_ATTACHMENT_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/services/materials";
import type { AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "./errors.js";
import type { AgentStartAuthority } from "./index.js";

/** The most pictures one Run carries: every model call of the Run sends them all again. */
export const RUN_IMAGES_MAX = 6;

/**
 * The pictures a round brings, read for the caller from its own conversation attachments (platform capability audit §6): only
 * references come in the request, and the bytes are the platform's, so a picture attached before a restart still goes. A reference
 * that is not an attachment, one the caller does not own, or one that is not a picture the model can be shown refuses the round.
 */
export async function attachedImages(request: Pick<AgentStartRequest, "image_materials">, authority: Pick<AgentStartAuthority, "attachmentImage">): Promise<Array<{ material_id: string; bytes: Uint8Array }>> {
  const wanted = request.image_materials ?? [];
  if (!wanted.length) return [];
  if (wanted.length > RUN_IMAGES_MAX || new Set(wanted.map(item => item.material_id)).size !== wanted.length) throw agentErrors.capability_unavailable(`一轮最多带 ${RUN_IMAGES_MAX} 张不同的图片`);
  const read = authority.attachmentImage;
  if (!read) throw agentErrors.capability_unavailable("这个调用方还不能把图片交给模型");
  return Promise.all(wanted.map(async item => {
    if (item.attachment?.subject?.kind !== CONVERSATION_ATTACHMENT_SUBJECT_KIND) throw agentErrors.capability_unavailable(`「${item.title}」不是这里添加的图片`);
    const image = await read(item.attachment);
    if (!(CONVERSATION_ATTACHMENT_IMAGE_TYPES as readonly string[]).includes(image.media_type) || image.media_type !== item.media_type) throw agentErrors.capability_unavailable(`「${item.title}」不是能给模型看的图片`);
    return { material_id: item.material_id, bytes: image.bytes };
  }));
}
