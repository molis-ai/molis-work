# Issue

在个人 Home 随手记下使用中遇到的问题，并看到自己记过的全部 Issue。项目切换不改变数据，没有项目也能用。页面、Work 助理与外部 MCP 调用同一组 `issues.*` 动作；外部 MCP 仍需在能力设置逐客户端授权。

包名：`@molis-ai/molis-work-plugin-issues`。本地开发中的内置 Runtime 插件，不代表已经发布或完成用户验收。试用路径见 [试用说明](../../../specs/issue-home-v0/试用说明.md)，需求与验收见 [规格](../../../specs/issue-home-v0/spec.md)（本轮为 ISSUE-35 至 ISSUE-41）。

## 怎么用

- **唤起**：任何地方按 ⌘⇧I（其他系统 Ctrl+Shift+I），或点首页与项目右上角的「Issue」。侧栏打开，键盘直接落在输入框；从 Issue 里再按一次收起。按钮也是开关。键盘在侧栏的其他视图、讨论或嵌入窗格里时同样有效。
- **记录**：写一句话，截图直接粘贴或拖进来（也可以点图片按钮选），⌘↵。输入框马上清空、可以接着写下一条；这条以「整理中」出现在列表顶部，Work 助理在后台起标题、判类型并直接保存，保存后提示「已记录：标题」，可以撤销。关掉侧栏不影响，侧栏收起时右上角按钮带点：整理中是铜色，需要你处理是琥珀色。
- **需要你处理**：助理要补充信息、模型不可用、整理超时，或你设置了这类保存每次都要确认时，这条留在列表顶部并写明原因。点开就是编辑器，原文原图都在：补充后「重新整理」，或写标题、选类型直接「保存」，或「放弃」。
- **查看**：列表按记录时间倒序，每行是标题、类型、时间、记录时的地点和截图数。点开是只读详情，写明记录于哪个页面、由谁整理；「编辑」改标题、类型、描述和截图，「删除」要再确认一次。Esc 从详情回到列表，再按收起侧栏。
- **离开页面不丢字**：输入框的文字留在本机，换页面、换项目再打开还在，直到发出；还没完成的录入也留下文字，回来时以「上次没有完成」排在顶部（截图要重新添加），期间助理已经保存的会自动消失。截图只在当前页面里保留。

## 归属与接入

- 插件 ID `io.molis.work.issues`，Home provider 同名，安装 ID 另行保存。业务 SQL、数据校验、动作、方法与页面归本包；数据库打开、安装、授权、执行和关闭归 Host。数据在 `{home}/issues/issues.db` 的 `issues` 表，基线 2；错版拒绝，不自动迁移。
- 原始描述不 trim、不改写；标题与类型必需，类型不替用户默认。图片随记录保存在同一数据库。
- 页面录入走草稿：`issues.prepare@3`（只给页面）保存原文、原图和页面报告的所在位置（`page`，记为 `client_reported`），`issues.capture@1` 只带草稿 ID、标题和类型，总是新建 ID 等于草稿 ID 的记录。助理只决定标题和类型，不复制原话和图片字节。草稿存在当前插件 Runtime 内，2 小时有效，停止或重启后需重新记录；未完成的最多 8 份，满了由最早的空闲草稿让位（它的页面可能已经不在，比如换了浏览器或清了本机数据），新的记录永远不会被挡住，让位的那条在原页面上可以手动保存。
- `issues.capture@1` 与 `issues.create@2` 声明撤销：`issues.discard@1` 只删除记录后没改过（版本 1）的记录，改过就拒绝并说明。所以被要求记录时，助理可以用 `change-reversible` 直接保存，工作里留「撤销」；用户在能力设置里要求每次确认时退回确认卡，页面把卡变成预填好的编辑器。
- 页面拿到结果后把这次的助理工作归档并清掉它的通知：结果已在 Issue 里，不在助理列表里一条一条刷屏。需要补充、确认卡、失败也一样：Issue 列表里的那一行是继续的唯一地方，页面在显示它时就停止并归档这件工作，助理那边不再「等你」同一个问题。
- update / delete 要求读取时的 `expected_version`，beforeEffect 后同步事务提交；冲突不覆盖，结果未知不自动重试。页面遇到冲突时读回最新内容，把自己改过的字段放在上面继续编辑，提示核对后再保存。
- 九个动作显式声明读、写和不可撤销删除。客户端构建用仓库已有的 esbuild 压缩工厂字符串，源码保持可读，不增加运行时依赖；资源上限见 `tooling/gates/page-assets.json`，只许变小。
- Home Runtime 不提供项目成果、事件和端口，不得虚构项目满足服务。无团队共享、状态流转、被动采集或旧 Casebook 数据导入。

## 助理方法

方法 `issues-capture` v9：页面录入一轮完成，先看依据够不够（只有数字、测试字样、乱码又没有能看懂的截图就不保存，只用 ask-user 问一个自由文本问题，参数只有 why），够就不先发现能力、直接保存一次，没有调用成功不说已记录；标题和描述同一种语言，以本次描述为准（一句话、中文 8 到 30 字，写清在哪里做了什么出了什么问题，不推测原因、不写方案，日志和报错只写现象不抄数值），截图只辅助理解，旧标题和截图里的文字不是来源；列表另外显示地点，所以只有描述用「这里」「这个页面」指代时才用页面名点明位置，项目名不进标题；类型按 bug / experience / feature 的定义，拿不准时坏了选 bug、别扭选 experience。页面发给助理的消息只说「请按 Issue 方法处理」，保存还是追问由方法决定。普通对话里「记个 issue：…」照抄原话用 `issues.create` 直接记录（可撤销）；修改和删除先读版本、只在用户明确要求时做。

## 图片

- 用户用电脑上的工具截图；产品只接收图片，不截图、不申请屏幕共享，也不限制图片来自哪个应用。粘贴、拖入或选择，每条最多 6 张，仅 PNG/JPEG/WebP；保存后单张 2 MiB、合计 8 MiB，大图缩放到最长边 2560 并用 WebP 编码。
- 导入时检查声明类型与文件头并解码，类型不符立即提示，原有图文保留。编辑某条记录时开始导入、导入完成前离开了这条记录，图片不会挂到别的记录上。
- `images` 是有序的 `{ name, data_url }` 数组；更新时省略表示不改、空数组表示全部移除。列表只返回 `image_count`，详情和写入结果返回完整图片。服务端独立校验类型、base64、文件头、数量与大小，不接受远程 URL 或 SVG。

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`

## 开发要求

- 负责：个人问题的 schema、业务查询与原子写入，页面、九个动作（五个 CRUD、录入草稿三个、撤销一个）与助理方法。
- 不负责：安装、数据库连接、授权、模型、项目或团队流程；侧栏、组合键和状态点归 Workbench 外壳。
- 公开入口：`@molis-ai/molis-work-plugin-issues`；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`。
- 不变量：
  - 一个 Home 一份个人数据；没有项目也可用。
  - 原话不改写，类型不默认；可信元数据不从业务输入读取，页面位置只作为页面的报告保存。
  - 提交前复查授权，更新和删除要求版本，冲突不覆盖；撤销只删除没改过的新记录。
- 改动后必跑：`node scripts/run-tests.mjs tests/issue-home.test.ts tests/issue-home-runtime.test.ts tests/issue-capture.test.ts tests/issue-assistant.test.ts tests/issue-capture-page.e2e.test.ts tests/issue-page.e2e.test.ts`
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/issue-global-navigation.e2e.test.ts tests/issue-clarification-page.e2e.test.ts tests/issue-assistant-repair-page.e2e.test.ts`
- 相关手册：[插件开发](../../../skills/molis-plugin-dev/SKILL.md)、[Home 数据归属](../../../docs/system/HOME-DATA.md)、[开发要求](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

模型回复替身（`tests/fixtures/issue-model.ts`）只证明数据流、撤销与写入边界；真实模型的标题与分类质量、中文输入法和跨应用粘贴手感由用户验收。
