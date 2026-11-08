import type { MwComposerAiLabels, MwComposerLabels } from "@molis-ai/molis-work-plugin-sdk/ui";

// One label set for the unified input's tests: the first screen (`renderComposer`) and the client (`molisComposer`) take the
// same object (K0 contract desk item 1), so every test that draws or mounts a composer reads its words from here.

export const COMPOSER_PLAIN_LABELS: MwComposerLabels = {
  input: "评论", send: "发送", sendTitle: "发送（⌘↵）", add: "添加文件与资料", more: "更多",
  files: "文件与图片", filesHint: "从这台电脑选，或直接拖进输入框", dropRefused: "这里只收文件", commands: "命令",
  searching: "正在找…", nothing: "没有找到", unavailable: "{name} 现在用不了", reading: "{name} 读取中", remove: "移除 {name}", retryFile: "重试 {name}",
  blocked: "移除附不上的那一项再发", restored: "已恢复上次没发出的草稿 · {time}", clear: "清空草稿", unsaved: "草稿没能保存在本机；字还在，照常能发",
  enterHint: "回车已改为换行。要发送请按 {keys}", enterHintDismiss: "知道了", notice: "提示", sending: "发送中", sendingText: "正在发送…",
  failed: "没发出", retry: "重试", unknown: "待确认", unknownText: "没能确认是否送到；先别重复发", check: "查一下", notSent: "核对过：没有送到。字还在，可以再发",
};

export const COMPOSER_AI_LABELS: MwComposerAiLabels = {
  ...COMPOSER_PLAIN_LABELS, input: "发给 助理 的话",
  to: "发给：", stop: "停止", stopTitle: "停止这一轮", delivery: "选择送达方式", deliveryGroup: "送达方式",
  modes: {
    "next-boundary": { name: "补充", title: "补充（⌘↵）", description: "当前回复或这批工具结束后读到，不打断" },
    interrupt: { name: "打断并改向", title: "打断并改向", description: "丢掉正在写的回复，改按这句做；已做的不撤销" },
    "after-run": { name: "下一轮再做", title: "下一轮再做（⌘⇧↵）", description: "排到下一轮开头，你开下一轮时带上" },
  },
  unsupported: "这个对象不收这种送达方式", running: "运行中", runningText: "正在做这一轮 · 再发会作为补充",
  queued: "这一轮刚结束，留到下一轮", replayed: "这句已经发过，没有再发一次",
};
