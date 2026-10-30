/** 插件 in project settings (settings-plugins.ts): flat rows under folds, the install preview on one hairline ring. */
export const PLUGIN_TRUST_SETTINGS_STYLES = `
  .plugin-trust-settings :is(.plugin-trust-list, .plugin-trust-rows) { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .plugin-trust-settings .plugin-trust-body { display: flex; flex-direction: column; gap: 16px; padding: 4px 0 16px; font-size: 13px; }
  .plugin-trust-settings .plugin-trust-group { display: flex; flex-direction: column; gap: 6px; }
  .plugin-trust-settings .plugin-trust-group > strong { font-size: 12px; font-weight: 500; color: var(--ink-soft); }
  .plugin-trust-settings .plugin-trust-rows > li { display: flex; flex-direction: column; gap: 2px; padding: 6px 0; overflow-wrap: anywhere; }
  .plugin-trust-settings .plugin-trust-rows > li > :first-child { font-weight: 500; }
  .plugin-trust-settings .plugin-trust-rows > li > :is(.mw-btn, .mw-switch) { align-self: flex-start; margin-top: 4px; }
  .plugin-trust-settings .plugin-trust-preview { margin-top: 16px; padding: 16px; border-radius: 12px; box-shadow: 0 0 0 1px var(--line); }
  .plugin-trust-settings .plugin-trust-review { display: flex; flex-direction: column; gap: 16px; font-size: 13px; }
  .plugin-trust-settings .plugin-trust-review h3 { margin: 0; font-size: 15px; font-weight: 600; }
  .plugin-trust-settings .plugin-trust-pin { display: flex; flex-direction: column; gap: 6px; }
  .plugin-trust-settings .plugin-trust-actions { display: flex; justify-content: flex-end; gap: 8px; }
`;
