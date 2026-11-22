import type { MaterialRef } from "../platform/material-ref.js";

// A conversation attachment as its caller holds it and reads it back; the service around it is `services/materials`. Kept in a file with no other imports than the ones named here: the declarations a sandboxed plugin is compiled against (`SANDBOX_SDK_CONTRACT_DECLARATIONS`) copy this file, not its owner's whole contract.

/** How much of a material the platform could read. */
export type MaterialCoverageStatus = "sufficient" | "partial" | "insufficient";
/** The pictures a model can be shown, recognised by their bytes, not by a name or a declared type. */
export const CONVERSATION_ATTACHMENT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export type ConversationAttachmentImageType = (typeof CONVERSATION_ATTACHMENT_IMAGE_TYPES)[number];

/** One attachment as the platform keeps it. `ref.subject.kind` is `CONVERSATION_ATTACHMENT_SUBJECT_KIND`; `ref.pin.mode` is `current`. */
export interface ConversationAttachment {
  ref: MaterialRef;
  title: string;
  kind: "image" | "document";
  media_type: string;
  byte_length: number;
  /** A document's text as the platform read it; absent on a picture. `pages` is null where a format has no pages. */
  text?: { chars: number; truncated: boolean; pages: number | null; coverage: MaterialCoverageStatus; issues: string[] };
}
/** An attachment read back: its text or a picture for the model. */
export interface ConversationAttachmentContent {
  attachment: ConversationAttachment;
  text?: string;
  image?: { media_type: ConversationAttachmentImageType; bytes: Uint8Array };
}
