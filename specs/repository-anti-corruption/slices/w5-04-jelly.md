# W5-03 / W5-04 Jelly 片：稳定翻译键与打包的、类型检查的客户端

状态：执行中（2026-10-23）。Jelly 的页面客户端与页面文字按 Todo 片（#1129）的做法改完，评审第一轮的两项（回顾页签自己的键、`en.ts` 逐词归位）已改，待 CI。

验收编号：RAC-140～141。

## 范围

`plugins/native/jelly/`：

- 客户端从六份模板字符串（`client.ts`、`client-calendar.ts`、`client-content.ts`、`client-plan.ts`、`client-model.ts`、`client-material.ts`，共约 680 行，拼成一个 `(host) => {…}`）改成 `src/browser/` 的 TypeScript（28 个模块：页面状态与共用操作、请求、对话框、日历与事项、笔记与块、任务计划、模型设置、按钮命令表与事件，函数都在 150 行以内），`tsconfig.browser.json` 类型检查，esbuild 打成 `dist/jelly-client.js`；`src/client.ts` 只读这份包。
- 请求：原先自己拼 `fetch` 与 `molisWorkControlHeaders()`，现在经共同的 `molisWorkRequest`（`src/browser/request.ts`）；拆成任务的流式请求用它的 `stream`，进度与取消照旧。失败仍是带 `code` 和 `status` 的 Error，`GET` 被拒时仍先问 `host.readRefusal`。
- 页面文字：`ui.ts` 与 `src/browser/` 里的 247 句中文都改成稳定键 `jelly.<区域>.<名称>`，中英文放在 `src/messages.ts`（`JELLY_MESSAGES`，249 个键，含原有的 `jelly.category.uncategorized`），`registration.messages` 早已登记。英文逐字照搬原 `JELLY_EN`；其中 9 个词，工作台合并后的英文曾被别的主人的同名条目盖掉，现在显示 Jelly 自己的词（正文 Text、完成 Done、重试 Try again、确认导入 Import、恢复 Restore、完成要求 Completion criteria、未完成 Open、返回列表 Back to list、备注 Notes），同名冲突因此从 190 处降到 184 处。「已完成」一词在 Jelly 页面里两种用法：回顾页签的名字有自己的键 `jelly.review.completed`（Completed，与改前一致），其余三处是状态词，用 `jelly.status.completed`（completed，Jelly 自己的词，改前被别的主人的 Completed 盖掉）。
- `src/en.ts`：原先留 26 个词，逐个按谁在查来分：只有别的主人按中文原文查的 19 个词搬回那个主人的词典（工作台 `gap-en.ts`：月、一～日、补充要求、应用、开始日期、结束日期、开始时间、结束时间、操作失败，请重试；`placement-en.ts`：移除关联、移动；`studio-en.ts`：修改范围；Pages 的 `en.ts`：导出 Markdown），英文与合并后的一样，所以别处显示不变；工作台已有同样英文的 `分类` 直接删；没人查的 3 个词删掉（本周、服务地址、结束日期不能早于开始日期，页面都走键，服务端没有把后一句翻译出去的路径）；Jelly 自己的服务端文字还按中文原文查的 3 个词留下：搜索结果种类名 `笔记`、`日程` 和动作标题 `新建笔记`，登记在 BL-456（做完的条件：合同能带稳定键并由宿主消费）。合并后整个目录逐词对照改前：`没有匹配的内容` 的英文由 No matching content 变成 No matching items（全局搜索、Workflows），`页` 由 Page 变成 slides（PPT）——这两句原先被 Jelly 的同名条目盖掉，现在显示各自主人的词；其余只有 Jelly 页面自己不再查的词从目录里消失。
- 不动 `manifest.ts`（#1098）和 `*actions.ts`（#1117）。

## 不变的行为

- 拆成任务时给模型的指令（`plan.ts` 里「只重新拆解下面这一个候选……」「请重新审视原文并生成任务……」）是发给模型的提示，不是页面文字，仍是中文原文。
- 页面状态（当前视图、笔记草稿、计划里每个候选的编辑）仍只在页面里；工作区归 Jelly 的命令。草稿恢复仍用 `localStorage`（写入失败时静默，不影响保存）。
- 跨对象事件沿用已登记的名字：`molis:assistant-effect`、`molis-work:select-item`、`molis-work:item-unreadable`、`molis-work:model-ready`，没有新事件。

## 属性名压缩的试验（给 Todo、Issues 之后的片）

统筹提议用 `esbuild --mangle-props=_$`，把页面私有的状态字段改名成 `xxx_`。在 Jelly 上先量了上限：不动源码，只让 esbuild 压缩 `JellyPage` 上 32 个独有的字段名（`calendarSeq`、`mutationQueue`、`savePending`、`editorRevision`、`draftBlocks`、`currentPlan`、`planUi` ……），`dist/jelly-client.js` 由 76,691 字节降到 74,055 字节，省 2,636 字节（3.4%）。省得到 1 KB 以上，值得做，但需要把这些字段在 `types.ts`、`page.ts` 和全部使用处改名（用语言服务按符号改，不用文本替换），并在 esbuild 命令加 `--mangle-props=_$`；约定是只有以 `_` 结尾的属性会被压缩，所以服务端数据字段不会受影响。本片不做：Jelly 已经比预算小 14,890 字节，且改名会碰几乎所有模块，应当和 Todo、Issues 在一个单独的小 PR 里一起做，避免动已经开着的 PR。

## 验收

- RAC-140：`ui.ts` 与 `src/browser/` 用到的每个 `jelly.*` 键都有中英文且占位符一致，登记的键没有多余；这些文件里没有直接写作键的中文字符串；服务端画出的页面（日期选择器是设计系统自己的组件，不算）没有直接写入的中文（`tests/jelly-client-bundle.test.ts`）。
- RAC-141：浏览器代码不直接 `fetch`、无 `any`、`as unknown as`、空 `catch`、浏览器弹窗，构建跑浏览器类型检查，包是 `(host) => {…}` 函数表达式，带 `data-assistant-context`、`molis:assistant-effect`、`molis-work:select-item`、`molis-work:item-unreadable`、`molis-work:model-ready`，请求经 `molisWorkRequest`（`tests/jelly-client-bundle.test.ts`）。
- 页面资源：`/assets/molis-work-plugins/jelly.js` 由 91,650 降到 76,760 字节（`tooling/gates/page-assets.json`，本片只变小）。
- 行为不变：README「改动后必跑」与页面端到端用例（`tests/jelly-actions.e2e.test.ts`、`tests/jelly-outside-changes.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`）通过。
