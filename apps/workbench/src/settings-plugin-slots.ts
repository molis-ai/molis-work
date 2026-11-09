import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ConnectorSettingsCardView, ConnectorSettingsConnection, MolisWorkSettingsView } from "./settings-view.js";

interface PluginSlotsPrimitives {
  L(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  /** The service's mark, drawn as the connection rows above draw it. */
  mark(serviceId: string): string;
}

/**
 * 服务连接 › 插件用的账号 (BL-350): for each installation slot a plugin declares, which of the person's accounts it sends with. Choosing
 * saves at once (`connectors.plugin_slot.bind@1`, the person's own call); a service with no account offers the way to connect one.
 * Only the person's own connections of that service are offered: a project's MCP connection is not an account a plugin can use.
 */
export function renderPluginSlots(view: Pick<MolisWorkSettingsView, "plugin_slots" | "context_project">, cards: readonly ConnectorSettingsCardView[],
  connections: readonly ConnectorSettingsConnection[], p: PluginSlotsPrimitives): string {
  const { escapeHtml: e } = p, slots = view.plugin_slots ?? [];
  if (!slots.length) return "";
  const rows = slots.map(slot => {
    const service = cards.find(card => card.connector_id === slot.service_id)?.title ?? slot.service_id;
    const accounts = connections.filter(connection => connection.service_id === slot.service_id && !connection.project_id
      && (connection.state !== "disconnected" || connection.connection_id === slot.connection_id));
    // A tenant's account saved before its site was pinned (BL-595) sends nothing until it is connected again: it says so, and only the
    // one already bound can stay chosen.
    const stale = (connection: ConnectorSettingsConnection) => slot.tenant && !connection.target_origin;
    const options = accounts.map(connection => {
      const chosen = connection.connection_id === slot.connection_id, note = connection.state === "disconnected" ? uiText.text("workbench.settings-plugin-slots.disconnected") : stale(connection) ? uiText.text("workbench.settings-plugin-slots.needs-reconnecting") : "";
      return `<option value="${e(connection.connection_id)}"${chosen ? " selected" : stale(connection) ? " disabled" : ""}${stale(connection) ? " data-needs-reconnect" : ""}>${e(connection.display_name)}${connection.account_label ? ` · ${e(connection.account_label)}` : ""}${note ? ` · ${note}` : ""}</option>`;
    }).join("");
    const reconnect = accounts.some(connection => connection.connection_id === slot.connection_id && stale(connection));
    return `<div class="settings-connection-row settings-plugin-slot" data-plugin-slot="${e(JSON.stringify({ install_id: slot.install_id, plugin_id: slot.plugin_id, slot_id: slot.slot_id, service_id: slot.service_id }))}">
      ${p.mark(slot.service_id)}
      <div class="settings-connection-row__identity"><strong>${e(slot.plugin_name)}</strong><small>${e(service)} · ${e(slot.reason)}</small></div>
      <div class="settings-connection-row__actions">
        <label class="settings-connector-field"><span>${uiText("workbench.settings-plugin-slots.account-used")}</span><select class="mw-input" data-plugin-slot-account data-saved="${e(slot.connection_id ?? "")}"${slot.tenant ? " data-tenant" : ""}>
          <option value=""${slot.connection_id ? "" : " selected"}>${slot.tenant ? uiText("workbench.settings-plugin-slots.no-account-plugin-cannot-send-requests-service") : uiText("workbench.settings-plugin-slots.no-account-requests-carry-no-credentials")}</option>${options}</select></label>
        ${!accounts.length || reconnect ? `<button class="mw-btn mw-btn--secondary" type="button" data-connector-open="${e(slot.service_id)}">${uiText(reconnect ? "workbench.settings-plugin-slots.reconnect-service" : "workbench.settings-plugin-slots.connect-service", { service })}</button>` : ""}
      </div>
      <div class="settings-connection-result" data-plugin-slot-result role="status" aria-live="polite" hidden></div>
    </div>`;
  }).join("");
  const project = view.context_project;
  return `<section class="settings-connection-section settings-plugin-slots" aria-label="${e(uiText.text("workbench.settings-plugin-slots.accounts-plugins-use"))}" data-plugin-slots="${e("plugin-slots" + (project ? "?project=" + encodeURIComponent(project.project_id) : ""))}">
    <header><div><h2>${uiText("workbench.settings-plugin-slots.accounts-plugins-use")}</h2><p>${uiText("workbench.settings-plugin-slots.which-account-plugin-uses-when-sends-requests-these")}${project ? "" : ` ${uiText.text("workbench.settings-plugin-slots.only-personal-plugins-listed-here-open-settings-project")}`}</p></div></header>
    <div class="settings-connection-list">${rows}</div>
  </section>`;
}
