import type { GoalsDocumentUiPrimitives } from "./document-ui-model.js";
import { createAgreementForms } from "./event-forms-agreement.js";
import { createRecordForms } from "./event-forms-record.js";
import { createEventFormShared } from "./event-forms-shared.js";
import { createTypeForms } from "./event-forms-type.js";

/** 事件文书的表单工厂：按文书种类分在 event-forms-*.ts，这里只组合，返回的方法与拆开前一致。 */
export function createEventDocumentForms(primitives: GoalsDocumentUiPrimitives) {
  const shared = createEventFormShared(primitives);
  const typeForms = createTypeForms(primitives, shared);
  const recordForms = createRecordForms(primitives, shared);
  const agreementForms = createAgreementForms(primitives, shared);
  return {
    ...recordForms,
    ...typeForms,
    ...agreementForms,
  };
}
