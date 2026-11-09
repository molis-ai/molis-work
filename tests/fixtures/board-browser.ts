import { openGoalBrowser } from "./goal-browser.js";

/** D0292: component specimens explicitly run in a development Host, with no user setting change. */
export async function openBoardBrowser(...args: Parameters<typeof openGoalBrowser>) {
  const [t] = args, previous = process.env.MOLIS_WORK_DEVELOPER_MODE;
  process.env.MOLIS_WORK_DEVELOPER_MODE = "1";
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_DEVELOPER_MODE; else process.env.MOLIS_WORK_DEVELOPER_MODE = previous; });
  return openGoalBrowser(...args);
}
