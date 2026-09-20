import type { UiSlotDescriptor, WorkbenchDocumentRenderRequest } from '@molis-ai/molis-work-contracts/platform/ui';

export const WORKBENCH_UI_SLOTS = {
  directory: { slot_id: 'workbench.directory', version: 1, accepts: ['declarative-html'] },
  main: { slot_id: 'workbench.main', version: 1, accepts: ['declarative-html'] },
  overlay: { slot_id: 'workbench.overlay', version: 1, accepts: ['declarative-html'] },
  settings: { slot_id: 'workbench.settings', version: 1, accepts: ['declarative-html'] },
} as const satisfies Record<string, UiSlotDescriptor>;

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function renderAttributes(attributes: WorkbenchDocumentRenderRequest['body_attributes']): string {
  return Object.entries(attributes ?? {})
    .filter((entry): entry is [string, string | boolean] => entry[1] !== null && entry[1] !== undefined && entry[1] !== false)
    .map(([name, value]) => value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`).join('');
}

/** Stable document shell, shared by native and installed app surfaces. */
export function renderWorkbenchDocument(request: WorkbenchDocumentRenderRequest): string {
  return `${request.preamble_html ?? ''}<!doctype html>
<html lang="${escapeHtml(request.lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${request.head_before_title_html ?? ''}
  <title>${escapeHtml(request.title)}</title>
  ${request.head_html ?? ''}
</head>
  <body${renderAttributes(request.body_attributes)}>
${request.body_html}
</body>
</html>`;
}
