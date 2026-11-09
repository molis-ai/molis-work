/** Goals' words by stable key, declared in the Manifest's `ui.messages` (PG-071): what differs by language but is not a sentence. */
export const GOALS_MESSAGES = {
  "goals.presentation.empty": { zh: "还没有目标", en: "No goals yet" },
  "goals.presentation.summary": { zh: "本项目最近更新的目标", en: "Recently updated project goals" },
  "goals.presentation.start": { zh: "创建目标", en: "Create a goal" },
  "goals.quote.open": { zh: "「", en: "“" },
  "goals.quote.close": { zh: "」", en: "”" },
} as const;
