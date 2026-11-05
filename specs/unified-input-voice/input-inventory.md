# 输入框盘点（第 10 批前置核账）

状态：盘点记录（2026-11-03），基于 main `735e99425`。只记现状，不改[统一输入体验](spec.md)的验收；第 10 批定样与实现拿它对照。结论与待拍板的点在[第 10 批本批核账](../post-anticorruption-roadmap/reference/batches/10.md#batch-10-audit)。

方法：只读源码，行号为盘点当天。查不到的写「未发现」，没核实的写在第 6 节。表里的 `file:line` 都是主人文件。

## 1. 范围口径

- 纳入：用户向 AI 或同伴「发话」的输入框——对话型（助理、Coding、IM、灵光、创作台）、捕获型（Issues、Pages 评论）、决定理由型（评审反馈、Jelly 指令）。
- 不纳入首期（需求 §2 已写）：搜索框、名称字段、普通表单、文档正文编辑器。第 5 节仍给它们分类，说明哪些其实是「对 AI 说话」。
- 首页底栏和助理是**同一个元素**（`apps/workbench/src/assistant-dock.ts`），需求按三个入口数（首页、助手、Coding）。首页侧面的灵光是灵光插件自己的侧视图，不是助理底栏。
- 底栏输入框在 main 上仍是单行 `<input>`，粘贴多行中文会丢换行；[#1761](https://github.com/molis-ai/molis-work/pull/1761)（BL-953）改成 `<textarea>`，合入后下表「助理」一行按 textarea 看。底栏高度是固定的，随内容长高留给第 10 批。

## 2. 总表：对话、捕获、决定理由型输入

列含义：**发送键**＝实际按什么发；**送达**＝运行中再发一条的处理（补充／排队／打断）；**草稿**＝存在哪里、按什么分；**共用**＝用了哪些共用件。

| 输入框 | 元素与主人文件 | 文字与草稿 | 附件 | 发送键与输入法 | 送达（运行中再发） | 目标显示 | 扩展 | 语音 | 共用 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 助理（首页底栏） | `assistant-dock.ts:87`；脚本 `scripts/client/assistant-island.ts`、`assistant-composer.ts`、`assistant-send.ts` | 底栏固定高度；草稿存宿主、按「工作」分（`/works/:id/draft`），刷新恢复 | 有：`data-assistant-attach` 菜单（`assistant-attachments.ts`） | **Enter 发**，Shift+Enter 换行；防 isComposing 与 229（`assistant-island.ts:634`） | 运行中发送即「补充」，带回执（`createInputReceipts`）；输入框旁**没有**送达方式菜单；停止在别处 | 「下一次发送给哪项工作」文字与 × | `/` 命令菜单、`@` 提及（`assistant-mention.ts`）；仅内部，无公开注册点 | 无 | 回执、`data-fit` 回退脚本、`molisDropZone` |
| Coding 主任务框 | `plugins/native/coding/src/ui.ts`（`form[data-coding-composer]`）；`browser/main/mount-submit.ts`、`draft.ts`、`slash-menu.ts`、`input-receipts.ts` | 长高；草稿存服务端、按会话分（`routes-sessions.ts` 的 `draft:<session_id>`），sessionStorage 只是本窗口的缓冲（`browser/draft.ts:18-54`）；2026-11-04 更正，原写「关标签页即丢」不对 | 有：「补充上下文」菜单 | **Cmd/Ctrl+Enter 发**，Enter 换行；防 isComposing（`mount-submit.ts:29`），斜杠菜单另防 229（`slash-menu.ts:213`） | **有**送达方式下拉：补充（这步做完后读）／打断（丢弃当前回复）／下一轮再做（`messages.ts:103-105`，`ui.ts:341`），带回执 | 会话、模型、方式选择 | `/` 命令菜单；仅内部 | 无 | 回执、`data-fit` |
| Coding 委托子任务 | `coding/src/ui.ts:217` `data-coding-delegate-task`，对话框内 | 固定 5 行，用主任务框内容预填；无草稿 | 无 | 按钮；无键位 | 不适用（一次性） | 对话框说明 | 无 | 无 | 无 |
| IM 群聊／话题回复 | `packages/im-ui/src/page.ts:5-12`；`browser/controller-page.ts`、`controller-navigate.ts`、`drafts.ts` | 长高但被自己的 CSS 压到 130px／75px；草稿 localStorage、按成员＋房间／话题分，刷新恢复，发送成功才清 | 无 | **Enter 发**，Shift+Enter 换行；防 isComposing 与 229（`controller-page.ts:41-46`）；Esc 在输入框内关掉整个讨论面板（`:52-60`） | 无（对象是同伴，不是 AI） | 文字标签「发到 主群」「回复 话题名」 | `@` 按钮弹成员列表；引用回复；私有 | 无 | `data-fit` |
| 灵光聊天（含首页侧面） | `plugins/native/lingguang/src/ui.ts:115-123`；`browser/chat.ts` | 长高；**无草稿**，进入头脑风暴时清空（`chat.ts:66`） | 无 | **Cmd/Ctrl+Enter 发**，Enter 换行；**无**输入法检查（`chat.ts:124-129`） | 无；运行中再发被静默丢弃；有「停止」 | 上方带入卡片，输入框附近没有「发给谁」 | 无 | 无 | `data-fit`、`mw-textarea` |
| 灵光「交给助理」 | `lingguang/src/ui.ts:103`；`chat.ts:21-48` | 单行 `input`；无草稿 | 无 | Enter 提交表单；Esc 收起 | 派发 `molis:assistant-message` 给助理，之后走助理的语义 | 助理 | 无 | 无 | 事件 |
| 插件创作台 | `plugins/native/plugin-builder/src/agent-studio.ts:23,480-484` | 长高；**无草稿** | 无 | **Enter 发**，Shift+Enter 换行；只查 isComposing，无 229 | 运行中发送＝服务端**先暂停这一轮再按新话重来**（`agent-workflow.ts:709-711`），即默认打断并改向；无补充、无排队 | 草稿插件下拉、「指向 组件」条、修改范围、模型 | 示例芯片；私有 | 无 | `data-fit` |
| Issues 新建／编辑描述 | `plugins/native/issues/src/ui.ts:34,63-65`；`browser/client.ts`、`capture.ts`、`images.ts` | 长高；草稿 localStorage 单键 `molis:issue-draft`，图片草稿走页面草稿服务 | **有最全的一套**：选择、拖入、粘贴、png／jpeg／webp、失败重试 | **Cmd/Ctrl+Enter 发**（按钮标 ⌘↵），Enter 换行；防 isComposing，无 229 | 无（捕获型）；发送立即清框，失败变成列表行 | 无；记录当前项目与来源页 | 无 | 无 | `data-fit`、`molisDropZone`、页面草稿服务 |
| Pages 评论 | `plugins/native/pages/src/comment-side-view.ts:12`；`comment-side-client.ts` | 固定 3 行，不长高；草稿 localStorage、按项目＋文档＋评论串分（分得最细） | 无 | **Cmd/Ctrl+Enter 发**；防 isComposing，无 229 | 无；可勾「带给助理」，评论保存后派发助理事件 | 文档、评论串、回复对象、锚点摘录 | 无 | 无 | 无 |
| Shelf 终端对话行 | `plugins/native/shelf/src/ui.ts:115`；`browser/tui.ts` | **单行 `input`**；无草稿，发不出去时退回文字 | 只收拖入（Shelf 行或外部文件，路径拼进一行） | **Enter 发**；防 isComposing，无 229 | 无；直接写进终端，运行语义归终端里的 Agent | 「发给 {Agent 名}」 | 无 | 无 | `molisDropZone` |
| Agent 评审反馈 | `apps/workbench/src/agent-review-surface.ts:239,269` | 36px→84px（CSS，可拖拽）；草稿 sessionStorage、按评审项分 | 无 | 无键位；随「拒绝」按钮提交 | 无（是对一次提案的决定理由） | 评审项本身 | 无 | 无 | `mw-textarea` |
| Jelly 计划指令／反馈 | `plugins/native/jelly/src/browser/note-actions.ts:80`、`plan.ts:89` | 固定 2～3 行；无草稿（内存里存计划编辑状态） | 无 | 无键位；按钮「生成」「重新生成」 | 无 | 来源笔记或选区 | 无 | 无 | `mw-textarea` |

全仓没有任何语音入口（`SpeechRecognition`、`getUserMedia` 一类无命中），所以 UIV-05～10 在所有入口都是从零做起。

## 3. 已共用与各写一份

**已共用**
- 长高：`data-fit` 加 `FIELD_FIT_STYLES`（`field-sizing: content`）与回退脚本 `browser/field-fit.ts`（`window.molisFit`）。助理底栏、Coding、IM、灵光、创作台、Issues、Goals 创建、工作流交接、PPT 在用；Pages 评论、Shelf、评审反馈、Jelly 和第 5 节的 A 类字段没有用。
- 拖入反馈：`molisDropZone`（Issues、Shelf 终端行、助理）。
- 输入回执：`createInputReceipts`——**只有助理和 Coding 在用**，其余输入框一个都没接。
- 控件皮肤：`mw-textarea`、`mw-btn`、`mw-toast`。SDK 的 `renderTextarea`（`packages/plugin-sdk/src/ui/field.ts:38`）没有任何插件在用。
- 旁路递给助理：灵光「交给助理」和 Pages「带给助理」都发 `molis:assistant-message`，最终语义由助理输入框决定。

**各写一份**
- 发送键：Enter 发＝助理、IM、创作台、Shelf 终端行；Cmd/Ctrl+Enter 发＝Coding、灵光、Issues、Pages 评论、工作流交接；无键位＝评审反馈、Jelly。
- 输入法防护：IM 最全（isComposing＋229）；助理、Coding 斜杠菜单也全；创作台、Issues、Pages、Shelf、Coding 发送键只查 isComposing；灵光、工作流交接、通用动作表单的 Cmd/Ctrl+Enter 完全不查。Todo 快速添加有自己的一份。
- 草稿：助理（宿主、按工作）、Coding（服务端、按会话，窗口里另有 sessionStorage 缓冲）、IM（localStorage、按成员＋目标）、Pages（localStorage、按项目＋文档＋评论串）、Issues（localStorage 单键）、评审（sessionStorage）、图片（sessionStorage、按项目）；灵光、创作台、Shelf、Jelly 无。键规则互不相同，没有一份是需求要的「入口＋会话」统一命名，也没有公共草稿库。
- 防连点与失败文案：IM 最完整（含「未能确认发送结果」）；Pages 和 Issues 有幂等重试；灵光、创作台只有错误提示，空内容与忙时静默返回。
- 扩展点（`@`、`/`、资料、模型和方式）：全部私有，没有任何一个走公开合同或 SDK。

## 4. 与需求对不上

对照[统一输入体验](spec.md) §3 UI、§4 键位、§5 草稿、UIV-01～17，和[视觉体验](../visual-ui-experience/spec.md) VUX-16～18。

| 需求 | 现状 |
| --- | --- |
| §4 / UIV-01：Enter 换行，Cmd/Ctrl+Enter 发送 | **Enter 直接发送**的有助理、IM、创作台、Shelf 终端行；Cmd/Ctrl+Enter 的有 Coding、灵光、Issues、Pages。同一产品里两种习惯并存 |
| §4：Esc 只退局部菜单 | IM 输入框内按 Esc 关掉整个讨论面板（`controller-page.ts:52-60`） |
| UIV-02：输入法选词不误发 | 灵光、工作流交接、通用动作表单（`plugin-component-part.ts:113`）的 Cmd/Ctrl+Enter 不查 isComposing；创作台、Issues、Pages、Shelf、Coding 发送键缺 229 |
| UIV-03：失败保留、结果不确定有提示、空内容与忙时有反馈 | IM 完整满足；灵光、创作台空内容与忙时静默返回，无「不确定」状态；灵光运行中再发被静默丢弃 |
| UIV-04：草稿按入口＋会话分，刷新与重启后恢复，不串写 | 没有统一实现；只存 sessionStorage 的（评审、图片）关标签页即丢（Coding 草稿存服务端，不丢）；灵光、创作台、Shelf、Jelly 无草稿，灵光进入时主动清空 |
| UIV-05～10：语音 | 全部缺 |
| UIV-13～15：插件通过公共合同注册扩展 | 全部缺；现有扩展都是各插件私有 DOM |
| UIV-17 / ai-input-receipts §4.1：补充（默认）／打断并改向／这一轮结束后再做 | 只有 Coding 有三种送达方式菜单；助理只有隐含的补充；创作台发送即打断，默认语义与需求相反；其余入口没有 |
| VUX-16：长高、上限内滚、位置稳定 | Pages 评论、Shelf、评审、Jelly 不长高；IM 上限 130px 小于共用的 240px；助理底栏固定高度（#1761 先限在两行内滚动，真正随内容长高归第 10 批） |
| VUX-17：`@`、`/`、引用 | 助理有 `@`、`/`；Coding 有 `/`；IM 只有按钮弹窗；其余无 |
| VUX-18：附件、拖入 | Issues 最全；助理、Coding 有菜单；Shelf 终端行只收拖入；其余无 |

## 5. 表单型文字字段分类

按「是否像对 AI 一次性说话」分，供第 10 批决定哪些接公共组件。完整逐字段清单（56 行，含主人文件行号）是盘点时的工作记录，没有入库；需要时按下表分组重新定位。

- **A 应接公共组件（7）**：图片生成提示词（`plugins/native/images/src/ui.ts:66`）；记忆向模型提问（`cognia/src/browser/dialog.ts:99`）；炼金术士侧栏「继续讨论」（`alchemist/src/client-flows.ts:37`，本质是聊天）；Character 运行任务（`apps/workbench/src/characters/import-ui.ts:14`）；Coding 委托子任务；Dataset 与 Form 的 AI 提示（`dataset/src/ui.ts:114`、`form/src/ui.ts:127`）。后两个现在是**单行 `input`，Enter 无反应**，且 Form 的脚本把它声明成 `HTMLTextAreaElement`，与模板不一致。
- **A-边界（5，可二期）**：收件箱处理要求、炼金术士探索问题、Coding 步骤备注（返工时）、Jelly 计划指令、Goals 方案退回理由。后两项和评审反馈同类，一起定。
- **B 保留为表单（约 26）**：定时任务指令、Feed 规则、Character「做事方式」、判断规则的判断说明、Goals 事件与理由、规划方法、引导文档、Git 提交信息等——随表单整体保存的配置、规则或记录，不是「发送」。
- **C 内容编辑器（11）**：PPT、Todo 备注、Jelly 笔记块、Dataset CSV、记忆手写条目、引导里的网页正文与摘要等。
- 不是输入：Files 只读预览、侧栏浏览器输入桥、各类名称与网址字段。

A 类共同缺口：没有一个用 `data-fit`；没有 Cmd/Ctrl+Enter 与输入法守卫；草稿各自 sessionStorage；无语音；一次性提交型入口没有「运行中」状态，UIV-17 基本不适用。

## 6. 没能查清的项

- IM 服务端幂等去重的实现（`apps/local-host/src/im-server.ts` 没读）。
- 灵光服务端是否拒绝空消息。
- Issues 的 localStorage 在不同项目之间是否隔离（取决于插件 iframe 的 origin）。
- Jelly「重新生成」重绘后反馈框内容是否保留。
- 各输入框的 Tab、Shift+Tab 和可访问名称（只核对了 Esc 的显式代码）。
- 创作台暂停按钮的位置与键位。
- 改键位会牵动哪些 e2e：没有逐个查测试里按 Enter 的断言。
- Dataset 与 Form 的 AI 提示发送后是先清空还是成功后才清；炼金术士「继续讨论」在侧栏模式下有没有另外的 Enter 处理。
