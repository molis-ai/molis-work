import type { ArtifactPluginInput } from "./actions.js";

interface Primitives { escape(value: string): string; text(value: string): string }

const STATE = { this: "正在读这一版", "another-version": "正在读另一版固定的成果", none: "还没有来源" } as const;

/**
 * 「交给插件作为输入」 in a 成果 version's detail (artifact-positioning, 2026-10-04): each enabled plugin input port that takes
 * this version's type, what it reads now, and one button — give it this version, or put back its former source.
 */
export function renderArtifactPortInputs(inputs: ReadonlyArray<ArtifactPluginInput>, reference: { artifact_id: string; version: number }, p: Primitives): string {
  const rows = inputs.map((input) => {
    const state = input.source === "plugin" ? p.text("现在跟着 {source}").replace("{source}", p.escape(input.source_title ?? "")) : p.text(STATE[input.source]);
    const action = input.source === "this" ? "restore" : "use";
    return `<li data-artifact-port data-plugin-id="${p.escape(input.plugin_id)}" data-port="${p.escape(input.port)}"><strong>${p.escape(input.plugin_title)}</strong><span>${p.escape(input.port)}</span><small>${state}</small><button class="mw-btn mw-btn--sm${action === "restore" ? " mw-btn--ghost" : ""}" type="button" data-artifact-port-input="${action}">${p.text(action === "restore" ? "改回原来的来源" : "改用这一版")}</button></li>`;
  }).join("");
  return `<section class="artifact-port-inputs" data-artifact-port-inputs data-artifact-reference="${p.escape(JSON.stringify(reference))}"><h2>${p.text("交给插件作为输入")}</h2><ul>${rows}</ul><p class="artifact-port-inputs-status" data-artifact-port-inputs-status role="status"></p></section>`;
}

/** Runs inside the workbench's 成果 client and shares its `route`, `L`, `loadArtifacts` and `artifactPath`. */
export const ARTIFACT_PORT_INPUT_CLIENT_SCRIPT = String.raw`
  document.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-artifact-port-input]");
    const row = button?.closest("[data-artifact-port]"), section = row?.closest("[data-artifact-port-inputs]");
    if (!section || button.disabled) return;
    const status = section.querySelector("[data-artifact-port-inputs-status]");
    button.disabled = true; status.textContent = "";
    try {
      const response = await fetch(route("/api/artifacts/plugin-inputs"), { method: "POST",
        headers: { ...(globalThis.molisWorkControlHeaders?.() || {}), "content-type": "application/json", "x-molis-work-idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ reference: JSON.parse(section.dataset.artifactReference), plugin_id: row.dataset.pluginId, port: row.dataset.port,
          restore: button.dataset.artifactPortInput === "restore" }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || L("没能改插件的输入"));
      void loadArtifacts(artifactPath || route("/artifacts"), true);
    } catch (error) { status.textContent = error.message; button.disabled = false; }
  });
`;
