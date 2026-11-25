import type { AutomationReport } from "@molis-ai/molis-work-contracts/services/automation-recommender";

const words = {
  zh: {
    title: "项目自动化建议", empty: "当前没有可用建议。", partial: "部分目录或能力未能检查。",
    gap: { "no-workspace": "没有可读的项目参考目录", budget: "部分目录或配置超出扫描上限", unreadable: "无法读取",
      "directory-unavailable": "目录暂不可用或没有可操作的入口", "preferences-unavailable": "无法读取已保存的偏好" },
    category: { hooks: "Hooks", skills: "技能", connections: "连接", roles: "角色", commands: "命令" },
    confidence: { high: "信心高", medium: "信心中等" },
    next: { skill: "在能力包中核对并启用技能", connection: "在连接设置中核对接入条件", role: "在能力包中核对角色" },
    requirements: "前置条件", risk: "风险", evidence: "证据",
  },
  en: {
    title: "Project automation suggestions", empty: "No suggestions are available.", partial: "Some sources could not be checked.",
    gap: { "no-workspace": "No readable project input folder", budget: "Some folders or configuration exceeded the scan limit", unreadable: "Could not read",
      "directory-unavailable": "The catalog is unavailable or has no setup entry", "preferences-unavailable": "Saved preferences could not be read" },
    category: { hooks: "Hooks", skills: "Skills", connections: "Connections", roles: "Roles", commands: "Commands" },
    confidence: { high: "High confidence", medium: "Medium confidence" },
    next: { skill: "Review and enable the skill in Capabilities", connection: "Review the setup in Connections", role: "Review the role in Capabilities" },
    requirements: "Requirements", risk: "Risk", evidence: "Evidence",
  },
  ja: {
    title: "プロジェクトの自動化提案", empty: "現在利用できる提案はありません。", partial: "一部のソースまたは機能を確認できませんでした。",
    gap: { "no-workspace": "読み取り可能なプロジェクト入力フォルダーがありません", budget: "一部のフォルダーまたは設定がスキャン上限を超えました", unreadable: "読み取れませんでした",
      "directory-unavailable": "カタログが利用できないか、設定可能な項目がありません", "preferences-unavailable": "保存済みの設定を読み取れませんでした" },
    category: { hooks: "Hooks", skills: "スキル", connections: "接続", roles: "ロール", commands: "コマンド" },
    confidence: { high: "信頼度：高", medium: "信頼度：中" },
    next: { skill: "機能パックでスキルを確認して有効にする", connection: "接続設定で連携条件を確認する", role: "機能パックでロールを確認する" },
    requirements: "前提条件", risk: "リスク", evidence: "根拠",
  },
} as const;

const plain = (value: string) => value.replace(/[\r\n]/g, " ").replace(/[\\*_<>\x60\[\]#!]/g, "\\$&");

function wordsFor(locale?: string) {
  const base = locale?.trim().toLowerCase().split("-")[0];
  if (!base || base === "zh") return words.zh;
  if (base === "ja") return words.ja;
  return words.en;
}

export function reportDocument(groups: AutomationReport["groups"], gaps: AutomationReport["gaps"], locale?: string) {
  const copy = wordsFor(locale);
  const sections = groups.filter(group => group.suggestions.length).map(group => [
    "## " + copy.category[group.category],
    ...group.suggestions.map(row => [
      "### " + plain(row.title), copy.confidence[row.confidence], plain(row.reason), plain(row.effect),
      "**" + copy.requirements + "**\n" + row.requirements.map(item => "- " + plain(item)).join("\n"),
      "**" + copy.risk + "**  " + plain(row.risk),
      "**" + copy.evidence + "**\n" + row.evidence.map(item => "- " + plain(item.workspace + " / " + item.path)).join("\n"),
      copy.next[row.next.kind],
    ].join("\n\n")),
  ].join("\n\n"));
  if (!sections.length) sections.push(copy.empty);
  if (gaps.length) sections.push(copy.partial + "\n\n" + gaps.map(gap => "- " + [
    copy.gap[gap.code], gap.category ? copy.category[gap.category] : "", gap.workspace ?? "", gap.path ?? "",
  ].filter(Boolean).map(plain).join(" · ")).join("\n"));
  return { title: copy.title, markdown: sections.join("\n\n") };
}
