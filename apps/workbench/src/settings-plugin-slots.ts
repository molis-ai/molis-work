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
  const { L, escapeHtml: e } = p, slots = view.plugin_slots ?? [];
  if (!slots.length) return "";
  const rows = slots.map(slot => {
    const service = cards.find(card => card.connector_id === slot.service_id)?.title ?? slot.service_id;
    const accounts = connections.filter(connection => connection.service_id === slot.service_id && !connection.project_id
      && (connection.state !== "disconnected" || connection.connection_id === slot.connection_id));
    const options = accounts.map(connection => `<option value="${e(connection.connection_id)}"${connection.connection_id === slot.connection_id ? " selected" : ""}>${e(connection.display_name)}${connection.account_label ? ` · ${e(connection.account_label)}` : ""}${connection.state === "disconnected" ? ` · ${L("已断开")}` : ""}</option>`).join("");
    return `<div class="settings-connection-row settings-plugin-slot" data-plugin-slot data-install-id="${e(slot.install_id)}" data-plugin-id="${e(slot.plugin_id)}" data-slot-id="${e(slot.slot_id)}" data-service-id="${e(slot.service_id)}">
      ${p.mark(slot.service_id)}
      <div class="settings-connection-row__identity"><strong>${e(slot.plugin_name)}</strong><small>${e(service)} · ${e(slot.reason)}</small></div>
      <div class="settings-connection-row__actions">
        <label class="settings-connector-field"><span>${L("使用的账号")}</span><select class="mw-input" data-plugin-slot-account data-saved="${e(slot.connection_id ?? "")}">
          <option value=""${slot.connection_id ? "" : " selected"}>${L("不用账号（请求不带凭据）")}</option>${options}</select></label>
        ${accounts.length ? "" : `<button class="mw-btn mw-btn--secondary" type="button" data-connector-open="${e(slot.service_id)}">${L("连接 {service}", { service })}</button>`}
      </div>
      <div class="settings-connection-result" data-plugin-slot-result role="status" aria-live="polite" hidden></div>
    </div>`;
  }).join("");
  const project = view.context_project;
  return `<section class="settings-connection-section settings-plugin-slots" aria-label="${e(L("插件用的账号"))}" data-plugin-slots${project ? ` data-plugin-slots-project="${e(project.project_id)}"` : ""}>
    <header><div><h2>${L("插件用的账号")}</h2><p>${L("插件经平台向这些服务发请求时用哪个账号。插件看不到凭据；不选账号时，请求不带凭据。")}${project ? "" : ` ${L("这里只列出个人插件；从项目进入设置，可以看到这个项目装的插件。")}`}</p></div></header>
    <div class="settings-connection-list">${rows}</div>
  </section>`;
}
