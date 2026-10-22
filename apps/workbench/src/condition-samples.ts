/**
 * The body samples of the component board's conditions frame (specs/visual-ui-experience VUX-39, §render-lifecycle 同源标本):
 * fixed replies in Chinese, English and the two mixed, one about code and one not, each with an emoji, a long URL, inline code
 * and a table. They are sample content, the words a model would write, so they are not translated: the frame's own labels are.
 */
export type ConditionText = "zh" | "en" | "mixed";
export type ConditionKind = "code" | "prose";

const FENCE = "```";
const LONG_URL = "https://example.com/docs/authentication/session-cookies/old-format-and-rotation-notes?section=rotation&lang=zh-CN#rotation-window";

// Twenty-two lines, so the shipped block folds (more than 18) and offers its 展开全部 button.
const CODE = [
  "import { readCookie, rotate } from \"./cookie.js\";",
  "",
  "export interface Session {",
  "  id: string;",
  "  user: string;",
  "  expiresAt: number;",
  "}",
  "",
  "/** Reads a session written by the old and the new format alike. */",
  "export function readSession(header: string, now = Date.now()): Session | null {",
  "  const raw = readCookie(header, \"sid\") ?? readCookie(header, \"session\");",
  "  if (!raw) return null;",
  "  const [id, user, expires] = raw.split(\".\");",
  "  if (!id || !user) return null;",
  "  const expiresAt = Number(expires ?? 0) || now + 7 * 86_400_000;",
  "  if (expiresAt <= now) return null;",
  "  return { id, user, expiresAt };",
  "}",
  "",
  "export function refresh(session: Session): string {",
  "\treturn rotate(session.id, { days: 7 });",
  "}",
].join("\n");

const DIFF = [
  "--- a/auth/session.ts",
  "+++ b/auth/session.ts",
  "@@ -10,6 +10,9 @@ export function readSession(header: string) {",
  "-  const raw = readCookie(header, \"sid\");",
  "+  const raw = readCookie(header, \"sid\") ?? readCookie(header, \"session\");",
  "   if (!raw) return null;",
  "+  // The old format has no expiry: give it the new window.",
  "+  const expiresAt = Number(expires ?? 0) || now + 7 * 86_400_000;",
].join("\n");

const block = (language: string, body: string) => `${FENCE}${language}\n${body}\n${FENCE}`;

const CODE_SAMPLES: Record<ConditionText, string> = {
  zh: `## 登录兼容旧的会话 Cookie\n\n改好了 \`auth/session.ts\`：旧格式也读得到，过期时间按新的七天补上 👩‍💻。依据见 ${LONG_URL}\n\n${block("ts", CODE)}\n\n这一处改动：\n\n${block("diff", DIFF)}\n\n| 检查 | 结果 |\n| --- | --- |\n| 单元测试 | 42 个通过 |\n| 旧 Cookie | 可读 |\n| 公开接口 | 没动 |`,
  en: `## Sign-in keeps the old session cookie\n\n\`auth/session.ts\` now reads the old format too, and gives it the new seven-day expiry 👩‍💻. Background: ${LONG_URL}\n\n${block("ts", CODE)}\n\nThe change:\n\n${block("diff", DIFF)}\n\n| Check | Result |\n| --- | --- |\n| Unit tests | 42 passed |\n| Old cookie | Readable |\n| Public API | Unchanged |`,
  mixed: `## 登录兼容旧的 session cookie\n\n\`readSession()\` 现在先读 \`sid\`，再读旧的 \`session\`；rotation window 仍是 7 days 👩‍💻。See ${LONG_URL}\n\n${block("ts", CODE)}\n\nDiff 如下：\n\n${block("diff", DIFF)}\n\n| 检查 Check | 结果 Result |\n| --- | --- |\n| Unit tests | 42 个通过 |\n| Old cookie | 可读 readable |`,
};

const PROSE_SAMPLES: Record<ConditionText, string> = {
  zh: `## 试用复盘的安排\n\n周五上午十点一起复盘 45 分钟，只看首次使用 🗓️。材料在 ${LONG_URL}\n\n1. 先过一遍 12 位试用者的首次使用记录\n2. 再看三处卡住最久的地方\n3. 最后定下一步和负责人\n\n> 只交回答案；创建日程前会再请你确认。\n\n| 事项 | 负责人 | 状态 |\n| --- | --- | --- |\n| 整理记录 | 王一骏 | 进行中 |\n| 预订会议室 | 待定 | 等你确认 |`,
  en: `## Planning the trial review\n\nA 45-minute review together on Friday at 10:00, on first use only 🗓️. Materials: ${LONG_URL}\n\n1. Go through the first-use notes of the 12 people in the trial\n2. Look at the three places they were stuck longest\n3. Agree the next step and who owns it\n\n> Only the answers go back; you confirm before the event is created.\n\n| Item | Owner | State |\n| --- | --- | --- |\n| Sort the notes | Yijun Wang | In progress |\n| Book a room | Not decided | Waiting for you |`,
  mixed: `## Trial review 的安排\n\n周五 10:00 review 45 分钟，只看 first-run 🗓️。Materials 在 ${LONG_URL}\n\n1. 先过一遍 12 位 testers 的记录\n2. 再看三处 stuck 最久的地方\n3. 定 next step 和 owner\n\n> Only answers go back；创建日程前会再确认。\n\n| 事项 Item | Owner | 状态 |\n| --- | --- | --- |\n| 整理 notes | 王一骏 | In progress |\n| Book a room | 待定 | 等你确认 |`,
};

const QUESTIONS: Record<ConditionKind, Record<ConditionText, string>> = {
  code: { zh: "登录要兼容旧的 session cookie", en: "Sign-in should keep accepting the old session cookie", mixed: "登录要兼容旧的 session cookie, keep the public API" },
  prose: { zh: "帮我安排一次试用复盘", en: "Help me plan a review of the trial", mixed: "帮我安排一次 trial review" },
};

export function conditionSample(kind: ConditionKind, text: ConditionText): { question: string; reply: string } {
  return { question: QUESTIONS[kind][text], reply: (kind === "code" ? CODE_SAMPLES : PROSE_SAMPLES)[text] };
}

/** The reply as it would stream: whole code points, `steps` growing prefixes ending with the whole reply. */
export function conditionStream(reply: string, steps = 16): string[] {
  const points = [...reply], cuts: string[] = [];
  for (let at = 1; at <= steps; at += 1) cuts.push(points.slice(0, Math.ceil(points.length * at / steps)).join(""));
  return cuts;
}
