import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ArtifactPluginInput } from "./browser-view.js";

interface Primitives { escape(value: string): string; text(value: string): string }

const STATE = { this: "workbench.port-input-ui.reading-version", "another-version": "workbench.port-input-ui.reading-another-fixed-version", none: "workbench.port-input-ui.no-source-yet" } as const;

/**
 * 「交给插件作为输入」 in a 成果 version's detail (artifact-positioning, 2026-10-04): each enabled plugin input port that takes
 * this version's type, what it reads now, and one button — give it this version, or put back its former source.
 */
export function renderArtifactPortInputs(inputs: ReadonlyArray<ArtifactPluginInput>, reference: { artifact_id: string; version: number }, p: Primitives): string {
  const rows = inputs.map((input) => {
    const state = input.source === "plugin" ? uiText.text("workbench.port-input-ui.following-source").replace("{source}", p.escape(input.source_title ?? "")) : uiText.text(STATE[input.source]);
    const action = input.source === "this" ? "restore" : "use";
    return `<li data-artifact-port data-plugin-id="${p.escape(input.plugin_id)}" data-port="${p.escape(input.port)}"><strong>${p.escape(input.plugin_title)}</strong><span>${p.escape(input.port)}</span><small>${state}</small><button class="mw-btn mw-btn--sm${action === "restore" ? " mw-btn--ghost" : ""}" type="button" data-artifact-port-input="${action}">${uiText(action === "restore" ? "workbench.port-input-ui.back-former-source" : "workbench.port-input-ui.use-version")}</button></li>`;
  }).join("");
  return `<section class="artifact-port-inputs" data-artifact-port-inputs data-artifact-reference="${p.escape(JSON.stringify(reference))}"><h2>${uiText("workbench.port-input-ui.give-plugin-input")}</h2><ul>${rows}</ul><p class="artifact-port-inputs-status" data-artifact-port-inputs-status role="status"></p></section>`;
}

/** Runs inside the workbench's 成果 client and shares its `route`, `readText`, `loadArtifacts` and `artifactPath`. */
export const ARTIFACT_PORT_INPUT_CLIENT_SCRIPT = String.raw`
  document.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-artifact-port-input]");
    const row = button?.closest("[data-artifact-port]"), section = row?.closest("[data-artifact-port-inputs]");
    if (!section || button.disabled) return;
    const status = section.querySelector("[data-artifact-port-inputs-status]");
    button.disabled = true; status.textContent = "";
    try {
      await molisWorkRequest(route("/api/artifacts/plugin-inputs"), { body: { reference: JSON.parse(section.dataset.artifactReference), plugin_id: row.dataset.pluginId, port: row.dataset.port,
        restore: button.dataset.artifactPortInput === "restore" }, fallback: globalThis.t.text("workbench.port-input-ui.could-not-change-plugin-s-input") });
      void loadArtifacts(artifactPath || route("/artifacts"), true);
    } catch (error) { status.textContent = error.message; button.disabled = false; }
  });
`;
