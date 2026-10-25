# W5-03 Workflows 片：页面客户端改成类型检查的 TypeScript，页面文字改成稳定键

状态：执行中（2026-10-24）。Workflows 的页面客户端原来是三个模板字符串（`client.ts`、`save-client.ts`、`gap-picker-client.ts`，合起来 1,400 行脚本，没有类型检查），改成 `src/browser/` 下的 TypeScript：`tsconfig.browser.json` 做类型检查，构建时 esbuild 打成 `dist/workflows-client.js`；页面文字同时全部改成稳定键，页面里按表查词的动态翻译清零。本地构建和定向验证通过（含 Workflows 的全部浏览器用例），待评审与统筹集成全量。从 main 起，不叠在别的片上（做法与 Dataset 片 `w5-03-dataset.md`、PPT 片 `w5-03-ppt.md`、Form 片 `w5-03-form.md` 相同，只在共享的 `pnpm-lock.yaml`、`specs/BACKLOG.md`、`tooling/gates/page-assets.json` 上有相邻行的重叠，见「合并提示」）。

验收编号：RAC-156～157。

## 范围

`plugins/native/workflows/`：

- 客户端：`src/client.ts` 里的脚本、`src/save-client.ts`、`src/gap-picker-client.ts` 删除，换成 `src/browser/` 的 23 个文件（约 2,000 行）。页面状态在一个 `WorkflowsPage` 对象里（`page.ts`），各部分是拿它当第一个参数的函数：`nav.ts`（列表、流程、运行之间的切换与记住位置）、`list.ts` 与 `flow.ts`（画列表与链）、`save.ts`（保存队列、未保存的改动、撤销、增删与移动站点）、`popover.ts`、`link.ts`、`step.ts`（浮层里的交接设置与动作步骤）、`run.ts` 与 `handoff.ts`（运行视图与交接）、`dialog.ts`、`click.ts`、`pop-events.ts`、`root-events.ts`、`drag.ts`（事件）、`toast.ts`、`state.ts`、`chain.ts`、`dom.ts`、`request.ts`、`types.ts`、`client.ts`、`factory.ts`。`src/client.ts` 只剩读打好的包的 `WORKFLOWS_CLIENT_FACTORY_SCRIPT`。`package.json` 的 `build` 先 `tsc` 两个配置再 esbuild，`typecheck` 同；esbuild 作为本包的开发依赖，与根同版本（`pnpm-lock.yaml` 同步）。
- 请求：只经工作台的 `molisWorkRequest`（`request.ts`，路径在 `/workflows` 之后，路由由 `host.pluginRoute` 按 Manifest 身份与当前项目给出）；不再有 `fetch(`、不写插件 id 和 `/api/plugins/` 前缀。助理上下文里的 `plugin_id` 取 `host.pluginId`。
- 页面文字：`ui.ts` 里 6 处和客户端脚本里的整句中文，共 259 处，改成 218 个稳定键 `workflows.<区域>.<名称>`（`src/messages.ts`，中英文并排，登记在 `registration.ts` 的 `messages`，从 `index.ts` 导出 `WORKFLOWS_MESSAGES`）。
- 动态翻译：`L(KINDS[kind])`、`tx(KIND_HELP[kind])`、字段名表这类按表查词的翻译，改成 `dom.ts` 里逐条写出的 `kindName()`、`kindHelp()` 与 `step.ts` 里的字段名选择。剩下的只有一类——别的主人写的字（插件的名字、站点不可用的原因、动作返回的摘要、停下的原因），以及留在判断规则与动作步骤的原因里的我们自己的键：它们经 `dom.ts` 的 `said()` 一处交给宿主的词典翻译，`tests/workflows-client-bundle.test.ts` 钉住「只有这一处」。
- `src/en.ts` 从 228 条减到 45 条（BL-463）：保留服务端标签与错误、别的主人在查或提到的词；删掉的 183 条里，178 条是页面自己的词（现在是键），5 条在整个仓库里没有任何调用（`可用：{标题} {正文} {来源} {链接} {日期}。标题规则留空时沿用上一步的标题。`、`{plugin} 里这一次的内容`、`暂不能串进流程`、`工作流程交接`、`「{action}」返回的结果`）。
- `tests/workflows-client-bundle.test.ts`：两条验收（同 Dataset、PPT、Form）。

不动：`manifest.ts`、`actions.ts`、`plugin.ts`、`store.ts`、`model.ts`、`styles.ts`、服务端页面的结构（`ui.ts` 只换翻译调用的参数）、`content-client.ts`（别的插件的站点适配）；也不改工作台与别的主人的文件、别片的规格。

## 英文显示的变化（逐条）

页面自己的 218 个键里，217 个的英文与原来显示的完全一样（取合并后的英文词典对该中文原文的答案；Workflows 的词被别的主人的同名词压过的，也按压过之后的显示算）。有变化的一条：

- 函数交接的「正文规则」输入框的示例（`workflows.rule.body-placeholder`）：原来整句是中文原文（`例如：来源：{来源}…`），英文词典里没有它，英文界面照样显示中文；现在是 `e.g. Source: {来源}` / `Link: {链接}` / `{正文}` 的整句，三个占位词仍是交接规则认的中文词（`WORKFLOW_TEMPLATE_FIELDS`），作为值传入。

删除 `src/en.ts` 里 183 条之后，用合并后的英文词典（工作台 `i18n/en.ts`）逐键比对删除前后：没有任何键的英文改变。

## 行为不变，与细节上的几处不同

页面的行为不变：链的画法与动效、拖动与键盘移动、未保存的改动的暂存与重试、撤销、浮层、交接设置与动作步骤、运行视图、手动交接表单、对话框、`molis-work:model-ready` / `select-item` / `item-unreadable` 三个事件、`sessionStorage` 里记位置与草稿的键。细节上有这几处：

- 请求失败的说法：走共享的 `molisWorkRequest` 之后，网络层的失败（拿不到答复、写请求不知道成没成）用共享助手的说法，不再是浏览器的原话；读被宿主拒绝时仍用 `host.readRefusal` 的说法。写请求带共享助手的一次性键。
- 撤销时传给保存的 `undo: true` 没有任何读取者，去掉了。
- 判断规则选择框里「已不存在」的规则、动作步骤里已消失的动作，原因仍以我们的键存在 `reason` 里，由 `said()` 翻译。
- 浏览器用例里模拟传输挂起的两处（`tests/workflows-save-ownership.e2e.test.ts` 的 `watchSaves`、`tests/workflows-action-steps.e2e.test.ts` 里晚到的读）原先包 `window.fetch`，页面的请求现在走帧内的 `molisWorkRequest`（`fetch` 在帧启动时已被它捕获），改成包 `molisWorkRequest`：同样挂住宿主真实的答复或真实的拒绝，断言一条没有改。

## 验收

- RAC-156：`ui.ts` 与 `src/browser/` 用到的每个 `workflows.*` 键都有中英文且占位符一致，登记的键没有多余（以字面量写在代码里、由 `said()` 翻译的原因键除外，测试逐个核对它们被点名）；用仓库真实翻译扫描器 scanTree 核对调用，没有中文键，没有未解析的动态键，向翻译器转发非字面量的只有 `said()` 一处；`ui.ts` 画出的页面没有直接写入的中文（`tests/workflows-client-bundle.test.ts`）。
- RAC-157：浏览器代码不直接 `fetch`、无 `any`、`as unknown as`、空 `catch`、浏览器弹窗，不写插件 id 和 `/api/plugins/` 前缀；构建跑浏览器类型检查并用 esbuild 打包，esbuild 与根同版本；包是 `(host) => {…}` 函数表达式，带 `data-assistant-context`、`molis-work:model-ready`、`molis-work:select-item`、`molis-work:item-unreadable`、`workflows.save.failed`、`data-wf-chain`；请求经 `molisWorkRequest`（`tests/workflows-client-bundle.test.ts`）。原先按单引号 `L('…')` 数键的断言（`tests/workflows-plugin.test.ts`）改成数包里的双引号键；`tests/translation-check.test.ts` 里一条核对旧脚本中 `field` 包装函数的键被跟踪的断言随脚本一起删除（同一用例里 Goals 与 Alchemist 的包装函数断言仍在）。
- 页面资源：`/assets/molis-work-plugins/workflows.js` 由 82,031 降到 71,581 字节（`tooling/gates/page-assets.json` 同步）。
- 行为不变：README「改动后必跑」的单元用例；本机已跑的浏览器用例全部通过：`tests/workflows-save-ownership.e2e.test.ts`（5/5，含真实的版本冲突、重新打开与重试）、`tests/workflows-open-object.e2e.test.ts`（2/2）、`tests/workflows-action-steps.e2e.test.ts`（2/2）、`tests/workflows-touch-tools.e2e.test.ts`（3/3）、`tests/model-ready-surfaces.e2e.test.ts`（12/12）、`tests/hover-actions.e2e.test.ts`（2/2）、`tests/missing-item-feedback.e2e.test.ts`（3/3）。

## 合并提示

与 Dataset 片后的 PPT 片（#1217）、Form 片（#1219）共用三个文件，各改各的行：`pnpm-lock.yaml`（各自插件的 `devDependencies` 块，相邻）、`specs/BACKLOG.md`（各自的 BL 行，相邻）、`tooling/gates/page-assets.json`（各自资源的一行）。谁后合入谁解一下文本冲突，不涉及取舍；`page-assets.json` 的数字以合并结果上重新构建后的实测为准（`node scripts/gates/page-assets.mjs --update --base origin/main`）。

## 登记的遗留

- BL-463：Workflows 的 `src/en.ts` 保留的 45 条。
