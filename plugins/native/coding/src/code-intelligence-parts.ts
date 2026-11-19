import type { AgentRunCodeIntelligence } from "@molis-ai/molis-work-contracts/services/agent-host";
import { escapeHtml, renderEnvCheckRow, t as uiText, type MwEnvCheckRowOptions } from "@molis-ai/molis-work-plugin-sdk/ui";

/** Language names are the languages' own; an id the Host does not know shows as it is. */
const NAMES: Readonly<Record<string, string>> = { typescript: "TypeScript", javascript: "JavaScript", python: "Python", rust: "Rust", go: "Go" };
export const languageName = (id: string) => NAMES[id] ?? id;

function languageRow(row: AgentRunCodeIntelligence["languages"][number]): MwEnvCheckRowOptions {
  const label = languageName(row.language);
  if (row.state === "ready") {
    return {
      state: "done",
      label,
      value: uiText.text(row.source === "tools" ? "coding.code-intel.from-tools" : "coding.code-intel.from-machine", { command: row.command }),
      status: { label: uiText.text("coding.env.badge.ready"), tone: "done" },
    };
  }
  // Decision 51: nothing is downloaded before batch 65's network rules; the person installs it, and the next round uses it.
  return {
    state: "blocked",
    label,
    value: uiText.text("coding.code-intel.missing", { command: row.command }),
    badge: { label: uiText.text("coding.code-intel.not-checked"), tone: "warning" },
    recovery: {
      tone: "warning",
      title: uiText.text("coding.code-intel.recovery-title", { language: label }),
      body: uiText.text("coding.code-intel.recovery-body", { language: label, command: row.command }),
    },
  };
}

/**
 * Coding A4 scheme A: one process line under the person's request, "Code understanding · N languages ready", that opens to which
 * program each language uses and where it came from. A language that is not ready opens the line and says, right under its row,
 * that its files are not checked this round — never that they have no errors — and what the person can do.
 */
export function buildCodeIntelligenceHtml(found: AgentRunCodeIntelligence | undefined): string {
  if (!found || (found.problem === undefined && !found.languages.length)) return "";
  const missing = found.languages.filter(row => row.state === "missing");
  const rows: MwEnvCheckRowOptions[] = found.problem !== undefined
    ? [{
      state: "failed",
      label: uiText.text("coding.code-intel.config"),
      value: found.problem,
      badge: { label: uiText.text("coding.code-intel.not-checked"), tone: "danger" },
      recovery: { tone: "danger", title: uiText.text("coding.code-intel.config-title"), body: uiText.text("coding.code-intel.config-body") },
    }]
    : found.languages.map(languageRow);
  const trouble = found.problem !== undefined || missing.length > 0;
  const summary = found.problem !== undefined ? uiText.text("coding.code-intel.config-summary")
    : missing.length ? uiText.text("coding.code-intel.not-ready", { languages: missing.map(row => languageName(row.language)).join(uiText.text("coding.list.joiner")) })
      : uiText.text("coding.code-intel.ready", { count: found.languages.length });
  const mark = `<span aria-hidden="true" data-mw-state="${trouble ? "blocked" : "done"}"></span>`;
  return `<details class="coding-activity coding-code-intel" data-coding-code-intel${trouble ? " open" : ""}><summary><span class="coding-tools-summary">${mark}<span>${escapeHtml(summary)}</span></span></summary><div class="mw-rec-list">${rows.map(renderEnvCheckRow).join("")}</div></details>`;
}
