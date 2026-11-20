import { renderCheckLine, t as uiText, type MwCheckFact } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { AgentTextReviewDocument, AgentWriteChecks } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * The check line of a file card (Coding A4-2, docs/design/coding-daily-basics scheme A): under the file's name, whether the proposed
 * text brings new errors and what formatting did, each with its source; the errors one per row. With new errors the card's primary
 * becomes 先让它修好, a refusal whose reason (`note`) hands the errors back to the round, unless the person writes their own.
 * 没查 is said with its cause, never drawn as 没有错误; a card with no check (no hook, or a text the check did not see) shows none.
 */
export function reviewChecks(document: AgentTextReviewDocument): { readonly html: string; readonly note?: string } {
  const checks = document.checks;
  if (!checks) return { html: "" };
  const facts: MwCheckFact[] = [diagnosticsFact(checks.diagnostics)];
  const formatting = checks.formatting;
  if (formatting.state === "formatted") facts.push({ state: "done", text: uiText.text("workbench.agent-review.checks-formatted", { n: formatting.lines }), source: formatting.source });
  if (formatting.state === "failed") facts.push({ state: "failed", text: uiText.text("workbench.agent-review.checks-format-failed"), source: formatting.reason.split("\n")[0]!.slice(0, 120) });
  const diagnostics = checks.diagnostics;
  const errors = diagnostics.state === "errors" ? diagnostics.errors.map(error => ({ code: error.code, where: uiText.text("workbench.agent-review.checks-line", { line: error.line }), text: error.text })) : [];
  const html = renderCheckLine({ label: uiText.text("workbench.agent-review.checks-label"), facts, errors, attrs: { "data-agent-review-checks": "" } });
  if (diagnostics.state !== "errors") return { html };
  const count = diagnostics.errors.length + diagnostics.more;
  const list = diagnostics.errors.map(error => `${document.target_path}:${error.line} ${error.code} ${error.text}`).join("\n");
  return { html, note: uiText.text("workbench.agent-review.checks-fix-note", { n: count, errors: list }) };
}

function diagnosticsFact(diagnostics: AgentWriteChecks["diagnostics"]): MwCheckFact {
  if (diagnostics.state === "clean") return { state: "done", text: uiText.text("workbench.agent-review.checks-clean"), source: diagnostics.source };
  if (diagnostics.state === "errors") return { state: "failed", text: uiText.text("workbench.agent-review.checks-errors", { n: diagnostics.errors.length + diagnostics.more }), source: diagnostics.source };
  return { state: "idle", text: uiText.text(`workbench.agent-review.checks-unchecked-${diagnostics.cause}`),
    ...(diagnostics.cause === "failed" ? { source: diagnostics.reason.split("\n")[0]!.slice(0, 120) } : {}) };
}
