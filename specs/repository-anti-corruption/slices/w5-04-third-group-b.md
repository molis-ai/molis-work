# W5-04 第三组 B：Coding 的页面客户端改成打包、类型检查的 TypeScript

状态：执行中（2026-10-24）。Coding 自己的 24 个客户端文件（BL-605，约 355 KB 的模板字符串与 `toString()` 拷贝）全部改成 `src/browser/` 下的类型化模块，构建时类型检查整个目录、esbuild 打成一个 `dist/workbench-bundle.js`；`src/client.ts` 与十二个按部件的 `*-client.ts` 删掉。叠在第三组 A（Files、Git、Diff、Text Stats 各带自己的包）上，一个 PR、两段提交：先子客户端，再主客户端。

验收编号：RAC-543～548；做完删掉 BL-605（没有新的遗留）。

## 范围

### 两段提交

- 子客户端：步骤报告、角色选择、动作、用量、子智能体面板与卡片、并行写入、计划面板与进度卡、改动审阅、协作面板、任务板、补充回执、模型选择、斜杠菜单与命令面板、设置页方法库与 MCP 区段，各自成为 `src/browser/<名>.ts`，收一个 `ports` 对象（`PagePorts` 加自己的部分），页面文字用 `coding.*` 稳定键，请求只经端口的 `api`。
- 主客户端：`src/browser/main/`，页面所有的状态与函数。

### 主客户端的形状

- 页面对象 `Page`（`main/page.ts`）：`host`、`L`（翻译）、`root`、`directory`、`lifetime`、`q`、`turns`、`input`，加两个口袋：`State`（页面记的一百来项，Map、集合、计数、当前会话……）与 `Refs`（挂载时建好的部件：草稿、任务板、计划卡、各面板……）。所有函数是 `fn(page, …)`，模块里没有 `let`；原来闭包里的互相调用现在是模块之间的 import。
- 点击是规则表（`main/click*.ts`）：`[选择器, 处理函数]`，选择器互不相交，第一条命中的执行，出错统一进状态行。原来是一个四百多行的 `if` 链。
- 请求只经 `main/request.ts`：路径经 `host.pluginRoute(path)`、发请求经共同的 `molisWorkRequest`（带页面的生命周期与取消）。页面里不再写 `io.molis.work.coding`、`/api/plugins/`。工作台把 `pluginId`、`pluginRoute`、`confirm` 交给 Coding 的页面（`workbench.ts` 的 `lent`）。
- 挂载（`main/mount.ts`）按固定顺序：页面对象与基础部件 → 草稿与经它保存的部件 → 任务板与计划卡 → 目录、计划、审阅、动作、角色、代码着色 → 来自外面的事件 → 点击与表单 → 发送 → 轮询。每一段是一个不超过 150 行的函数。
- 自包含的函数仍是 `toString()` 可注入的文本，因为端到端测试要把它们的文本注入页面：`createCodingTimeline`、`createCodingTurnChanges`、`createCodingCodePaint`、`codingQuestionAnswered`；页面本身直接 import 它们，不再拷贝。
- 页面里原来按中文原文当键的 `ROLE_NAMES` 现在是 `coding.role.*` 稳定键（中英文与原来一样）。原来用中文当键的词典条目留着：方法与角色的名字和摘要由 Manifest 以中文数据给出，页面按这些数据查词（`methods.ts`、`run-facts.ts` 里的动态键，验收 RAC-543 列出）。

### 构建

- `tsconfig.browser.json` 不再排除 `main/**`，`tsconfig.main.json` 删掉；`package.json` 的 `build` 里页面是一个包（`workbench-factory.ts`，`(host) => {…}`），设置页与包导出的四个部件各一个包（门禁读得出它们的源），只有测试读的十二个部件由 `scripts/build-test-pieces.mjs` 打。
- 单元测试要单独挂的部件仍各打一份 `dist/<名>-bundle.js`（`(ports) => {…}`，页面本身不读）。`tests/coding-state-rings.e2e.test.ts` 按文件名读它们；步骤、任务板、计划卡、补充回执四份仍由包导出（`CODING_*_CLIENT_FACTORY_SCRIPT`），因为各有单元测试用它们挂假端口。

不动：Goals、Work 的符号，Artifacts 的客户端，各插件的动作与路由，`coding-*actions.ts`。

## 页面资源

`/assets/molis-work-plugins/coding.js`：372,136 → 289,598 字节（−82,538）。第三组 A 已少 40,678，合计 −123 KB。`page-assets.json` 的数字由统筹在批里一并降（新增的四个伙伴资源等用户定后同批处理），本片不提交 `page-assets.json`。

## 对插件和调用方的影响

- 导出：`@molis-ai/molis-work-plugin-coding` 不再导出 `CODING_CLIENT_FACTORY_SCRIPT`（改用 `CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT`，它是原来的 `(host) =>` 外壳加页面的整个包）。仓库里用它的七个测试已改。
- 动作合同、Manifest、路由没动；`tooling/gates/actions/` 没有变化。
- 一处行为的修正：归档会话前的确认原来调 `host.confirm`，但工作台没有把它交给 Coding 的页面；现在交了，归档前会问。英文显示不变。

## 验收

- RAC-543：页面说的每一句都有稳定键与中英文，没有中文键，动态键只在方法/角色名与会话状态词那三个文件；占位符两种语言一致（`tests/coding-client-bundle.test.ts`）。
- RAC-544：浏览器代码不直接 `fetch`（请求只在 `main/request.ts`），无 `any`、`as unknown as`、空 `catch`、浏览器弹窗、`toString()` 拷贝，不写插件 id 与 `/api/plugins/`；`main/` 的模块里不留 `let`；工作台把 `pluginId`、`pluginRoute`、`confirm` 交给页面。
- RAC-545：构建类型检查整个 `src/browser/`，没有排除项也没有第二份 `tsconfig`，用 esbuild 打成一个以 host 为参数的包。
- RAC-546：包是 `(host) => {…}` 函数表达式，能解析，不写插件路由；页面根不在时什么也不挂载。
- RAC-547：`src/client.ts` 与十二个部件的 `*-client.ts` 不在了，也不导出 `CODING_CLIENT_FACTORY_SCRIPT`；单独打的部件都是 `(ports) => {…}`。
- RAC-548：挂载顺序是固定的一列，草稿先于经它保存的部件，轮询最后。
- 行为不变（浏览器用例，CI 批里跑）：`tests/coding-workbench.e2e.test.ts`、`tests/coding-client-lifecycle.e2e.test.ts`、`tests/coding-state-rings.e2e.test.ts`、`tests/coding-taskboard.e2e.test.ts`、`tests/coding-board-origins.e2e.test.ts`、`tests/coding-session-first-read.e2e.test.ts`、`tests/coding-model-controls.e2e.test.ts`、`tests/coding-question-card.e2e.test.ts`、`tests/coding-input-receipts.e2e.test.ts`、`tests/coding-action-cards.e2e.test.ts`。
