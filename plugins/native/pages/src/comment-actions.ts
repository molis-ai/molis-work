import { randomUUID } from "node:crypto";
import { cutHead, cutTail } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { pagesErrors } from "./error.js";
import { ActionError, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantThreadContext, AssistantThreadDraft } from "@molis-ai/molis-work-contracts/services/assistant";
import type { PagesCommentThread } from "./contract.js";
import type { PagesStores } from "./store.js";
import type { AppendPagesComment } from "./comments-store.js";
import { nodesToMarkdown } from "./to-markdown.js";
import { nodeFromUnknown } from "./schema.js";

const id = { type: "string", minLength: 1, maxLength: 160 };
const text = { type: "string" };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const message = object({ message_id: id, author: { enum: ["user", "assistant", "annotation"] }, body: text, reply_to: id,
  created_at: text, request_id: id, work_id: id, run_id: id }, ["message_id", "author", "body", "created_at", "request_id"]);
const thread = object({ thread_id: id, page_id: id, revision: { type: "integer", minimum: 0 },
  anchor: object({ kind: { enum: ["document", "text"] }, mark_id: id, excerpt: text }, ["kind", "excerpt"]),
  detached: { type: "boolean" }, messages: { type: "array", items: message } });
const define = <I, O>(suffix: string, title: string, input: ActionSchema, output: ActionSchema, write = false, role?: "context" | "reply"): ActionDefinition<I, O> => ({
  capability_id: `pages.comments.${suffix}`, version: 1, operation: write ? "command" : "query",
  provider_id: "io.molis.work.pages",
  action: { title, description: title, kind: write ? "operation" : "query", scope: "project", audiences: ["user"],
    effect: write ? "write" : "read", permissions: write ? ["pages:read", "pages:write"] : ["pages:read"], subject_kinds: ["pages_document"],
    input_schema: input, output_schema: output, ...(role ? { thread_source: { role, subject_kind: "pages_document" } } : {}) },
});
const target = { subject_id: id, thread_id: id };
export const pagesCommentActions = {
  list: define<{ page_id: string }, { threads: PagesCommentThread[] }>("list", "查看文档评论", object({ page_id: id }), object({ threads: { type: "array", items: thread } })),
  append: define<AppendPagesComment, { thread: PagesCommentThread }>("append", "发送评论", object({ page_id: id, thread_id: id, request_id: id,
    body: { type: "string", minLength: 1, maxLength: 20000 }, reply_to: id, expected_version: { type: "integer", minimum: 1 },
    anchor: object({ kind: { enum: ["document", "text"] }, mark_id: id }, ["kind"]) }, ["page_id", "thread_id", "request_id", "body"]), object({ thread }), true),
  context: define<{ subject_id: string; thread_id: string; message_id: string; draft?: AssistantThreadDraft }, AssistantThreadContext>("context", "读取评论的回复上下文",
    object({ ...target, message_id: id, draft: object({ text: { type: "string", maxLength: 100000 }, revision: id }) }, ["subject_id", "thread_id", "message_id"]),
    object({ title: text, revision: text, text, truncated: { type: "boolean" }, message: object({ message_id: id, body: text, request_id: id }) }), false, "context"),
  reply: define<{ subject_id: string; thread_id: string }, { thread: PagesCommentThread }>("reply", "接收助理在原评论的回复", object(target), object({ thread }), true, "reply"),
};

/** What of a document and of a comment thread the assistant is handed: at most this many UTF-16 units of each (the opening of the document, the latest of the thread). The Host refuses a context text over 100000 units, and these two parts are most of it. */
const CONTEXT_PART_UNITS = 30000;

export function createPagesCommentHandlers(stores: PagesStores): ActionHandlerBinding[] {
  const project = (caller: ActionExecutionContext): string => {
    if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目");
    return caller.project_id;
  };
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionExecutionContext) => O | Promise<O>): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as I, caller),
  });
  return [
    bind(pagesCommentActions.list, (input, caller) => stores.read(store => ({ threads: store.comments.list(input.page_id, project(caller)) }))),
    bind(pagesCommentActions.append, (input, caller) => stores.write(caller, store => ({ thread: store.comments.append(input, project(caller)) }))),
    bind(pagesCommentActions.context, (input, caller) => stores.read(store => {
      const page = store.get(input.subject_id, project(caller));
      const found = store.comments.get(input.subject_id, input.thread_id, project(caller));
      const request = found.messages.find(message => message.message_id === input.message_id && message.author === "user");
      if (!request) throw pagesErrors.not_found("找不到要回复的用户消息");
      if (input.draft && input.draft.revision !== String(page.version)) throw pagesErrors.conflict("正文已改变，请保存后重新发起评论");
      const document = input.draft?.text ?? nodesToMarkdown(nodeFromUnknown(page.body).content.content);
      const messages = found.messages.map(message => `${message.author} [${message.message_id}]${message.reply_to ? ` 回复 ${message.reply_to}` : ""}: ${message.body}`).join("\n\n");
      const documentCut = document.length > CONTEXT_PART_UNITS, messagesCut = messages.length > CONTEXT_PART_UNITS;
      const documentNote = documentCut ? `（只取开头的部分，不超过 ${CONTEXT_PART_UNITS} 字）` : "", messagesNote = messagesCut ? `（只取最近的部分，不超过 ${CONTEXT_PART_UNITS} 字）` : "";
      return { title: page.title, revision: String(page.version), truncated: documentCut || messagesCut,
        text: `Page: ${page.title}\n版本: ${page.version}${input.draft ? "（用户明确附上的未保存草稿）" : ""}\n引用: ${found.anchor.excerpt}\n${found.detached ? "原文已变更，保留引用。\n" : ""}正文${documentNote}:\n${cutHead(document, CONTEXT_PART_UNITS)}\n\n本评论线程${messagesNote}:\n${cutTail(messages, CONTEXT_PART_UNITS)}`,
        message: { message_id: request.message_id, body: request.body, request_id: request.request_id } };
    })),
    bind(pagesCommentActions.reply, async (input, caller) => {
      const delivery = caller.assistant_reply;
      if (!delivery || delivery.target.provider_id !== "io.molis.work.pages" || delivery.target.subject_kind !== "pages_document"
        || delivery.target.subject_id !== input.subject_id || delivery.target.thread_id !== input.thread_id) throw new ActionError("actions.forbidden", "只能由宿主投递这条评论已完成的助理回复");
      return stores.write(caller, store => ({ thread: store.comments.reply(input.subject_id, input.thread_id, project(caller), {
        message_id: randomUUID(), author: "assistant", body: delivery.body, reply_to: delivery.message_id,
        request_id: delivery.request_id, work_id: delivery.work_id, run_id: delivery.run_id, created_at: new Date().toISOString(),
      }) }));
    }),
  ];
}
