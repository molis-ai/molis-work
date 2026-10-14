/** Labels prepared for later Jev evaluation. No evaluator, credentials or model calls in W0. */
export const LEFT_RIGHT_CASES = [
  { id: "quote-to-cursor", hand: "访谈原话", place: "side", landing: "Pages 光标", acceptableFirst: ["作为引用插入", "插入到光标处"], acceptableTopThree: ["作为引用插入", "插入到光标处", "新建文稿"], private: true },
  { id: "quote-to-selection", hand: "更准确的研究结论", place: "side", landing: "Pages 选区", acceptableFirst: ["替换选中的文字"], acceptableTopThree: ["替换选中的文字", "作为引用插入", "新建文稿"], private: true },
  { id: "no-target", hand: "下周要验证的事", place: "side", landing: null, acceptableFirst: ["记成待办"], acceptableTopThree: ["记成待办", "新建文稿"], private: true },
  { id: "assistant-material", hand: "一轮调研的结果", place: "assistant", landing: "Pages 光标", acceptableFirst: ["插入到光标处", "作为引用插入"], acceptableTopThree: ["插入到光标处", "作为引用插入", "新建文稿"], private: false },
  { id: "web-excerpt", hand: "网页里的一段数据", place: "side", landing: "Pages 光标", acceptableFirst: ["作为引用插入"], acceptableTopThree: ["作为引用插入", "插入到光标处", "收进 Shelf"], private: false },
] as const;

export const DESTINATION_CASES = [
  { id: "next-action", text: "下周三前验证三步创建流程，记录 5 位新用户的完成时间。", acceptable: ["Todo"], reason: "可执行事项与截止时间" },
  { id: "long-draft", text: "整理访谈背景、三条发现、证据和下一步，写成一篇可分享的说明。", acceptable: ["Pages"], reason: "需要留存的可编辑长文稿" },
  { id: "keep-excerpt", text: "先留着这段原话，稍后和另一份材料一起看。", acceptable: ["Shelf"], reason: "个人材料副本" },
  { id: "ambiguous", text: "把刚才说到的想法记下来。", acceptable: ["Shelf", "灵光"], reason: "缺少去处时不把唯一答案当事实" },
] as const;

export const EVALUATION_PLAN = {
  state: "labels-only", leftRight: { top1: 0.8, top3: 0.95, p95Ms: 2000, alsoReport: "1.5–2 秒和退回规则的比例" },
  destination: { threshold: null, next: "真实评估首轮之后再定门槛" },
  privacy: "仅本人可见的材料只提供形状与种类；内容不进入判断模型。",
} as const;
