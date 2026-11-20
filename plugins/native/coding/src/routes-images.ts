import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentHostCapabilities as agent, type AgentImageMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import { CONVERSATION_ATTACHMENT_IMAGE_TYPES, CONVERSATION_ATTACHMENT_LIMITS } from "@molis-ai/molis-work-contracts/services/materials";
import { type CodingActivation, selected } from "./route-activation.js";
import { bodyOf } from "./route-selections.js";
import { codingActions } from "./route-entry.js";
import { text } from "./run-inputs.js";
import { codingFailure } from "./words.js";

/**
 * Pictures in the composer (Coding A3, docs/design/coding-daily-basics scheme A). A picture pasted or dropped is kept by the platform's
 * material service as this installation's conversation attachment (platform capability audit §6), so it is the same after a restart
 * and can be looked at again like a material; the round gets only its reference, and the Agent Host reads the bytes for the model.
 */

/** The largest picture a round takes; a larger one is shrunk on the page first, at the person's word. */
export const IMAGE_MAX_BYTES = CONVERSATION_ATTACHMENT_LIMITS.image_bytes;
/** The most pictures one round carries (the Agent Host's own bound, `RUN_IMAGES_MAX`). */
export const ROUND_IMAGES_MAX = CONVERSATION_ATTACHMENT_LIMITS.round_images;
/** Base64 of the largest picture, with room for its padding. */
const DATA_MAX = Math.ceil(IMAGE_MAX_BYTES / 3) * 4 + 4; // under the action schema's 7 000 000

/** A round's pictures as the page sends them: references the upload gave, checked again by the Agent Host as this installation's own. */
export function roundImages(value: unknown): AgentImageMaterial[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > ROUND_IMAGES_MAX) throw codingFailure("coding.server.images-too-many", { n: ROUND_IMAGES_MAX });
  return value.map(item => {
    const one = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const attachment = one.attachment as AgentImageMaterial["attachment"] | undefined;
    if (!attachment || typeof attachment !== "object" || typeof attachment.subject?.kind !== "string" || typeof attachment.subject?.id !== "string" || attachment.pin?.mode !== "current")
      throw codingFailure("coding.server.image-reference");
    const media_type = text(one.media_type, "coding.field.image", 100);
    if (!(CONVERSATION_ATTACHMENT_IMAGE_TYPES as readonly string[]).includes(media_type)) throw codingFailure("coding.server.image-only");
    return { material_id: text(one.material_id, "coding.field.image", 200), title: text(one.title, "coding.field.image", 300), media_type,
      attachment: { subject: { kind: attachment.subject.kind, id: attachment.subject.id }, pin: { mode: "current", read_revision: String(attachment.pin.read_revision) } } };
  });
}

export const imageRoutes = (a: CodingActivation): PluginRouteBinding[] => [
  // Keep one picture: the platform reads its type from the bytes; anything that is not a picture the model can be shown is refused.
  a.route("coding.attachments", async (request, _api, execution) => {
    selected(a, request, execution);
    const body = bodyOf(request), attach = a.context.services?.materials?.attach;
    if (!attach) throw codingFailure("coding.server.images-unavailable");
    const name = text(body.name, "coding.field.image", 300), data = text(body.data, "coding.field.image", DATA_MAX);
    if (Math.floor(data.length * 3 / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0) > IMAGE_MAX_BYTES) throw codingFailure("coding.server.image-too-large", { mb: 5 });
    const signal = request.execution?.signal;
    const kept = await attach({ file_name: name, data_base64: data }, { signal, expected_kind: "image" });
    if (kept.kind !== "image" || !(CONVERSATION_ATTACHMENT_IMAGE_TYPES as readonly string[]).includes(kept.media_type)) throw codingFailure("coding.server.image-only");
    return { image: { title: kept.title, media_type: kept.media_type, byte_length: kept.byte_length, attachment: kept.ref } };
  }),
  // One read of the round, then its attachments. Agent Host checks which session owns the round.
  a.route("coding.round-images", async (request, _api, execution, beforeWrite) => {
    const record = selected(a, request, execution), read = a.context.services?.materials?.readAttachment;
    if (!read) throw codingFailure("coding.server.images-unavailable");
    if (!record.runtime_session_id) throw codingFailure("coding.server.session-no-run");
    const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
    const run = await codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, { session_id: session.session_id, run_id: request.params.runId! }]);
    const images = [];
    for (const image of run.frozen.image_materials ?? []) {
      try {
        const content = await read(image.attachment, { as: "image" });
        images.push({ material_id: image.material_id, title: image.title, media_type: content.image!.media_type, data: Buffer.from(content.image!.bytes).toString("base64") });
      } catch (error) {
        if (!(error instanceof ActionError) || !["material.attachment.not_found", "material.attachment.unreadable", "material.attachment.not_image"].includes(error.code)) throw error;
      }
    }
    return { images };
  }),
];
