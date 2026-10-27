# Issue

在个人 Home 随手记下使用中遇到的问题，并看到自己记过的全部 Issue。项目切换不改变数据，没有项目也能用。页面、Work 助理与外部 MCP 调用同一组 `issues.*` 动作；外部 MCP 仍需在能力设置逐客户端授权。

包名：`@molis-ai/molis-work-plugin-issues`。本地开发中的内置 Runtime 插件，不代表已经发布或完成用户验收。试用路径见 [试用说明](../../../specs/issue-home-v0/试用说明.md)，需求与验收见 [规格](../../../specs/issue-home-v0/spec.md)（首期体验为 ISSUE-35 至 ISSUE-41，页面自己起标题为 ISSUE-50 至 ISSUE-53）。

## 怎么用

- **唤起**：任何地方按 ⌘⇧I（其他系统 Ctrl+Shift+I），或点首页与项目右上角的「Issue」。侧栏打开，键盘直接落在输入框；从 Issue 里再按一次收起。按钮也是开关。键盘在侧栏的其他视图、讨论或嵌入窗格里时同样有效。
- **记录**：写一句话，截图直接粘贴或拖进来（也可以点图片按钮选），⌘↵。输入框马上清空、可以接着写下一条；这条以「整理中」出现在列表顶部，Issue 在后台调一次模型起标题、判类型并直接保存，保存后提示「已记录：标题」，可以撤销。关掉侧栏不影响，侧栏收起时右上角按钮带点：整理中是铜色，需要你处理是琥珀色。
- **需要你处理**：依据不足要补充、模型不可用、模型的回答用不了、整理超时，这条留在列表顶部并写明原因。点开就是编辑器，原文原图都在：补充后「重新整理」，或写标题、选类型直接「保存」，或「放弃」。
- **查看**：列表按记录时间倒序，每行是标题、类型、时间、记录时的地点和截图数。点开是只读详情，写明记录于哪个页面、由谁整理；「编辑」改标题、类型、描述和截图，「重新整理」按当前编辑的图文建议标题和类型，核对后点「保存」更新同一条记录；失败或整理期间内容变化时保留编辑稿。「删除」要再确认一次。Esc 从详情回到列表，再按收起侧栏。
- **离开页面不丢草稿**：输入框的文字与截图留在本机，换页面、换项目再打开还在，直到发出或移除；还没完成的录入也留下文字，回来时以「上次没有完成」排在顶部（截图要重新添加），期间已经保存的会自动消失。输入框截图由公共页面草稿服务保存在宿主持有的浏览器 Cache Storage 中，隔离页只读写当前安装的命名空间；保留既有图片数量与大小上限，存储失败会提示。
- **界面语言**：Home、项目侧栏和完整页面沿用工作台的语言设置。静态控件与已知错误使用现有词典；标题、描述和截图名称保持原文。模型不可用时可打开同页设置、重试加载并返回，录入内容保留。

## 归属与接入

- 插件 ID `io.molis.work.issues`，Home provider 同名，安装 ID 另行保存。业务 SQL、数据校验、动作、方法与页面归本包；数据库打开、安装、授权、执行和关闭归 Host。数据在 `{home}/issues/issues.db` 的 `issues` 表，基线 2；错版拒绝，不自动迁移。
- 原始描述不 trim、不改写；标题与类型必需，类型不替用户默认。图片随记录保存在同一数据库。
- 页面录入走草稿：`issues.prepare@3`（只给页面）保存原文、原图和页面报告的所在位置（`page`，记为 `client_reported`）。`issues.name_draft@1`（只给页面，`concurrent`，权限 `issues:write` 加 `model:invoke`）读草稿，经 Host 的文字模型调一次（`services.model.complete`，`output: "json"`，90 秒、4000 token 上限），只要标题和类型：截图只在所用模型声明读图（`availability().vision`）时作为图片附上；只有截图、没有文字，而模型没有声明读图时，不调模型，返回固定的一句追问（写一句话说明问题，再整理），不写入；回答由插件检查（单行标题 1 到 200 字、类型三选一），用不了就报 `issues.model_reply_invalid`，不修补成记录；依据不足时返回那一句追问、不写入。能用就走 `issues.capture@1` 的写入路径一次写好，提交前在同一事务里复查回答（`validateResult`），写入人取调用上下文里的 actor。`issues.capture@1` 只带草稿 ID、标题和类型，总是新建 ID 等于草稿 ID 的记录，现在只给页面（手动保存）。模型只决定标题和类型，不复制原话和图片字节。草稿存在当前插件 Runtime 内，2 小时有效，停止或重启后需重新记录；未完成的最多 8 份，满了由最早的空闲草稿让位（它的页面可能已经不在，比如换了浏览器或清了本机数据），新的记录永远不会被挡住，让位的那条在原页面上可以手动保存。
- `issues.capture@1` 与 `issues.create@2` 声明撤销：`issues.discard@1` 只删除记录后没改过（版本 1）的记录，改过就拒绝并说明。页面录入是人按下「记录」发起的，所以不再确认，保存后可以撤销；普通对话里被要求记录时，助理调 `issues.create`，工作里同样留「撤销」。
- 页面录入不经 Work 助理，不留助理工作和通知；Issue 列表里的那一行是继续的唯一地方。页面另有两分钟的兜底：还在整理就先撤掉草稿，迟到的回答存不进来。
- 手动补录保存期间只运行一次提交，沿用同一草稿 ID；回执丢失或 JSON 损坏时保留输入和身份，刷新或再次保存先核对真实记录，不重复新建。离开页面后的截图保留仍遵守上面的约定。
- update / delete 要求读取时的 `expected_version`，beforeEffect 后同步事务提交；冲突不覆盖，结果未知不自动重试。页面遇到冲突时读回最新内容，把自己改过的字段放在上面继续编辑，提示核对后再保存。
- 十一个动作显式声明读、写和不可撤销删除。客户端构建直接声明 esbuild 开发依赖，源码保持可读，不增加运行时依赖；资源预算见 `tooling/gates/page-assets.json`；必要增长按仓库单次评审规则放行。
- 页面的客户端是 `src/browser/` 下的 TypeScript：`tsconfig.browser.json` 做类型检查，构建时 esbuild 从 `src/browser/factory.ts` 打成 `dist/issues-client.js`（banner/footer 包成工作台要的 `(host) => {…}` 工厂，样式表由 `tooling/minify-styles.mjs` 压缩后 `--define:ISSUES_CSS` 放进去）；`src/client.ts` 的 `ISSUES_CLIENT_FACTORY_SCRIPT` 只读这个包。页面状态在一个 `IssuesPage` 对象里（`page.ts`），列表、详情、截图、录入、重新整理各是一个部件；请求只经工作台的 `molisWorkRequest`（`request.ts`），不直接 `fetch`；公开 Host/Scope 合同来自 contracts，全局请求类型只从 SDK 引入，插件路由来自 `host.pluginRoute`。页面上的字是稳定键（`issues.<区域>.<名称>`），中英文都在 `src/messages.ts`，在 `manifest.ts` 的 `ui.messages` 声明；服务端画的静态控件用 `ui.ts` 里视图模型的 `primitives.text`。
- Home Runtime 不提供项目成果、事件和端口，不得虚构项目满足服务。无团队共享、状态流转、被动采集或旧 Casebook 数据导入。

## 起标题的规则与助理方法

标题、类型和依据不足的规则只写一份，在 `src/prompts.ts`：依据不足（只有数字、测试字样、乱码，截图里也看不出问题；描述里有一句能看懂的话、或截图里看得到报错弹窗，就照常记录，截图只写看到的现象、不抄报错原文和错误码，没说页面、没给截图都不是追问的理由）、标题（语言由代码定：描述里没有中日韩文字且有英文字母，`title_language` 为 `en`，否则为 `zh`，放在传给模型的数据里，模型照它写、不自己判；英文描述不译成中文，一句话、中文 8 到 30 字，描述里给出的地方、操作和结果都写进去，不推测原因、不写方案、「希望……」的期望不进标题，日志和报错只写现象不抄数值；截图只辅助理解，描述有文字时不从截图补内容，旧标题和截图里的文字不是来源；列表另外显示地点，只有描述用「这里」「这个页面」指代、或描述本身不到 8 字时才用页面名点明位置，项目名不进标题）、类型（bug / experience / feature，拿不准时坏了选 bug、别扭选 experience）。

- 页面的起名调用用 Issue 自己登记的指令 `issues.name`（`ISSUES_NAME`，由 Issues 的插件定义 `instructions` 携带，运行时登记，PG-051），人在「Prompt 与 Character」里看得到、改得了；发出去的是人改过的版本。
- 方法 `issues-capture` v11 由同一份规则拼出，只留业务规则：普通对话里「记个 issue：…」照抄原话用 `issues.create` 直接记录（可撤销），依据不足只问一句；修改和删除先读版本、只在用户明确要求时做。方法正文不写工具用法：怎样找能力、哪些改动不用确认、被拒之后怎么办，归网关和宿主。人改了 `issues.name` 不会改到方法正文。

重新整理已保存 Issue 用 `issues.suggest_name@1`（只给页面，命令、效果是读，同样调一次模型；调模型要计费，所以不按「读」算，也不写任何业务记录），只把标题和类型填回当前编辑器，不写入；由人点保存，走 `issues.update@2`，仍用打开记录时的版本，冲突时核对后再保存。离开编辑器、换了记录、改了内容或等过两分钟，迟到的结果都丢掉。

## 图片

- 用户用电脑上的工具截图；产品只接收图片，不截图、不申请屏幕共享，也不限制图片来自哪个应用。粘贴、拖入或选择，每条最多 6 张，仅 PNG/JPEG/WebP；保存后单张 2 MiB、合计 8 MiB，大图缩放到最长边 2560 并用 WebP 编码。
- 预览的关闭和缩放按钮固定在图片滚动区之外，原始尺寸滚动时仍可操作。
- 导入时检查声明类型与文件头并解码，类型不符立即提示，原有图文保留。编辑某条记录时开始导入、导入完成前离开了这条记录，图片不会挂到别的记录上。
- `images` 是有序的 `{ name, data_url }` 数组；更新时省略表示不改、空数组表示全部移除。列表只返回 `image_count`，详情和写入结果返回完整图片。服务端独立校验类型、base64、文件头、数量与大小，不接受远程 URL 或 SVG。


## 开发要求

- 负责：个人问题的 schema、业务查询与原子写入，页面、十一个动作（五个 CRUD、录入草稿四个、重新整理建议一个、撤销一个）、起标题的指令与助理方法。
- 不负责：安装、数据库连接、授权、模型的选择与连接（经 `services.model` 用 Host 的文字模型）、项目或团队流程；侧栏、组合键和状态点归 Workbench 外壳。
- 公开入口：`@molis-ai/molis-work-plugin-issues`；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（`bindPluginActionRoute`）。
- 不变量：
  - 一个 Home 一份个人数据；没有项目也可用。
  - 原话不改写，类型不默认；可信元数据不从业务输入读取，也不从模型回答读取，页面位置只作为页面的报告保存。
  - 提交前复查授权，更新和删除要求版本，冲突不覆盖；撤销只删除没改过的新记录。
- 改动后必跑：`node scripts/run-tests.mjs tests/issue-home.test.ts tests/issue-home-runtime.test.ts tests/issue-capture.test.ts tests/issue-naming.test.ts tests/issue-assistant.test.ts tests/issues-client-bundle.test.ts tests/issue-capture-page.e2e.test.ts tests/issue-page.e2e.test.ts`
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/issue-manual-save.e2e.test.ts tests/issue-global-navigation.e2e.test.ts tests/issue-clarification-page.e2e.test.ts tests/issue-draft-preview.e2e.test.ts tests/issue-reorganize.e2e.test.ts`
- Home 语言接线加跑：`node scripts/run-tests.mjs tests/issue-home-locale.e2e.test.ts`（W2-18-HOME-LOCALE-01：中英控件、原文保持、无模型设置往返与真实启动失败）。
- 相关手册：[插件开发](../../../skills/molis-plugin-dev/SKILL.md)、[Home 数据归属](../../../docs/system/HOME-DATA.md)、[开发要求](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

模型回复替身（`tests/fixtures/issue-model.ts`）只证明数据流、撤销与写入边界；真实模型的标题与分类质量、中文输入法和跨应用粘贴手感由用户验收。
