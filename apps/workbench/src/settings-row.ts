/** One line of a settings page: what it is, what it means, and its value or control. All three are already HTML. */
export function settingRow(title: string, description: string, value: string): string {
  return `<section class="settings-setting-row"><div class="setting-copy"><strong>${title}</strong><span>${description}</span></div><div class="setting-value">${value}</div></section>`;
}
