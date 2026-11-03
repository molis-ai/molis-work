import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PagesBody } from "./contract.js";
import type { MaterialDocumentBatch } from "@molis-ai/molis-work-contracts/services/materials";
import { pagesErrors } from "./error.js";
import { convertImportContent } from "./import-content.js";

export interface PagesImportFile { name: string; data: string }
export interface PreparedPagesImportDocument { key: string; name: string; title: string; body: PagesBody; warnings: string[] }
export interface PreparedPagesImport { documents: PreparedPagesImportDocument[]; warnings: string[] }

/** Host owns archive/DOCX parsing; Pages owns editor structure, titles and degradation rules. */
export function preparePagesImport(materials: MaterialDocumentBatch): PreparedPagesImport {
  return { warnings: materials.warnings, documents: materials.documents.map((document, index) => {
    try {
      if (document.coverage.truncated) throw pagesErrors.invalid("提取正文已截断，请拆分材料后重新导入");
      const converted = convertImportContent(document);
      return { key: `document-${index + 1}`, name: document.name, title: converted.title, body: converted.body,
        warnings: [...new Set([...document.coverage.issues, ...converted.warnings])] };
    } catch (error) {
      if (error instanceof ActionError && error.code === "pages.invalid") throw pagesErrors.invalid(
        error.message.startsWith(`${document.name}：`) ? error.message : `${document.name}：${error.message}`);
      throw error;
    }
  }) };
}
