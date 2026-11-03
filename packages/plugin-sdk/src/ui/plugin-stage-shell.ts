function attr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

/**
 * Host-owned plugin stage chrome. Plugins fill the list and workspace; they
 * do not invent a second shell.
 */
export function renderPluginStageShell(input: {
  surface: string;
  label: string;
  dataset: string;
  extraAttrs?: string;
  body: string;
}): string {
  const extra = input.extraAttrs ? ` ${input.extraAttrs}` : "";
  return `<section class="desktop-work-surface plugin-stage-shell" data-work-surface="${attr(input.surface)}" data-work-surface-label="${attr(input.label)}" hidden data-${attr(input.dataset)}="workbench" data-${attr(input.dataset)}-stage-shell data-expanded="false"${extra}>${input.body}</section>`;
}
