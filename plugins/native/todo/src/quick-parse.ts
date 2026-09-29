export interface TodoQuickPart {
  /** Which field the phrase fills. */
  readonly field: "due_date" | "planned_date" | "remind_at";
  /** The words as the person wrote them, so the label can show "原文：周四前". */
  readonly phrase: string;
  readonly date: string;
  /** HH:MM when a time came with it. */
  readonly time: string | null;
}

export interface TodoQuickParse {
  /** The text without the recognised phrases. */
  readonly title: string;
  readonly parts: readonly TodoQuickPart[];
}

/**
 * Reads dates out of a one-line todo without a model: "周四前…" is a due date, "周四…" a planned day,
 * "…提醒我" a reminder. Anything it cannot read stays in the title. Self-contained (no imports, no outer
 * names) because the browser client embeds its source text.
 */
export function parseTodoQuickText(text: string, now: Date): TodoQuickParse {
  const pad = (value: number) => String(value).padStart(2, "0");
  const iso = (at: Date) => at.getFullYear() + "-" + pad(at.getMonth() + 1) + "-" + pad(at.getDate());
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const numerals: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 日: 7, 天: 7 };
  const number = (value: string): number => {
    if (/^\d+$/u.test(value)) return Number(value);
    if (value === "十") return 10;
    if (value.startsWith("十")) return 10 + (numerals[value.slice(1)] ?? 0);
    if (value.endsWith("十")) return (numerals[value[0]!] ?? 0) * 10;
    if (value.includes("十")) return (numerals[value[0]!] ?? 0) * 10 + (numerals[value.slice(2)] ?? 0);
    return numerals[value] ?? NaN;
  };
  const weekday = (target: number, week: "" | "this" | "next"): Date => {
    const today = now.getDay() === 0 ? 7 : now.getDay();
    if (week === "next") return day(7 - today + target);
    if (week === "this") return day(target - today);
    return day(((target - today) + 7) % 7);
  };

  const DATE = "(今天|明天|后天|大后天|(?:下下?周|下星期|下礼拜|这周|本周|这星期|周|星期|礼拜)[一二三四五六日天1-7]|月底|(?:\\d{4}年)?\\d{1,2}月\\d{1,2}[日号]|\\d{1,2}[日号]|\\d{4}-\\d{1,2}-\\d{1,2})";
  const TIME = "(?:(上午|早上|中午|下午|傍晚|晚上)?\\s*(\\d{1,2}|[一二两三四五六七八九十]{1,3})(?:[:：](\\d{2})|点(半|\\d{1,2}分?)?))";
  const pattern = new RegExp(DATE + "\\s*(?:" + TIME + ")?\\s*(之前|以前|前|截止)?(\\s*提醒我?)?", "u");
  const timeOnly = new RegExp(TIME + "\\s*提醒我?", "u");

  const resolveDate = (word: string): Date | null => {
    if (word === "今天") return day(0);
    if (word === "明天") return day(1);
    if (word === "后天") return day(2);
    if (word === "大后天") return day(3);
    if (word === "月底") return new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const week = /^(下下?周|下星期|下礼拜|这周|本周|这星期|周|星期|礼拜)(.)$/u.exec(word);
    if (week) {
      const target = /\d/u.test(week[2]!) ? Number(week[2]) : numerals[week[2]!]!;
      if (week[1] === "下下周") return new Date(weekday(target, "next").getTime() + 7 * 86_400_000);
      return weekday(target, week[1]!.startsWith("下") ? "next" : ["这周", "本周", "这星期"].includes(week[1]!) ? "this" : "");
    }
    const full = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u.exec(word);
    if (full) return new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3]));
    const monthDay = /^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]$/u.exec(word);
    if (monthDay) {
      const year = monthDay[1] ? Number(monthDay[1]) : now.getFullYear();
      const at = new Date(year, Number(monthDay[2]) - 1, Number(monthDay[3]));
      // "3月1日" said in December means next year's; an explicit year is kept as written.
      return !monthDay[1] && iso(at) < iso(day(-31)) ? new Date(year + 1, Number(monthDay[2]) - 1, Number(monthDay[3])) : at;
    }
    const dayOnly = /^(\d{1,2})[日号]$/u.exec(word);
    if (dayOnly) {
      const at = new Date(now.getFullYear(), now.getMonth(), Number(dayOnly[1]));
      return iso(at) < iso(day(0)) ? new Date(now.getFullYear(), now.getMonth() + 1, Number(dayOnly[1])) : at;
    }
    return null;
  };
  const valid = (at: Date | null, word: string) => {
    if (!at || !Number.isFinite(at.getTime())) return false;
    const monthDay = /(\d{1,2})月(\d{1,2})/u.exec(word) ?? /-(\d{1,2})-(\d{1,2})$/u.exec(word);
    return !monthDay || (at.getMonth() + 1 === Number(monthDay[1]) && at.getDate() === Number(monthDay[2]));
  };
  const resolveTime = (period: string | undefined, hourText: string | undefined, minuteText: string | undefined, half: string | undefined): string | null => {
    if (!hourText) return null;
    let hour = number(hourText);
    if (!Number.isFinite(hour) || hour > 24) return null;
    const minute = minuteText ? Number(minuteText) : half === "半" ? 30 : half ? Number(half.replace("分", "")) : 0;
    if (!Number.isFinite(minute) || minute > 59) return null;
    if (period && ["下午", "傍晚", "晚上"].includes(period) && hour < 12) hour += 12;
    else if (period === "中午" && hour < 5) hour += 12;
    else if (!period && hour >= 1 && hour <= 6) hour += 12;
    if (hour === 24) hour = 0;
    return pad(hour) + ":" + pad(minute);
  };

  const parts: TodoQuickPart[] = [];
  let rest = text;
  const match = pattern.exec(rest);
  if (match) {
    const [phrase, word, period, hour, minute, half, before, remind] = match;
    const at = resolveDate(word!);
    const time = resolveTime(period, hour, minute, half);
    if (valid(at, word!)) {
      const date = iso(at!);
      if (remind) parts.push({ field: "remind_at", phrase: phrase!.trim(), date, time: time ?? "09:00" });
      else if (before) parts.push({ field: "due_date", phrase: phrase!.trim(), date, time });
      else parts.push({ field: "planned_date", phrase: word!, date, time: null });
      // A time with a plain day has no field of its own, so only the day leaves the title.
      rest = !remind && !before && time ? rest.replace(word!, " ") : rest.replace(phrase!, " ");
    }
  } else {
    const alone = timeOnly.exec(rest);
    const time = alone ? resolveTime(alone[1], alone[2], alone[3], alone[4]) : null;
    if (alone && time) {
      const passed = time <= pad(now.getHours()) + ":" + pad(now.getMinutes());
      parts.push({ field: "remind_at", phrase: alone[0].trim(), date: iso(day(passed ? 1 : 0)), time });
      rest = rest.replace(alone[0], " ");
    }
  }
  const title = rest.replace(/\s+/gu, " ").replace(/^[\s，,、:：]+|[\s，,、]+$/gu, "").trim();
  return { title: title || text.trim(), parts };
}
