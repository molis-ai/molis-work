/**
 * The bundle's entry (dist/settings-running-client.js): 设置 › 运行 (resident-runtime-design §5). Each time the page opens it reads both
 * switches from the desktop (`runtime_settings_get`; login at start is the system's own answer), and a change goes back the same way
 * (`runtime_settings_set`). A refusal puts the switch back and says why.
 */
interface RunningSettings { launch_at_login: boolean; keep_running: boolean }
interface TauriBridge { core: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> } }
const page = globalThis as typeof globalThis & { __TAURI__?: TauriBridge };
const root = document.querySelector<HTMLElement>("[data-running-settings]");

if (root && page.__TAURI__) {
  const bridge = page.__TAURI__;
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

export {};
