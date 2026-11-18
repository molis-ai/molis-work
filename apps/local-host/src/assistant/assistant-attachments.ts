import { ASSISTANT_INSTALL_ID, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import type { ConversationAttachment, ConversationAttachmentContent, ConversationAttachmentRequest, MaterialUpload } from "@molis-ai/molis-work-contracts/services/materials";
import type { MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { attachConversationFile, forgetOwnedAttachments, holdsConversationAttachment, readConversationAttachment, type AttachmentOwner } from "../material-attachments.js";

/**
 * The Assistant's files, kept by the platform's material service like any plugin's (platform capability audit §6): the Assistant is a
 * Home-level caller, so what the person brings to any of its works belongs to it in the Home, whichever project a work runs in. A
 * document is kept only until its text is read into the Send; a picture stays while a round of a work names it, and goes when the last
 * work naming it goes with its project (`purgeAssistantProject`).
 */
export const ASSISTANT_ATTACHMENT_OWNER: AttachmentOwner = { plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, project_id: null };

export interface AssistantAttachmentPort {
  attach(upload: MaterialUpload, options?: { signal?: AbortSignal; beforeEffect?: () => void | Promise<void> }): Promise<ConversationAttachment>;
  read(ref: MaterialRef, request: ConversationAttachmentRequest): Promise<ConversationAttachmentContent>;
  /** Whether the bytes are still kept: an attachment the person can see and send again. */
  holds(ref: MaterialRef): boolean;
  /** Drops attachments nothing names any more. */
  forget(refs: readonly MaterialRef[]): Promise<void>;
}

export function assistantAttachments(home: string): AssistantAttachmentPort {
  return {
    attach: (upload, options) => attachConversationFile(home, ASSISTANT_ATTACHMENT_OWNER, upload, options ?? {}),
    read: (ref, request) => readConversationAttachment(home, ASSISTANT_ATTACHMENT_OWNER, ref, request),
    holds: ref => holdsConversationAttachment(home, ASSISTANT_ATTACHMENT_OWNER, ref),
    forget: refs => forgetOwnedAttachments(home, ASSISTANT_ATTACHMENT_OWNER, refs),
  };
}

/** A round's pictures, read for the Agent Host (`AgentStartAuthority.attachmentImage`) from the Assistant's own attachments, never another caller's. */
export function assistantAttachmentImage(port: AssistantAttachmentPort): (ref: MaterialRef) => Promise<{ media_type: string; bytes: Uint8Array }> {
  return async ref => {
    const read = await port.read(ref, { as: "image" });
    return { media_type: read.image!.media_type, bytes: read.image!.bytes };
  };
}
