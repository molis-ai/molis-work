import { renderDialog } from "@molis-ai/molis-work-design-system";
import { renderButton, t } from "@molis-ai/molis-work-plugin-sdk/ui";

export function renderAutomationRecommendations() {
  const text = (key: string) => t.text("workbench.automation." + key);
  return renderDialog({
    labelledBy: "automation-title", title: text("title"), closeLabel: t.text("common.control.close"),
    className: "automation-dialog", attrs: { "data-automation-dialog": true },
    body: '<p data-automation-progress role="status"></p><p data-automation-error role="alert" hidden></p><div data-automation-result></div>',
    footer: renderButton({ label: t.text("common.control.retry"), variant: "ghost", attrs: { "data-automation-retry": true, hidden: true } })
      + renderButton({ label: text("save"), variant: "primary", attrs: { "data-automation-save": true, hidden: true } }),
  });
}

export const AUTOMATION_STYLES = `
.automation-dialog { width: min(680px, calc(100% - 24px)); }
.automation-dialog .mw-form__body { overflow: auto; }
.automation-dialog section { padding-block: var(--space-3, 12px); border-bottom: 1px solid var(--line); }
.automation-dialog :is(section h3,details summary) { color: var(--ink); }
.automation-dialog h3 { font-size: var(--text-sm, 13px); margin: 0 0 8px; }
.automation-dialog details { padding-block: 6px; }
.automation-dialog summary { cursor: pointer; line-height: 1.5; }
.automation-dialog [data-automation-error] { color: var(--danger, var(--ink)); }
.automation-dialog :is(p, li) { overflow-wrap: anywhere; }
.automation-dialog .automation-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.automation-dialog p:empty { display: none; }
`;
