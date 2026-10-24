# W5-04 第二组：Files、Schedule、Shelf、Git 的稳定翻译键与打包、类型检查的客户端

状态：执行中（2026-10-24）。Files、Schedule、Shelf、Git 四个插件的页面客户端改成打包、类型检查的 TypeScript，页面文字全部是稳定键（Git 在 #1236 合入后并进来）；本地构建、定向用例与健康门禁通过，待统筹集成全量。四个插件是一个完整功能、一个 PR，合过一次 main（bde02c59e），不叠在别的片上。

验收编号：RAC-160～168（Files 160～161，Schedule 162～163，Shelf 164～166，Git 167～168）。

## 范围

做法和 Todo、Dataset 两片一样：`src/browser/` 的 TypeScript，`tsconfig.browser.json` 类型检查，esbuild 打成 `dist/<插件>-client.js`（`(host) => {…}` 工厂，`--minify`），`src/client.ts` 只读这份包；请求只经工作台的 `molisWorkRequest`，路径取自 `host.pluginRoute("")`，插件 id 取自 `host.pluginId`，浏览器代码里不再写 `io.molis.work.` 和 `/api/plugins/`；界面文字是 `src/messages.ts` 里的稳定键（中英文并排，登记在 `registration.ts` 的 `messages`）。esbuild 是各包的直接开发依赖，版本与根相同（`pnpm-lock.yaml` 同步）。

### Files（RAC-160、RAC-161）

- 135 行的客户端改成 `src/browser/`（`types`、`dom`、`page`、`tree`、`reader`、`client`、`factory`）。页面文字在 main 上已经是稳定键（`FILES_MESSAGES`），键和英文一个没动。
- 工厂是 `(host, browser) => { … return browser }`（伙伴舞台把返回的 `browser` 当作可调用的目录与阅读器接口，由 banner/footer 包出来，其余插件没有这个形状）。
- 新增 `src/plugin-id.ts`：Manifest 与服务端共用的插件 id 一处写，客户端不再自己写。

### Schedule（RAC-162、RAC-163）

- 370 行的客户端改成 `src/browser/`（`types`、`dom`、`request`、`page`、`form`、`actions`、`operation`、`recovery`、`stage`、`client`、`factory`）：任务表单与暂停、定时操作的审阅（确认决定、确认恢复）与未知结果的重试或跳过，逐段照搬。
- 页面文字：`ui.ts`、`operation-ui.ts` 和客户端里的中文原文改成 96 个稳定键 `schedule.<区域>.<名称>`；`src/en.ts` 从 88 条减到 26 条（宿主仍按中文原文翻译的词，见 BL-463）。
- `package.json` 加 `@molis-ai/molis-work-plugin-sdk`（只用它的类型认出 `molisWorkRequest`），`scripts/workspace-packages.mjs` 的登记和 README「依赖」同步。

### Shelf（RAC-164～166）

- 1,640 行的 `client.ts`、`reading-client.ts`、`result-client.ts` 改成 `src/browser/` 的 27 个文件，每块压在函数 150 行以内：页面状态在一个 `ShelfPage` 对象里（`types.ts`），列表、预览、编辑、动作栏、确认、运行、放入、剪贴板、终端、材料交换、结果交换各是一个部件（`rows`、`panes`、`preview`、`edit`、`bar`、`confirm`、`run`、`admit`、`clips`、`tui`、`material`、`result` 等），点击由 `bench.ts` 里按顺序匹配的处理表分发。
- 设置页的客户端（533 行）改成 `src/browser/settings/`，打成 `dist/shelf-settings-client.js`；`src/settings-client.ts` 在前面放热键表和路由后交给设置页（热键默认表取自 `@molis-ai/molis-work-module-shelf`，仍是同一份）。
- 页面文字：`ui.ts`、客户端和设置页的中文原文改成 166 个稳定键 `shelf.<区域>.<名称>`（156 个页面的、10 个设置页的）；`src/en.ts` 从 335 条减到 187 条（服务端标签与错误、`settings-ui.ts` 的词和别的主人在查的词，见 BL-464）。
- 登记的页面事件 `PAGE_STATE_OWNERS.shelf.files` 指向新的文件（`browser/document.ts`、`browser/tui.ts`、`browser/settings/reload.ts`，`terminal-client.ts` 不变），`tooling/gates/api/contracts/platform/dom-events.txt` 同步；事件名和载荷没变，对插件和调用方没有影响。

### Git（RAC-167、RAC-168）

- 266 行的客户端改成 `src/browser/`（`types`、`dom`、`page`、`results`、`diff`、`list`、`source`、`conflicts`、`client`、`factory`）：改动列表、结果历史、diff 与暂存动作、分支/提交/推送/拉取/合并/PR 的源码控制块、合并冲突编辑，逐段照搬。页面状态在一个 `GitPage` 对象里（`page.ts`）。
- 页面文字在 main 上已经是稳定键（`GIT_MESSAGES`），键和英文一个没动。原先 `L({…}[state] || …)`、`L(cond ? a : b)` 这类按条件取键的写法改成逐个字面量调用（`switch`），扫描器能列全。
- 宿主与动作写的句子（拒绝、结果、摘要）仍只经一处说成页面的语言：`page.S`。`sayHostSentence`、`sayUpstream` 搬到不依赖词典的 `src/say.ts`（`sentences.ts` 再导出，包的导出不变），打包时直接 import，不再用 `toString()` 拷进脚本；句子模板表 `GIT_SENTENCE_TABLE` 由 `src/client.ts` 作为第二个参数交给包（工厂是 `(host, sentences, git) => { … return git }`，`client.ts` 外面再包成 `(host) => …`），所以包里没有词典。
- 请求仍经 Coding 的包给的 `host.request`（不直接 `fetch`，不写 `/api/plugins/`）。
- 未知的执行结果词（页面不认识的 outcome）原来会显示 `undefined`，现在显示原词。

不动 `manifest.ts`（Files 的 Manifest 只改成取共用的插件 id）、`actions.ts`、`plugin.ts`、`store`、`styles.ts`、服务端路由与动作。不改工作台与别的主人的文件、别片的规格。

## 英文显示的变化（逐条）

- Schedule：96 个键的英文与原来显示的完全一样。
- Files：键与英文没动。
- Shelf：164 个键的英文与原来完全一样；2 处变化：新建里的「文本」「其他文件」，原来是用中文原文当名字去查，词典里没有，英文界面显示的是中文，现在是 `Text`、`Other files`。
- 别的主人的页面一条没变（逐条核对过合并后的英文词典：删去的 `en.ts` 条目没有被别的键查）。

## 行为说明

逐段照搬的行为：Shelf 的选择与多选、预览与整份读入（取消迟到的读取）、编辑副本的保存、动作栏与确认、任务运行与取消、文件与文件夹放入（部分失败时成功的留着）、剪贴板、终端交接（桥不在时保留输入）、项目资料与固定成果的交换、窗口事件只由活着的一份挂载回答；Schedule 与 Files 同。有意不同的三处，都是改用共同请求口的结果：

- 失败原话：请求失败说的是 Host 给的话，没有时说页面自己的话；读一份副本失败仍固定说「无法读取这份副本，请重试。」（不转述 Host 的话，与原来一致）。
- 设置里的保存在连接丢了时，原来说「无法保存 Shelf 设置」，现在和所有页面一样说「不知道这次操作有没有完成，请刷新后核对」（写入可能已完成，共同请求口不猜）；开关仍退回已保存的值，仍在这个控件所在的块里用 `role="alert"` 说。`tests/save-failure.e2e.test.ts` 的断言改成这句。
- 设置里的「试用示例」按钮：原来不管成败都说「已放回」，现在失败时说失败。

## 验收

- RAC-160：Files 的页面文字每个键都有中英文且占位符一致，登记的没有多余；用仓库真实翻译扫描器 scanTree 核对调用，没有中文键、没有未解析的动态键（`tests/files-client-bundle.test.ts`）。
- RAC-161：Files 的浏览器代码不直接 `fetch`、无 `any`、`as unknown as`、空 `catch`、浏览器弹窗，不写插件 id 和 `/api/plugins/` 前缀；构建跑浏览器类型检查并用 esbuild 打包，esbuild 与根同版本；包是 `(host, browser) => {…}` 函数表达式（`tests/files-client-bundle.test.ts`）。
- RAC-162：Schedule 同 RAC-160（`tests/schedule-client-bundle.test.ts`），并且浏览器代码没有把不是自己从表里挑的词交给翻译。
- RAC-163：Schedule 同 RAC-161，包是 `(host) => {…}` 函数表达式，带 `data-assistant-context`、`data-schedule-operation-decision`、`mw-schedule-open`、`molis-work:model-ready`、`schedule.error.restore-operation`（`tests/schedule-client-bundle.test.ts`）。
- RAC-164：Shelf 页面与设置页的每个键都有中英文且占位符一致，没有多余；没有中文键、没有未解析的动态键；Host 写的话只经 `said` 一处进入翻译；设置页的词与 `settings-ui` 的热键占用、录制两处提示对得上（`tests/shelf-client-bundle.test.ts`）。
- RAC-165：Shelf 的浏览器代码同 RAC-161 的规则；包是 `(host) => {…}`，带 `shelf.request.shelf-request-failed` 等记号（`tests/shelf-client-bundle.test.ts`）。
- RAC-166：Shelf 设置页的包前面放着热键表与路由，包本身用页面的 `L` 与 `molisWorkRequest`（`tests/shelf-client-bundle.test.ts`）。
- RAC-167：Git 的页面文字每个键都有中英文且占位符一致，浏览器代码里没有按条件取键的非字面量调用，宿主句只经 `page.S` 一处进入翻译；宿主句模板表里的键都有定义（`tests/git-client-bundle.test.ts`）。
- RAC-168：Git 的浏览器代码不直接 `fetch`、无 `any`、`as unknown as`、空 `catch`、浏览器弹窗，不写插件 id 和路由前缀，时间随页面语言；构建跑浏览器类型检查并用 esbuild 打包，esbuild 与根同版本；包是 `(host) => ((host, sentences, git) => {…})(host, 表)`，带宿主句模板表、不带词典；没有 Git 的元素时什么也不挂、返回 null（`tests/git-client-bundle.test.ts`）。`tests/diff-git-english-sentences.test.ts` 里读脚本文字的几处断言改成读 `src/browser/` 的源码。
- 页面资源（`tooling/gates/page-assets.json` 同步，全部变小）：`schedule.js` 16,407 → 12,570；`shelf.js` 76,438 → 63,376；`coding.js`（Files 与 Git 的客户端折进 Coding 的包）377,163 → 372,136；`molis-work-workbench.js` 1,130,916 → 1,126,567；合计少 26,275 字节。
- 原先靠正则读脚本文字的断言（`tests/shelf-plugin.test.ts`、`tests/plugin-global-settings.test.ts`）改成读 key 与包里的字符串（压缩后函数名会变，不再按名字断言）；浏览器用例的假宿主补上 `pluginRoute`、`pluginId`、`loadMedia`、按键解析的 `translate` 和真实的 `molisWorkRequest`（`tests/shelf-client-boundaries.e2e.test.ts`、`tests/fixtures/schedule-host.ts`）。
- 行为不变：README「改动后必跑」的单元用例与浏览器用例（`tests/shelf-client-boundaries.e2e.test.ts`、`tests/shelf-dropagent-parity.e2e.test.ts`、`tests/shelf-partial-admission.e2e.test.ts`、`tests/shelf-plugin.e2e.test.ts`、`tests/shelf-side-links.e2e.test.ts`、`tests/schedule-isolated-page.e2e.test.ts`、`tests/companion-client-lifecycle.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`、`tests/plugin-small-ux.e2e.test.ts`、`tests/request-failure-call-id.e2e.test.ts`、`tests/save-failure.e2e.test.ts`、`tests/cross-plugin-recovery.e2e.test.ts`、`tests/workflows-action-steps.e2e.test.ts`、`tests/composer-steady.e2e.test.ts`）通过。

## 合并提示

- #1223 也改了 Shelf 的 `registration.ts`、`index.ts`、`manifest.ts`、`plugin.ts`、`home-plugin.ts`、`owner-files.ts`、`README.md`，本片在 `registration.ts`（加 `messages`）、`index.ts`（导出 `SHELF_MESSAGES`）和 README 的文件表有文本重叠，不涉及断言；#1230 改了 Files 的 `README.md`，与本片在「开发要求」一节相邻。
- `tests/plugin-client-served.test.ts`、`clientServed`、`served()` 在 #1232 合入后没有读者了（客户端文件都是打包出来的），那时一并删。

## 登记的遗留

- BL-463：Schedule 的 `src/en.ts` 保留 26 条宿主仍按中文原文翻译的词（服务端标签与错误、别的主人在查的词）。
- BL-464：Shelf 的 `src/en.ts` 保留 187 条，其中 `settings-ui.ts` 还有 47 处 `p.text("中文原文")`、没有稳定键；把设置页服务端画的词也改成键后，这些条目才能删。
