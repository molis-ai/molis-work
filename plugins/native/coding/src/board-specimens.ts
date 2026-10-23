import type { PluginBoardSpecimen, PluginBoardSpecimenPorts } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { groupByGoal, type CodingSessionEntry, type CodingSessionState } from "./projection.js";
import { renderCodingSessionGroup } from "./ui.js";

/**
 * Coding's rows on the component board (specs/visual-ui-experience VUX-39): sessions in each state that waits on the person,
 * runs or ended, under a Goal and with none, drawn by the directory's own renderer. Sample words, never a real session.
 */
type Sample = readonly [zh: string, en: string, mixed: string];
const GOAL: Sample = ["让首次导入不再卡住", "Unblock the first import", "让首次 import 不再卡住"];
const SESSIONS: ReadonlyArray<readonly [CodingSessionState, Sample, boolean]> = [
  ["running", ["登录兼容旧的 session cookie，公开接口不动，旧格式的过期时间按新的七天补上", "Sign-in reads the old session cookie, the public API stays, old cookies get the new seven-day expiry", "登录兼容旧的 session cookie，public API 不动，旧格式按新的 7 天补 expiry"], true],
  ["waiting-answer", ["导入向导的第一步", "The import wizard's first step", "Import wizard 的第一步"], true],
  ["waiting-approval", ["升级 pnpm 并重新锁定依赖", "Upgrade pnpm and relock dependencies", "升级 pnpm 并 relock 依赖"], false],
  ["reconcile-required", ["推送 feature/session-cookie", "Push feature/session-cookie", "推送 feature/session-cookie 分支"], false],
  ["failed", ["修复 tests/session.test.ts", "Fix tests/session.test.ts", "修 tests/session.test.ts 的 flaky case"], false],
  ["paused", ["整理 docs/auth.md", "Tidy docs/auth.md", "整理 docs/auth.md 的 rotation 一节"], false],
  ["done", ["给 readCookie 加单元测试", "Unit tests for readCookie", "给 readCookie 加 unit tests"], false],
];
const WORDS = { zh: 0, en: 1, mixed: 2 } as const;

export function codingBoardSpecimens(p: PluginBoardSpecimenPorts): readonly PluginBoardSpecimen[] {
  const say = (sample: Sample) => sample[WORDS[p.sample]];
  const entries: CodingSessionEntry[] = SESSIONS.map(([state, title, goal], index) => ({
    session_id: "board-" + state, title: say(title), state, updated_at: new Date(Date.UTC(2026, 9, 23, 9, 40 - index * 7)).toISOString(),
    ...(goal ? { goal_id: "board-goal", goal_title: say(GOAL) } : {}),
  }));
  const groups = groupByGoal(entries).map((group) => renderCodingSessionGroup(group.goal_id, group.goal_id === null ? p.text("coding.directory.no-goal") : group.title, group.entries, p));
  return [{ id: "coding-sessions", place: "column", title: p.text("coding.board.sessions"), html: `<div class="coding-session-list">${groups.join("")}</div>` }];
}
