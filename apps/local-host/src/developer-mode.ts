/**
 * Developer mode is a switch of the Host process, not of the person's settings: it is on when the Host was started with
 * `MOLIS_WORK_DEVELOPER_MODE=1`. The user decided (2026-10-09) that this is the only way to turn it on; there is no Settings
 * toggle. Its only effect is opening the component board (`/__ui/catalog`, D0292); the plugin list, plugin behavior and
 * authorization are the same in either mode.
 */
export function developerMode(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.MOLIS_WORK_DEVELOPER_MODE === "1";
}
