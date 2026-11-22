import { ASSISTANT_INSTALL_ID, ASSISTANT_PLUGIN_ID, type AssistantMaterial, type AssistantMaterialText } from "@molis-ai/molis-work-contracts/services/assistant";
import type { ConversationAttachment, MaterialUpload } from "@molis-ai/molis-work-contracts/services/materials";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { randomUUID } from "node:crypto";
import { assistantErrors } from "./assistant-errors.js";
import { checkHeldImages, checkMaterials, MAX_ATTACHMENT_TEXT, MAX_MATERIAL_TEXT } from "./assistant-send-materials.js";
import { isExternalSessionMaterial } from "./assistant-external-sessions.js";
import type { AssistantStore } from "./assistant-store.js";
import type { MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { attachConversationFile, forgetOwnedAttachments, holdsConversationAttachment, readConversationAttachment, type AttachmentOwner, type AttachmentRead, type AttachmentReadResult } from "../material-attachments.js";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";

/**
 * The Assistant's files, kept by the platform's material service like any plugin's (platform capability audit §6): the Assistant is a
 * Home-level caller, so what the person brings to any of its works belongs to it in the Home, whichever project a work runs in. A
 * document and a picture are both kept while a round names them, and go when the last work naming them goes with its project
 * (`purgeAssistantProject`).
 */
export const ASSISTANT_ATTACHMENT_OWNER: AttachmentOwner = { plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, project_id: null };

export interface AssistantAttachmentPort {
  attach(upload: MaterialUpload, options?: { signal?: AbortSignal; beforeEffect?: () => void | Promise<void> }): Promise<ConversationAttachment>;
  read(ref: MaterialRef, request: AttachmentRead): Promise<AttachmentReadResult>;
  /** Whether the bytes are still kept: an attachment the person can see and send again. */
  holds(ref: MaterialRef): boolean;
  /** Release attachments owned by the Assistant when no stored work or round references them. */
  forget?(refs: readonly MaterialRef[]): Promise<void>;
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

const MATERIAL_PREVIEW_CHARS = 20_000;

/** Attachment admission and readback for one person's Assistant work. Only this service can reach the Assistant's Home attachment owner. */
export class AssistantMaterialAccess {
  constructor(
    private readonly store: Pick<AssistantStore, "get" | "rounds"> & Partial<Pick<AssistantStore, "referencesAttachment">>,
    private readonly actorId: string,
    private readonly attachments?: AssistantAttachmentPort,
  ) {}

  checkSend(input: unknown): AssistantMaterial[] {
    const materials = checkMaterials(input);
    checkHeldImages(materials, image => this.holdsImage(image));
    return materials;
  }

  /**
   * A file the person brings, kept by the platform's material service as a conversation attachment (platform capability audit §6):
   * a picture (PNG, JPEG, GIF, WebP, by its bytes) is kept as it is, for the model to see in the round it goes with; any other file
   * is read once by the platform's readers (PDF, Word, text, a picture's words, a recording's transcript) into bounded text for this
   * Send's materials. What cannot be read says why (scanned, encrypted, damaged, a kind no reader takes); nothing is guessed.
   */
  async readAttachment(input: { name: string; data: string }, control: { signal?: AbortSignal; beforeEffect?: () => void | Promise<void> } = {}): Promise<AssistantMaterial & { pages?: number; truncated?: boolean }> {
    const name = typeof input?.name === "string" ? cutHead(input.name.trim(), 200) : "";
    if (!name || typeof input.data !== "string" || !input.data) throw assistantErrors.invalid("没有收到文件");
    const attachments = this.attachments;
    if (!attachments) throw assistantErrors.unsupported("当前环境不能保存附件");
    const said = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^[A-Z_]+:\s*/, "");
    let attached: ConversationAttachment;
    try { attached = await attachments.attach({ file_name: name, data_base64: input.data }, control); }
    catch (error) { throw (error as { code?: string }).code === "material.attachment.unsupported" ? assistantErrors.unsupported(said(error)) : assistantErrors.invalid(said(error)); }
    if (attached.kind === "image") {
      return { material_id: `image-${randomUUID()}`, kind: "image", title: name, explicit: true,
        image: { attachment: attached.ref, media_type: attached.media_type, byte_length: attached.byte_length } };
    }
    const read = await attachments.read(attached.ref, { as: "text", signal: control.signal }).catch(error => { throw assistantErrors.invalid(said(error)); });
    const whole = read.text ?? "";
    if (!whole.trim()) {
      const referenced = this.store.referencesAttachment ? this.store.referencesAttachment(attached.ref.subject.id) : false;
      if (!referenced) {
        await attachments.forget?.([attached.ref]).catch(() => undefined);
      }
      const issues = attached.text?.issues.slice(0, 2);
      const details = issues?.length ? uiText.text("common.punctuation.in-parens", { value: issues.join(uiText.text("common.list.separator")) }) : "";
      const title = uiText.text("common.punctuation.quoted", { value: name });
      throw assistantErrors.invalid(`${title}里没有读到文字${details}`);
    }
    const text = whole.slice(0, MAX_ATTACHMENT_TEXT), truncated = whole.length > MAX_ATTACHMENT_TEXT || attached.text?.truncated === true;
    const pages = attached.text?.pages ?? undefined;
    const note = pages ? `${pages} 页${truncated ? "，只取了前面一部分" : ""}` : truncated ? "只取了前面一部分" : "";
    return { material_id: `file-${randomUUID()}`, kind: "file", title: name + (note ? `（${note}）` : ""),
      text, file_attachment: attached.ref, explicit: true, ...(pages ? { pages } : {}), ...(truncated ? { truncated: true } : {}) };
  }

  /** The composer supplies references. Get the text from their owner, once for each original in this Send. */
  async documentInputs(materials: AssistantMaterial[]): Promise<AssistantMaterial[]> {
    if (!materials.some(item => item.file_attachment)) return materials;
    const textById = new Map<string, string>();
    let total = 0;
    const resolved: AssistantMaterial[] = [];
    for (const item of materials) {
      let text = item.text;
      if (item.file_attachment) {
        const ref = item.file_attachment;
        const key = JSON.stringify([ref.subject.id, ref.pin]);
        text = textById.get(key);
        if (text === undefined) {
          const read = await this.attachments?.read(ref, { as: "text" }).catch(() => null);
          if (read?.attachment.kind !== "document" || !read.text?.trim()) throw assistantErrors.invalid(`文件「${item.title}」已读不到，请重新添加`);
          text = read.text.slice(0, MAX_ATTACHMENT_TEXT);
          textById.set(key, text);
        }
      }
      // Same budget as the composer's ordinary text. Images and registered capabilities have their own limits.
      if (item.kind !== "image" && item.kind !== "capability" && !item.reference) total += text?.length ?? 0;
      if (total > MAX_MATERIAL_TEXT) throw assistantErrors.invalid("材料正文合计过长，请只带需要的片段");
      resolved.push(item.file_attachment ? { ...item, text } : item);
    }
    return resolved;
  }

  private sentMaterial(workId: string, materialId: string): AssistantMaterial {
    const work = this.store.get(this.actorId, workId);
    const found = this.store.rounds(work.work_id).flatMap(round => round.materials).find(item => item.material_id === materialId);
    if (!found) throw assistantErrors.not_found("这项工作里没有这份材料");
    return found;
  }

  /** One material a round of this work brought, with its text (bounded), for the person to look at again. */
  async material(workId: string, materialId: string): Promise<AssistantMaterialText> {
    const found = this.sentMaterial(workId, materialId);
    const read = found.file_attachment ? await this.attachments?.read(found.file_attachment, { as: "text" }) : undefined;
    const text = read ? (read.text ?? "").slice(0, MAX_ATTACHMENT_TEXT) : typeof found.text === "string" ? found.text
      : isExternalSessionMaterial(found) ? "（外部会话内容仅在发送当轮提供给模型，不在助理记录中留存原文）" : undefined;
    // A page brought from the browser says where it came from on its first line.
    const url = text?.match(/^来源：\s*(https?:\/\/\S+)/u)?.[1];
    return { material_id: found.material_id, kind: found.kind, title: found.title,
      ...(text !== undefined ? { text: text.slice(0, MATERIAL_PREVIEW_CHARS), ...(text.length > MATERIAL_PREVIEW_CHARS || read?.attachment.text?.truncated ? { truncated: true } : {}) } : {}),
      ...(read?.attachment.kind === "document" ? { original_available: true as const } : {}),
      ...(url ? { url } : {}), ...(found.source ? { source: { ...found.source } } : {}), ...(found.object ? { object: { ...found.object } } : {}), ...(found.draft ? { draft: true } : {}) };
  }

  /** Only a document carried by one of this person's rounds may be downloaded. */
  async materialOriginal(workId: string, materialId: string, signal: AbortSignal): Promise<{ filename: string; bytes: Uint8Array }> {
    const found = this.sentMaterial(workId, materialId);
    if (!found.file_attachment) throw assistantErrors.not_found("这项工作里没有这份原件");
    const read = await this.attachments?.read(found.file_attachment, { as: "original", signal });
    this.store.get(this.actorId, workId);
    if (read?.attachment.kind !== "document" || !read.original) throw assistantErrors.expired("这份原件已读不到，请重新添加");
    return { filename: read.attachment.title, bytes: read.original };
  }

  /** A picture a work carried, read back for the side panel from the platform's attachments. */
  async materialImage(workId: string, materialId: string): Promise<{ media_type: string; data: string }> {
    const work = this.store.get(this.actorId, workId);
    const found = this.store.rounds(work.work_id).flatMap(round => round.materials).find(item => item.material_id === materialId && item.kind === "image" && item.image);
    if (!found?.image) throw assistantErrors.not_found("这项工作里没有这张图片");
    const gone = assistantErrors.expired("这张图片已不在了，需要时请重新添加这张图片。");
    if (!this.holdsImage(found.image) || !this.attachments) throw gone;
    const read = await this.attachments.read(found.image.attachment, { as: "image" }).catch(() => { throw gone; });
    if (!read.image) throw gone;
    return { media_type: read.image.media_type, data: Buffer.from(read.image.bytes).toString("base64") };
  }

  /** Whether a picture's bytes are still kept for the Assistant. */
  holdsImage(image: NonNullable<AssistantMaterial["image"]>): boolean {
    return !!this.attachments?.holds(image.attachment);
  }
}
