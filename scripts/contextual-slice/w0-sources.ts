/** Sample content for the right panel's places other than Shelf. All of it is labelled 模拟 on screen; nothing is read from a Home. */
import type { HandKind } from "./w0-model.js";

export interface SideItem { id: string; kind: HandKind; title: string; text: string; meta: string }
export type SideTab = "shelf" | "sparks" | "files" | "browser" | "computer" | "discussion";

export const TABS: readonly { id: SideTab; label: string; source: string }[] = [
  { id: "shelf", label: "Shelf", source: "Shelf" }, { id: "sparks", label: "灵光", source: "灵光" },
  { id: "files", label: "文件", source: "文件" }, { id: "browser", label: "浏览器", source: "网页" },
  { id: "computer", label: "电脑", source: "电脑" }, { id: "discussion", label: "讨论", source: "讨论" },
];

export const SPARKS: readonly SideItem[] = [
  { id: "spark:sample-data", kind: "spark", title: "导入时直接给一份样例数据", meta: "灵光 · 昨天",
    text: "导入失败的人，如果第一步就有一份能跑通的样例数据，也许就不会停在那里。可以先只做 CSV。" },
  { id: "spark:team-trial", kind: "spark", title: "小团队试用单独算", meta: "灵光 · 9 月 27 日",
    text: "小团队负责人更在意能不能拉同事一起试，也许该有一个按团队计的试用，而不是按天数。" },
];

export const FILES: readonly SideItem[] = [
  { id: "file:funnel", kind: "file", title: "试用漏斗 · 9 月.csv", meta: "工作区文件 · 18 KB",
    text: "第 1 天活跃 100%，第 3 天 54%，第 7 天 38%；创建过项目的用户第 7 天仍活跃 71%，没创建过的 21%。" },
  { id: "file:onboarding", kind: "file", title: "新手引导交互稿 v3.pdf", meta: "成果 · 固定版本 v3",
    text: "三步创建：选模板 → 导入或使用样例数据 → 邀请同事（可跳过）。评审意见：样例数据入口要比导入更显眼。" },
];

export const WEB_PAGE = {
  address: "example.com/blog/trial-length", title: "试用期该多长？我们看了 40 家 SaaS 的数据",
  paragraphs: [
    "试用期长短和付费转化率之间几乎没有相关性。真正拉开差距的，是用户在前 48 小时里有没有完成一件“有结果的事”。",
    "在我们看过的 40 家公司里，把“第一个结果”压缩到 10 分钟以内的那一组，试用转化率的中位数是另一组的 1.8 倍。",
    "延长试用期常见的副作用，是把付费决定往后推，而不是让更多人付费。",
  ],
};

export const MESSAGES: readonly SideItem[] = [
  { id: "message:1", kind: "message", title: "小周", meta: "讨论 · 10:12",
    text: "导入示例那块，设计组说下周二之前能出第二版，我们周三提测还来得及。" },
  { id: "message:2", kind: "message", title: "Lee", meta: "讨论 · 10:20",
    text: "A/B 先只开 20% 流量没问题，但要提前跟财务说一声，Q4 收入确认可能会往后挪。" },
  { id: "message:3", kind: "message", title: "小周", meta: "讨论 · 10:31",
    text: "我周五前把三步创建的埋点方案发出来，大家帮忙看下漏了什么。" },
];
