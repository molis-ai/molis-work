# PG070 完整后继 · 当前计划只读核对

状态：**当前工程方案成立；须在同一 WO 补明三处验收文字后交 writer。** 未发现需要改产品语义、生产路由、公开合同或新加载体系的当前 P1。Coding 与 Characters 同做同验，不恢复旧“只 Coding”边界。

基点 M：`be0c777002509b6eb4e2c2187eb3a5765a5440f6`。独立核对 inputs/M 的 42 个文件均等于准确 Git 对象；两 README 的必跑清单为 18 / 40，去重确为 57。按仓库 molis-plugin-dev 既有登记/UI 约定核查，未以旧主检出或旧协调 WAIT 状态替代当前事实。

## P1：A/C 必须实际执行完整 HTTP 文档，普通导航会重复证明 B

M 的 `apps/local-host/src/web-settings-arrival.ts` 中，`arriveAtProjectPage()` 将顶层项目设置地址送回工作台；`redirectSettingsAddress()` 对有项目的全局设置亦如此。顶层导航判断要求 `sec-fetch-mode=navigate` 且 `sec-fetch-dest=document`。新浏览器上下文不会清掉 Host 项目/最近项目记录。

现有 [standalone:13](/private/tmp/pg070-current/inputs/M/tests/project-settings-standalone.e2e.test.ts:13)对完整设置文档只做 fetch/HTML 检查；[浏览器直接导航:121](/private/tmp/pg070-current/inputs/M/tests/project-settings-standalone.e2e.test.ts:121)明确断言进入工作台。因此新块若仍普通 `Page.navigate(/settings/…)`，保存成功也只证明 B，不能签 A/C 内联脚本真实消费。

**最小明确方式：同源 iframe 直接载入既有完整 HTTP 响应。** A 使用真实插件设置 URL 和 project 上下文，C 使用真实项目设置 URL（如 `/projects/<A>/settings/rules`），不带 `embed=1`；不用 srcdoc、不手抄 HTML、不塞假 Coding/Shelf DOM、不改生产路由。iframe 请求不是顶层 document；现行 [PAGE_CSP:35](/private/tmp/pg070-current/inputs/M/apps/local-host/src/web-composition.ts:35)允许同源 frame 和既有内联程序，无需改 CSP。

先在子文档断言 HTTP/frame 响应成功、同源 URL/path/query 正确、`body.settings-page` 和真实目标 DOM 存在、无 `data-tab-workspace`，排除被带回项目根工作台。再确认子文档自身脚本已绑定、控件可操作，沿现有可靠输入方式操作；不能由父脚本代绑。按 frame/目标 URL/method/意图区分计数，断言目标 POST 一次、owner 回读及子文档重载后的事实。B 仍走正常工作台抽取、缓存和重开。可操作 fixture 由 writer 在原测试内落实，不增加生产“强制 standalone”入口。

## P2：两处验收文字按根已确认口径修正

- **Goals 正控必须经过实际登记脚本。** M 的 `plugins/native/goals/src/workbench-clients.ts` 里 GOALS_SETTINGS_CLIENT_SCRIPT 仅组合 rules/planning/adoption；guidance 是 Workbench 另拼的 PROJECT_GUIDANCE_CLIENT_SCRIPT。[C:118](/private/tmp/pg070-current/inputs/M/apps/workbench/src/project-settings-pages.ts:118)同时有这两条链。C 至少在真实 rules/planning DOM 上验证登记脚本动作和 owner 回读；guidance 原回归保留，但不能独自证明 settingsClient。A 无该 DOM 不硬造，B 用真实规则页，不做三乘三矩阵。
- **零请求限定新增业务 POST/副作用和新增脚本错误。** B 的 [bindEmbed:122](/private/tmp/pg070-current/inputs/M/apps/workbench/src/scripts/client/settings-directory.ts:122)对嵌入页调用 Shelf binder；M 的 Shelf `browser/settings/factory.ts` 在 bind 内无条件 refreshSettings，现行 save 模块会 GET Shelf `/settings`。因此没有 Shelf DOM 也可能有既有 GET。正常 GET/轮询另列，不为绝对零 GET 扩改 Shelf 或公共 binder。

## 现有实现路径与验证范围可保留

Coding 的 settingsStylesheet/settingsClient 由已有聚合消费；[bootstrap:144](/private/tmp/pg070-current/inputs/M/apps/workbench/src/plugin-workbench.ts:144)的 deferClients 不跳过 settingsClient。登记后删 B 的 Coding 直拼，A 删 Coding **及已登记 Shelf** 直拼，是完整修法；C 只验不改。保 request helper 前置、T146 删除结果、T392 judgment-rules 路径、git/files 引用与现有动作。MCP 私有 WeakMap 和按钮 disabled guard 不能独自证明只注入一次；结合这次旧拼接删除、实际 POST/持久化与正常 GET 观察核收即可。

Characters style 放入两个被抽取 section 内有当前链路支撑：[extractContent:129](/private/tmp/pg070-current/inputs/M/apps/workbench/src/scripts/client/settings-directory.ts:129)和 [loadFromHtml:173](/private/tmp/pg070-current/inputs/M/apps/workbench/src/scripts/client/settings-directory.ts:173)保子节点，local surface/缓存重开仍搬同一节点，未见子 style 过滤器。全局入口仅需 project-link 四规则与 hint；项目页保自身 hint/editor-small、媒体规则、source/import/dialog/终端。晚于 head 样式的级联仍按计划用真实计算样式和桌面/窄屏核对。

终端仍沿 [HOST_SURFACE_CLIENTS:170](/private/tmp/pg070-current/inputs/M/apps/workbench/src/plugin-workbench.ts:170)的 `/desktop/pty-client.js`；[现有第一条终端测试:11](/private/tmp/pg070-current/inputs/M/tests/security-invariants-plugin-terminals.e2e.test.ts:11)确为 Characters，临时 codex 的 printf + `/bin/cat` 已覆盖输出、键盘和重附着。补 420px / 窄屏 350px、xterm 可见区域及必要图即可，保全文件 Shelf 原断言，不调用真实 Agent。

资源结算口径正确：角色 CSS 从共用可缓存资产移入入口/项目 HTML；[web-goals-read:44](/private/tmp/pg070-current/inputs/M/apps/local-host/src/web-goals-read.ts:44)已在项目首响应画隐藏角色 stage，不能称未打开时零角色 CSS。计划量真实 served CSS/JS 与 HTML 增量、单列内联设置脚本，不虚构 settings.js，不承诺总字节必降，已覆盖实际成本。原资源/巨型单元规则保持，不预放行增长。

57 文件是现行 README 要求；7 个优先完整文件与剩余检查按准确输入核抵，不重复执行同一有效证据。原 full=true 由根 CI 排保留。本审查不追加矩阵、第二次 Full、固定截图张数或真实模型验证；A/C 正确载入、B 缓存、Characters 首开/换项目/重开、dialog/隔离终端的现有文件增量已足够。

本次唯一写入为本报告；未 build/test/浏览器/真实 Home/模型，未写 source、refs、GH、分支保护，也未替根做 fresh open 求交或分号。以上三项计划修正后可进入根指定 writer 窗口；运行发现的具体问题按同范围处理，不把本报告当实现或产品通过。
