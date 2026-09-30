import { bindWorkflowContentHandlers, defineWorkflowContentActions, workflowDeliveryKey, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FormQuestionInput, FormRecord } from "@molis-ai/molis-work-contracts/modules/form";
import { FormError } from "./error.js";
import type { FormStore } from "./store.js";

/** A form is a workflow content station: it hands its questions on as a list, and turns a list it receives into questions. */
export const formContentActions = defineWorkflowContentActions({ id: "form", title: "问卷", icon: "clipboard", create: true,
  read_permissions: ["form:read"], write_permissions: ["form:read", "form:write"] });

export function formMarkdown(record: FormRecord): string {
  const lines = [`# ${record.title}`];
  if (record.description) lines.push("", record.description);
  lines.push("");
  record.questions.forEach((question, index) => {
    lines.push(`${index + 1}. ${question.title}${question.required ? "（必填）" : ""}`);
    for (const option of question.options ?? []) lines.push(`   - ${option.label}`);
  });
  return lines.join("\n") + "\n";
}

/** Questions from a list someone hands over: every list item or line ending in a question becomes a fill-in question. */
export function questionsFromText(text: string): FormQuestionInput[] {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n").map(line => line.trim()).filter(Boolean)
    .filter(line => !/^#{1,6}\s/u.test(line))
    .map(line => line.replace(/^([-*+]|\d+[.)、])\s*/u, "").replace(/[*_`]/gu, "").trim()).filter(Boolean);
  const questions = lines.filter(line => line.length <= 200).slice(0, 50).map(title => ({ type: "text" as const, title, required: false }));
  if (!questions.length) throw new FormError("form.invalid", "收到的内容里没有可以做成题目的文字");
  return questions;
}

export function createFormContentHandlers(withStore: <T>(run: (store: FormStore) => T) => T): ActionHandlerBinding[] {
  const project = (caller: ActionCallContext) => { if (!caller.project_id) throw new FormError("form.invalid", "缺少项目"); return caller.project_id; };
  return bindWorkflowContentHandlers(formContentActions, {
    list: caller => withStore(store => store.list(project(caller)).map(form => ({ item_id: form.id, title: form.title, caption: form.questions.length + " 题", at: form.updated_at }))),
    read: ({ item_id }, caller) => withStore(store => { const form = store.get(item_id, project(caller)); return { title: form.title, body: formMarkdown(form), source: "问卷" }; }),
    receive: ({ payload, context }, caller) => withStore(store => {
      const form = store.receive(project(caller), workflowDeliveryKey(context), payload.title, questionsFromText(payload.body));
      return { plugin: "form", item_id: form.id, title: form.title };
    }),
    create: ({ title }, caller) => withStore(store => { const form = store.create({ title, project_id: project(caller) }); return { plugin: "form", item_id: form.id, title: form.title }; }),
  });
}
