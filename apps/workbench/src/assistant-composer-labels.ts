import type { MwComposerAiLabels } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * The resident Assistant's words for the unified input (unified-input-voice K3): one set for the Dock's first screen (Host, `L`)
 * and the island's `molisComposer` (browser, `host.translate`), so the two never say it differently. It is serialized into the
 * island's script with `.toString()`, so it uses nothing from outside itself. The Chinese is the board's and the Assistant's
 * own (one Chinese key, one English); the key glyphs are not words and follow the platform. `add` is the name of the ordinary send
 * while a turn runs, the stable key `workbench.composer.next-boundary` (补充 / Add) the Host reads: by its Chinese, 补充 is a receipt's
 * kind (Supplement), not this.
 */
export function assistantComposerLabels(L: (text: string) => string, mac: boolean, add: string): MwComposerAiLabels {
  const keys = (text: string) => mac ? text : text.replace("⌘⇧↵", "Ctrl+Shift+↵").replace("⌘↵", "Ctrl+↵");
  return {
    input: L("发给助理"), send: L("发送"), sendTitle: keys(L("发送（⌘↵）")), add: L("添加文件、引用或能力"), more: L("更多"),
    files: L("添加文件或图片…"), filesHint: L("也可以拖入、粘贴"), dropRefused: L("这里只收文件"), commands: L("用一个方法或能力，或这样开始"),
    searching: L("正在找…"), nothing: L("没有找到"), unavailable: L("{name} 现在用不了"), reading: L("{name} 读取中"), remove: L("移除 {name}"), retryFile: L("重试 {name}"),
    blocked: L("移除附不上的那一项再发"), restored: L("已恢复上次没发出的草稿 · {time}"), clear: L("清空草稿"), unsaved: L("草稿没能保存；字还在，照常能发"),
    enterHint: L("回车已改为换行。要发送请按 {keys}"), enterHintDismiss: L("知道了"), notice: L("提示"), sending: L("发送中"), sendingText: L("正在发送…"),
    failed: L("没发出"), retry: L("重试"), unknown: L("待确认"), unknownText: L("没能确认是否送到；先别重复发"), check: L("查一下"),
    notSent: L("核对过：没有送到。字还在，可以再发"),
    to: L("发给："), stop: L("停止"), stopTitle: L("停止这一轮"), delivery: L("选择送达方式"), deliveryGroup: L("送达方式"),
    modes: {
      "next-boundary": { name: add, title: keys(L("补充（⌘↵）")), description: L("当前回复或这批工具结束后读到，不打断") },
      interrupt: { name: L("打断并改向"), title: L("打断并改向"), description: L("丢掉正在写的回复，改按这句做；已做的不撤销") },
      "after-run": { name: L("下一轮再做"), title: keys(L("下一轮再做（⌘⇧↵）")), description: L("排到下一轮开头，你开下一轮时带上") },
    },
    unsupported: L("这项工作不收这种送达方式"), running: L("运行中"), runningText: L("正在做这一轮 · 再发会作为补充"),
    // Queued is both a send after the turn ended and one put off on purpose (⌘⇧↵): the words say what is true of both.
    queued: L("已保存，下一轮开始生效"), replayed: L("这句已经发过，没有再发一次"),
  };
}
