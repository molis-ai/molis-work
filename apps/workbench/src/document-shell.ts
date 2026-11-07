import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiSlotDescriptor, WorkbenchDocumentRenderRequest } from '@molis-ai/molis-work-contracts/platform/ui';

export const WORKBENCH_UI_SLOTS = {
  directory: { slot_id: 'workbench.directory', version: /* @version slot.workbench.directory */ 1, accepts: ['declarative-html'] },
  main: { slot_id: 'workbench.main', version: /* @version slot.workbench.main */ 1, accepts: ['declarative-html'] },
  overlay: { slot_id: 'workbench.overlay', version: /* @version slot.workbench.overlay */ 1, accepts: ['declarative-html'] },
  settings: { slot_id: 'workbench.settings', version: /* @version slot.workbench.settings */ 1, accepts: ['declarative-html'] },
  /** One tab of the side panel (specs/archive/side-panel D13): served in its own document, sized and placed by the Host. */
  side: { slot_id: 'workbench.side', version: /* @version slot.workbench.side */ 1, accepts: ['declarative-html'] },
} as const satisfies Record<string, UiSlotDescriptor>;


function renderAttributes(attributes: WorkbenchDocumentRenderRequest['body_attributes']): string {
  return Object.entries(attributes ?? {})
    .filter((entry): entry is [string, string | boolean] => entry[1] !== null && entry[1] !== undefined && entry[1] !== false)
    .map(([name, value]) => value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`).join('');
}

/** Host-owned document for fetched content; an absent contribution remains an empty response. */
export function renderWorkbenchRefreshDocument(request: Pick<WorkbenchDocumentRenderRequest, 'body_html' | 'body_attributes'>): string {
  return request.body_html === '' ? '' : `<!doctype html><html><body${renderAttributes(request.body_attributes)}>${request.body_html}</body></html>`;
}

/**
 * The product has no favicon. Without a link every top-level page asks `/favicon.ico` and gets a 404 (adversarial review
 * N53); an empty `data:` icon (the page CSP allows `img-src data:`) answers it in the page, so nothing is requested.
 */
export const NO_FAVICON_LINK = '<link rel="icon" href="data:,">';

/** Stable document shell, shared by native and installed app surfaces. */
export function renderWorkbenchDocument(request: WorkbenchDocumentRenderRequest): string {
  return `${request.preamble_html ?? ''}<!doctype html>
<html lang="${escapeHtml(request.lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${NO_FAVICON_LINK}
  ${request.head_before_title_html ?? ''}
  <title>${escapeHtml(request.title)}</title>
  ${request.head_html ?? ''}
</head>
  <body${renderAttributes(request.body_attributes)}>
${request.body_html}
</body>
</html>`;
}
