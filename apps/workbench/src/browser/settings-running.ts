/**
 * The bundle's entry (dist/settings-running-client.js): 设置 › 运行 (resident-runtime-design §5), bound wherever the page is placed
 * (`molisWorkBindRunningSettings`, called by the settings area for each page it shows, and once for a page opened on its own). With the
 * desktop's commands at hand the page shows its two switches, read from the desktop each time (`runtime_settings_get`; login at start is
 * the system's own answer), and a change goes back the same way (`runtime_settings_set`); a refusal puts the switch back and says why.
 * Without them the page keeps saying where the switches are.
 */
interface RunningSettings { launch_at_login: boolean; keep_running: boolean }
interface TauriBridge { core: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> } }
const page = globalThis as typeof globalThis & { __TAURI__?: TauriBridge; molisWorkBindRunningSettings?: (container?: ParentNode) => void };

function bind(root: HTMLElement, bridge: TauriBridge): void {
  root.dataset.runningBound = "1";
  root.querySelector<HTMLElement>("[data-running-elsewhere]")?.setAttribute("hidden", "");
  root.querySelector<HTMLElement>("[data-running-switches]")?.removeAttribute("hidden");
  const error = root.querySelector<HTMLElement>("[data-running-error]");
  const switches = [...root.querySelectorAll<HTMLInputElement>("[data-running-setting]")];
  const show = (failure: unknown) => { if (error) { error.textContent = String(failure); error.hidden = false; } };
  const apply = (settings: RunningSettings) => {
    for (const control of switches) { control.checked = settings[control.dataset.runningSetting as keyof RunningSettings] === true; control.disabled = false; }
  };
  bridge.core.invoke("runtime_settings_get").then(value => apply(value as RunningSettings)).catch(show);
  for (const control of switches) {
    control.addEventListener("change", async () => {
      const wanted = control.checked;
      control.disabled = true;
      if (error) error.hidden = true;
      try { apply(await bridge.core.invoke("runtime_settings_set", { key: control.dataset.runningSetting, value: wanted }) as RunningSettings); }
      catch (failure) { control.checked = !wanted; control.disabled = false; show(failure); }
    });
  }
}

page.molisWorkBindRunningSettings = (container: ParentNode = document) => {
  const bridge = page.__TAURI__;
  if (!bridge) return;
  const roots = [...(container instanceof HTMLElement && container.matches("[data-running-settings]") ? [container] : []),
    ...container.querySelectorAll<HTMLElement>("[data-running-settings]")];
  for (const root of roots) if (!root.dataset.runningBound) bind(root, bridge);
};
page.molisWorkBindRunningSettings(document);

export {};
