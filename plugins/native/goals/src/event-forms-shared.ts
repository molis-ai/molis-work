import { randomUUID } from "node:crypto";
import type { GoalsDocumentUiPrimitives } from "./document-ui-model.js";

/** 各文书表单共用的两个小助手：字段错误占位与带前缀的新标识。 */
export function createEventFormShared(primitives: GoalsDocumentUiPrimitives) {
  const { escapeHtml } = primitives;
  function fieldError(id: string): string {
    return `<p class="event-field-error" data-field-error="${escapeHtml(id)}" hidden></p>`;
  }

  function newToken(prefix: string): string {
    return `${prefix}-${randomUUID().slice(0, 8)}`;
  }

  return { fieldError, newToken };
}

export type EventFormShared = ReturnType<typeof createEventFormShared>;
