import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";

/**
 * The bundle's entry (dist/upgrade-opening-client.js): the program of the page the maintenance listener answers while a Home upgrades
 * (upgrade-continuity U3 §4). It asks `/upgrade-progress` twice a second. For the first two seconds of an upgrade it shows nothing; then
 * "正在升级 n / m". An answer that is not the listener's (anything but 200) is the Host serving again, and the page reloads into it. No
 * answer at all is the moment between the two, and it asks again.
 */
const { molisWorkRequest } = globalThis as typeof globalThis & { molisWorkRequest: UiRequest };
const box = document.querySelector<HTMLElement>("[data-upgrade-status]");
const line = box?.querySelector<HTMLElement>(".mw-bar-status__text strong");

interface Progress { readonly done: number; readonly total: number; readonly started_at: number; readonly state: string }

async function tick(): Promise<void> {
  let response: Response | null = null;
  try { response = await molisWorkRequest<Response>("/upgrade-progress", { as: "response" }); }
  catch { response = null; /* Between the maintenance listener and the Host nothing answers for a moment: ask again. */ }
  if (response && !response.ok) { location.reload(); return; }
  if (response && box && line) {
    const progress = await response.json() as Progress;
    if (progress.state === "upgrading" && Date.now() - progress.started_at >= 2000) {
      line.textContent = (box.dataset.template ?? "").replace("%done", String(progress.done)).replace("%total", String(progress.total));
      box.hidden = false;
    }
  }
  setTimeout(() => void tick(), 500);
}

void tick();
