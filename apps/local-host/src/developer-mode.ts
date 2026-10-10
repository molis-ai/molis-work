/**
 * Developer mode is a switch of the Host process, not of the person's settings: it is on when the Host was started with
 * `MOLIS_WORK_DEVELOPER_MODE=1`. The user decided (2026-10-09) that this is the only way to turn it on; there is no Settings
 * toggle. It adds to the plugin list what is otherwise kept out of it (Text Stats, the platform's smallest reference plugin
 * and a test fixture). It changes nothing else: no plugin behaves differently, and nothing the person does or sees elsewhere
 * depends on it.
 */
export function developerMode(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.MOLIS_WORK_DEVELOPER_MODE === "1";
}
