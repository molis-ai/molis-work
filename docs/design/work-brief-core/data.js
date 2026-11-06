// Sample data for the Work Brief core prototype (batch 19). Made-up project, people and numbers; nothing is read from a Home.
window.WB = {
  project: { zh: "Atlas 迁移", en: "Atlas migration" },
  // Sources = plugins that own the facts. hue = the component board's --hue-* token family; pulse: g(reen) / y(ellow) / r(ed) / na.
  sources: {
    goals: { zh: "Goals", en: "Goals", icon: "target", hue: "blue", pulse: "y", asOf: "09:00", fact: { zh: "3 个目标 · 1 条要求受阻", en: "3 goals · 1 requirement blocked" } },
    todo: { zh: "待办", en: "To-dos", icon: "check", hue: "green", pulse: "r", asOf: "09:00", fact: { zh: "12 项 · 2 项逾期", en: "12 items · 2 overdue" } },
    inbox: { zh: "Inbox", en: "Inbox", icon: "inbox", hue: "mint", pulse: "g", asOf: "08:58", fact: { zh: "本周 14 条 · 1 条要你回", en: "14 this week · 1 needs your reply" } },
    coding: { zh: "Coding", en: "Coding", icon: "code", hue: "cyan", pulse: "y", asOf: "09:00", fact: { zh: "2 个会话 · 测试连续两天失败", en: "2 sessions · tests failing two days" } },
    risks: { zh: "风险", en: "Risks", icon: "risk", hue: "orange", pulse: "y", asOf: "09:00", fact: { zh: "5 条未关闭 · 1 条新登记", en: "5 open · 1 new" } },
    calendar: { zh: "日程", en: "Calendar", icon: "calendar", hue: "yellow", pulse: "na", asOf: "09:00", fact: { zh: "今天没有会议", en: "No meetings today" } },
  },
  objects: {
    g1: { src: "goals", zh: "数据同步迁到 v3 接口", en: "Move data sync to the v3 API" },
    t1: { src: "todo", zh: "请供应商书面确认停用日期", en: "Get the vendor to confirm the date in writing" },
    t2: { src: "todo", zh: "扩充压测数据到生产量的 30%", en: "Grow load-test data to 30% of production" },
    i1: { src: "inbox", zh: "合规组：请提供迁移材料清单", en: "Compliance: please send the migration checklist" },
    s1: { src: "coding", zh: "迁移 sync 客户端", en: "Migrate the sync client" },
    r1: { src: "risks", zh: "供应商 v2 接口 12 月停用", en: "Vendor retires the v2 API in December" },
    r4: { src: "risks", zh: "合规审查排期没定", en: "Compliance review not scheduled" },
  },
  // Written by the assistant; every claim carries the sources it was read from.
  claims: [
    { id: "c1", refs: ["g1", "s1"], text: { zh: "数据同步迁移完成约 60%，照现在的速度 11-20 前能切完。", en: "The data sync move is about 60% done; at this pace it switches over before 11-20." }, old: { zh: "数据同步迁移完成约 40%。", en: "The data sync move is about 40% done." } },
    { id: "c2", refs: ["t1", "t2"], text: { zh: "两项待办逾期：「请供应商书面确认」逾期 2 天，「扩充压测数据」逾期 1 天。", en: "Two to-dos are overdue: “vendor confirmation” by 2 days, “grow load-test data” by 1 day." }, old: { zh: "一项待办逾期：「请供应商书面确认」逾期 1 天。", en: "One to-do is overdue: “vendor confirmation” by 1 day." } },
    { id: "c3", refs: ["r1", "r4"], text: { zh: "供应商仍未确认延期；合规排期没定是本周新登记的风险。", en: "The vendor still hasn't confirmed an extension; the unscheduled compliance review is a risk recorded this week." }, old: { zh: "供应商仍未确认延期。", en: "The vendor still hasn't confirmed an extension." } },
    { id: "c4", refs: ["i1"], text: { zh: "Inbox 本周 14 条新消息，其中合规组的一条要你回复。", en: "14 new Inbox messages this week; one from compliance needs your reply." }, old: { zh: "Inbox 本周 9 条新消息，其中有供应商的停用公告。", en: "9 new Inbox messages this week, including the vendor's retirement notice." } },
  ],
  attention: [
    { obj: "i1", kind: "reply", text: { zh: "合规组在等迁移材料清单，周三提的", en: "Compliance has been waiting for the checklist since Wednesday" } },
    { obj: "r1", kind: "decide", text: { zh: "要不要把切换截止提前到 12-20", en: "Move the switch deadline up to 12-20?" } },
  ],
  changes: [
    { kind: "add", text: { zh: "新登记风险「合规审查排期没定」", en: "New risk “compliance review not scheduled”" }, obj: "r4" },
    { kind: "done", text: { zh: "Goal 要求「切换期间同步不中断」已达成", en: "Goal requirement “sync never stops” met" }, obj: "g1" },
    { kind: "worse", text: { zh: "逾期待办 1 → 2", en: "Overdue to-dos 1 → 2" }, obj: "t2" },
  ],
  next: [
    { id: "n1", obj: "i1", act: "owner", text: { zh: "回复合规组，附上迁移材料清单", en: "Reply to compliance with the migration checklist" }, why: { zh: "他们排期要先看到清单", en: "They need the list before they can schedule" }, btn: { zh: "在 Inbox 回复", en: "Reply in Inbox" } },
    { id: "n2", obj: "t2", act: "owner", text: { zh: "把「扩充压测数据」改给周远，截止 11-08", en: "Reassign “grow load-test data” to Zhou Yuan, due 11-08" }, why: { zh: "林夏这周都在切换上", en: "Lin Xia is on the switch all week" }, btn: { zh: "改派待办", en: "Reassign" } },
    { id: "n3", obj: "r1", act: "assistant", text: { zh: "起草给供应商的延期确认邮件", en: "Draft the extension request to the vendor" }, why: { zh: "停用日期还没书面确认", en: "The retirement date isn't confirmed in writing" }, btn: { zh: "交给助理起草", en: "Have the assistant draft it" } },
  ],
  versions: [
    { v: 3, when: "11-04 09:00", tag: "current", delta: { zh: "+1 风险 · 1 项要求达成 · 逾期 1→2", en: "+1 risk · 1 requirement met · overdue 1→2" } },
    { v: 2, when: "11-01 09:00", tag: "shared", delta: { zh: "进度 40% · 1 项逾期", en: "40% done · 1 overdue" } },
    { v: 1, when: "10-28 09:00", tag: "", delta: { zh: "第一份", en: "First one" } },
  ],
  // Human edit on c1 vs the regenerated proposal.
  edit: { mine: { zh: "数据同步迁移完成约 60%，11-20 前能切完（林夏周一确认过）。", en: "The data sync move is about 60% done and switches before 11-20 (Lin Xia confirmed Monday)." }, theirs: { zh: "数据同步迁移完成约 70%，照现在的速度 11-18 前能切完。", en: "The data sync move is about 70% done; at this pace it switches before 11-18." } },
  basicPlugins: ["goals", "todo", "inbox", "coding", "risks"],
};
