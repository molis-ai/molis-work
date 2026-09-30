# 平台侧栏：讨论、浏览器、文件与助理操作

状态：已经 #118 合入 main（d38e6099）。工程与真实场景通过，浏览器全量回归对基线没有新增失败；只剩用户本人验收（2026-09-30）。目标原文见 [goal-prompt.md](goal-prompt.md)；用户授权按推荐方式持续推进，取舍记在第 2 节。分支 `feature/side-panel`，工作树 `.claude/worktrees/side-panel`，基于 `feature/system-assistant` 2e837e8f（已含 main #101，等于 #98 合入后的 main）。

## 1. 要解决的事

“项目讨论”的右侧分屏（`apps/workbench/src/discussion-split.ts`）已经证明了“不离开当前工作、左边真实让出宽度”的形态，但它写死只装一个群聊 iframe。本任务把它发展为**平台级侧栏**：

- 同一个分屏里以标签承载：项目讨论、浏览器、文件（助理工作与各插件的文件预览），以及插件声明的内容。
- 浏览器可以真实使用；助理可以在里面动手（Computer Use），用户看得见、管得住、能接手。
- 当前网页可以交给助理当材料。
- 插件按统一约定贡献“文件来源”和“侧栏视图”，平台不为某个插件写专属逻辑。

## 2. 决策记录

| # | 决定 | 理由 |
| --- | --- | --- |
| D01 | 以 `feature/system-assistant` 为基开发，#98 合入后合 main | 助理服务、SDK 合成包 `assistant-intake.tgz` 都在该分支；它已含最新 main |
| D02 | Computer Use 本期只做侧栏里的浏览器；桌面其他应用不做，界面不暗示 | Prologue 自己的桌面驱动未经真机验证；浏览器边界清楚、可看可接手 |
| D03 | 浏览器由 local-host 启动本机 Chrome 系浏览器（Chrome / Chromium / Edge / Brave，无头模式），只说 CDP，不引入自动化库；画面用 `Page.startScreencast` 推到侧栏，输入用 `Input.*` 送回 | 桌面（Tauri/WKWebView 无 CDP）与本地网页模式同一实现；iframe 嵌不了大多数网站；Prologue 的参考驱动同样只说 CDP |
| D04 | 浏览资料放在 Home 下独立目录（`<home>/browser/profile`），与用户自己的浏览器登录状态分开，并在界面上说明 | 不读用户真实浏览器的 Cookie；助理操作的也只是这个隔离环境 |
| D05 | 助理的观察与操作只走 Prologue `ui-control`（`runtime.surfaces` + `surface-list/observe/act`），驱动由 Molis 实现并挂到 Runtime；不在 Host 包工具里另造一条绕过策略的通道 | 目标第 9 条；按网站的策略门、执行前四项核对、截图脱敏都在 SDK 里 |
| D06 | SDK 补丁（以 c63ea1a1 为父单开分支，替换 `assistant-intake.tgz`，main 仍只有一条 SDK 谱系）：① `workspace:"app"` 在 Runtime 挂了界面时放行 `surface-*`；② `surface-observe` 的文字类观察（可访问性树、DOM、窗口信息）以“不可信页面内容”标记、有上限地把正文交给模型；截图仍只回引用 | 现状：app 模式起跑即拒 `surface-*`；观察只回资源引用，模型在同一轮里读不到页面，助理无法真正操作 |
| D07 | 助理感知以驱动生成的“可操作元素清单”为主（编号、角色、名称、中心坐标、是否可见），截图是辅助；点击按清单里的坐标 | 不依赖模型看图能力（MiniMax 视觉能力按模型设置判断）；坐标与 SDK 的 pointer 动作一致 |
| D08 | 网站授权用 Prologue 规则 `{ what: "surface", surface, scope: <origin>, action? }`：默认 `surface-act` 问人、观察不问；“允许这个网站以后不再询问”= 审批时 `remember`（只放这个 origin 的非外传动作）并由 Molis 持久化；“禁止这个网站”= 持久化的 deny 规则，连观察都挡；上传永远问 | SDK 规则按 origin 精确匹配；上传归 `mutate-external`，敏感路径由 SDK 地板表拒 |
| D09 | 接手：侧栏有“接手 / 交回”。接手时 Host 暂停助理这一轮并让驱动拒绝一切动作（回执写“用户正在操作”）；交回时带一句“用户操作过，请先重新观察”接着跑 | SDK 的身份与时效核对保证交回后不会用旧观察去点 |
| D10 | 截图脱敏：驱动截图前给密码框、支付卡字段、一次性验证码字段盖上遮罩，截完移除；登记给 SDK 的脱敏器只接受带遮罩标记的截图，否则拒绝（截图不可用，DOM/元素清单仍可用） | SDK 认不出屏幕上的密码框；遮蔽只能在页面里做 |
| D11 | 插件文件用新的**文件来源协议**（`platform/file-sources.ts`，形状仿搜索来源）：一个列出条目的查询动作 + 可选的内容动作；没有内容动作时用该插件的对象读取器（`<plugin>.subject.read`）取正文预览 | 复用动作目录的发现、授权、停用即撤下；插件不写 Host 代码 |
| D12 | 助理工作的文件：清单留在助理面板左栏（会话 [3c6203] 的改版），点开后在侧栏预览（`molis:side-open`）；附件正文用助理服务 `rounds[].materials`，图片与 PDF 原件的新接口由助理会话在 assistant 服务里加 | 与 [3c6203] 的约定；不出现两份竞争的清单 |
| D13 | 新增 UI 槽 `side`。插件在 `ui.views` 声明 `slot: "side"`，Host 在 `/projects/<id>/side/<plugin>/<view>` 渲染该 contribution，侧栏用同源 iframe 装载（与项目讨论同等隔离），宽度与位置归 Host | 目标第 8 条；“新区域先改壳再开槽”（`platform/ui.ts` 注释） |
| D14 | 各标签内容常驻、隐藏不销毁；上次的标签、宽度比例按本机记住（localStorage，失败不影响使用）；收起再打开恢复原状 | 目标第 1 条：切换与收起都不丢状态 |
| D15 | 侧栏暴露 `--side-panel-width`；不使用 `.assistant-*` 类、不动底栏中间列；动效只用 `--dur-*`（130/250/420/640）与曲线 token，不过渡布局属性以外的新属性 | 与 [3c6203] 的约定、craft-finish 设计门禁 |
| D17 | Coding 不单开文件来源：它在项目工作目录里工作，那里的文件由 Files 的“工作区文件”列出；它每一轮改动的文件固定为变更记录（Artifact），由 Artifacts 列出 | 同一份文件不在侧栏出现两份竞争的清单 |
| D18 | 地址栏输入不像网址时按 Bing 搜索（`https://www.bing.com/search?q=`），只打开 http/https/about:blank；侧栏浏览器永远不能加载本机 Molis Work 服务自己的地址（CDP 层按 origin 拦截） | 本机服务页面带控制令牌，能加载它就等于绕过动作授权 |
| D19 | 本期插件扩展面向官方与手写插件（native/app）：Manifest 声明 `side` 视图与文件来源动作即接入，Host 不写专属逻辑；插件创作台生成的插件暂不能声明（与搜索来源同一限制，后续） | 生成插件的动作由 operations 派生，不含协议型动作 |
| D20 | “交给助理”把用户看到的页面（选段或可读正文，≤20000 字，带地址与时间）作为本轮材料，经现有资源通道进入；不另用 Prologue `source` 摄取 | `ingestWebPage` 匿名重抓，内容与登录后看到的不同；app 模式无检索资料源的工具，登记不产生可用引用。对照表如实记为未接 |
| D21 | 助理使用侧栏浏览器有总开关，默认开（每个动作本来都要问）；存 `<home>/browser/sites.json`；只读轮次只能看；一页一个工作，被占用时明确告知；委托出去的子工作由助理服务在启动请求带 `browser:false` | 助理会话复查意见 |
| D22 | 网站决定当场生效：允许过的网站作为记住的批准（启动时也经 `effects.remember` 载入），撤销用 `forget`；禁止的网站由驱动在看和动手前拒绝，不写成 Prologue 启动规则 | 启动规则在重启前收不回，撤销/解除禁止会等到下次重启才算数（真实场景复测时发现） |
| D23 | 接手使之前的观察作废：页面身份含接手次数；接手期间确认条不给「允许」；查看页面也记下是哪项工作，接手/交还事件带会话 | 真实会话里批准接手前的输入会把字接在人改过的内容后面；交还事件没有会话，助理接不上 |
| D24 | 侧栏的委托点击按 `nodeType` 判断元素，不用 `instanceof Element` | 同源框架（隐藏的插件创作台）先碰过的节点带着那个框架的原型，点击会被静默忽略；平台范围的根因另开任务 |
| D16 | 插件声明会操作哪些网站：Manifest `permissions` 增加 `surface:browser`，附 `origins`；安装与市场摘要列出；声明里带路径或查询串当场拒 | 仿 Prologue `PluginPermissions.surfaces`；本期没有插件真的驱动浏览器，只落声明与展示 |

## 3. 结构与归属

| 部分 | 位置 | 负责 |
| --- | --- | --- |
| 侧栏壳（标签、分屏、动效、事件） | `apps/workbench/src/side-panel/*`（替换 `discussion-split.ts`） | 本任务 |
| `side` 槽、文件来源协议、`surface:browser` 声明 | `packages/contracts/src/platform/{ui,file-sources,plugin-manifest}.ts`，SDK 导出 | 本任务 |
| 浏览器服务（启动、CDP、画面、输入、崩溃恢复、下载、对话框） | `apps/local-host/src/browser/*` | 本任务 |
| 界面驱动（`UiSurface` 实现、元素清单、遮罩） | `apps/local-host/src/browser/surface-driver.ts` | 本任务 |
| Runtime 挂界面、脱敏器、站点规则装入 | `horizontal/agent-host`（Prologue 接线） | 本任务写新文件，`prologue-node.ts` 的接线点与助理会话对齐 |
| 助理规则（surface-act 走确认、announce-guard 认工具名、审批卡片文案） | `horizontal/agent-host`、`apps/local-host/src/assistant/` | 助理会话 |
| 文件标签（来源列表、预览） | `apps/workbench/src/side-panel/files-*`、`apps/local-host/src/side-files-http.ts` | 本任务 |
| 各插件的文件来源 | Files、Pages、Artifacts、Coding 各自的包 | 本任务（每个插件一个声明 + 处理器） |
| 助理面板里的“打开到侧栏” | `assistant-island.ts` | 会话 [3c6203]，本任务提供事件 |
| SDK 补丁 | Prologue 新分支（父 c63ea1a1） | 本任务 |

### 3.1 侧栏事件（宿主页面内）

- `molis:side-open`：`detail: { tab: "discussion" | "browser" | "files" | "plugin", view?: "<plugin_id>/<view_id>", target?: { url? , source?, subject? } , focus?: false }`。打开侧栏并切到对应标签；`focus` 默认不抢焦点。
- `molis:side-close`、`molis:side-toggle`。旧的 `molis:discussion-toggle / -close` 继续可用，映射到讨论标签。
- 同源 iframe（插件页面、群聊）用 `postMessage({ type: "molis:side-open", ... })`，宿主只认同源。

### 3.2 浏览器 HTTP（local-host，控制令牌保护）

`/api/browser/state`、`/api/browser/stream`（SSE：画面帧、地址、标题、加载、崩溃、对话框、下载、助理操作与接手状态）、`/api/browser/navigate|back|forward|reload|stop`、`/api/browser/input`（鼠标、滚轮、按键、文字、输入法组合结束）、`/api/browser/resize`、`/api/browser/takeover|handback`、`/api/browser/capture`（给“交给助理”）、`/api/browser/restart`、`/api/browser/dialog`、`/api/browser/file-chooser`、`/api/browser/sites`（站点规则的查看与撤销）。一个 Home 一个浏览器进程、每个项目一张标签页（项目之间页面与画面不串）。

### 3.3 文件来源协议（`molis.files.*.v1`）

- `defineFileEntriesAction(capability_id, kinds, title, permissions, scope)` → 输入 `{ cursor, limit }`，输出 `{ entries, next_cursor, collection_revision }`；条目 `{ subject, revision, title, folder: string[], media_type, size: number|null, updated_at, open: {surface,id}|null }`。
- 可选 `defineFileContentAction`：输入 `{ subject, revision? }`，输出 `{ subject, revision, media_type, encoding: "utf8"|"base64", data, truncated }`，单次上限 8 MB。
- Manifest 检查与搜索来源同一处（`inspectActionDeclarations`）；插件停用即从目录消失，侧栏随之撤下。

## 4. 分期

| 期 | 交付 | 验证 |
| --- | --- | --- |
| P1 壳 | 侧栏壳替换讨论分屏；讨论成为第一个标签；事件接口；`--side-panel-width`；键盘、Escape、窄屏上下分屏、减少动态 | 单测 + 预览 1440/1024/800/390、深色；讨论原有 e2e 不退化 |
| P2 浏览器 | local-host 浏览器服务 + 侧栏浏览器标签（地址栏、前进后退刷新、画面、点击输入、中文输入法、滚动、对话框、下载、上传选择、崩溃恢复、无 Chrome 的指引） | 真实网站登录与使用 |
| P3 文件 | 文件来源协议 + Files、Pages、Artifacts、Coding 四个来源 + 文件标签（列表、预览、打开到插件） | 协议单测、宿主测试、真实预览 |
| P4 SDK | Prologue 补丁 D06；新 tgz；`scripts/workspace-packages.mjs` 同步 | SDK live 测试 + Molis 构建与边界检查 |
| P5 助理操作 | 驱动 + Runtime 挂界面 + 站点规则 + 侧栏里的审批条、操作指示、接手/交回；助理会话改 agent-host 规则 | MiniMax 真实多步任务、允许/禁止、上传确认 |
| P6 交给助理 | 浏览器标签“带到助理 / 交给助理”（选区或正文、来源与时间） | 真实页面被助理引用 |
| P7 插件扩展 | `side` 槽 + Host 渲染路由 + 样例插件（只靠声明）+ `surface:browser` 声明展示 + 手册与自动检查 | 启用/停用撤下 |
| P8 助理文件 | 侧栏预览助理附件与成果（与 [3c6203]、助理会话对接） | PDF、图片、成果打开并跳回插件 |
| P9 收尾 | 各宽度/深色/读屏/长内容走查、能力对照表更新、全量回归、PR | 验收清单 |

## 4.1 存量接入与清理（用户 2026-09-30 补充）

原话：“注意要把存量的内容都接入进来，比如 coding 里，比如助理里，以及其他可能的地方，存量代码如果有可以清理的也就清理掉。”

| 存量 | 接入方式 | 状态 |
| --- | --- | --- |
| 各插件的外链（Feed 原文、Pages 链接、Cognia、Shelf 网址、Alchemist 证据、Artifacts 来源、Goals 附件、Git 远端…） | 平台级链接接管 `SIDE_LINKS_SCRIPT`：外站 `target=_blank` 与 `window.open` 在侧栏浏览器打开，⌘/Ctrl/Shift 仍用系统浏览器；同源、下载、`window.open("")` 不接管；窗格与插件侧栏 iframe 交给顶层侧栏 | 已写，待验证 |
| Coding 对话里的网址（开发服务器 localhost 等） | Coding 正文按文本节点给网址加链接，经链接接管在侧栏打开 | 已写，待验证 |
| Coding 的工作区文件 / 每轮改动 | 工作区由 Files 的“工作区文件”来源列出；每轮固定变更经 Artifacts 来源列出（D17）；Coding 的“文件”面保留（Git 提交流程依赖它） | 已写 |
| 助理的材料、成果、待发图片 | 会话 [3c6203] 在面板里发 `molis:side-open`（插件对象或自带预览），侧栏处理即 `preventDefault`，否则原处打开 | 约定已定，对方实现 |
| 交还浏览器后接着跑 | [3c6203] 在 island 听 `molis:side-browser-control` handback，用现有 send 发一句继续 | 约定已定，对方实现 |
| 装着文件的插件 | 文件来源：Files、Pages、Artifacts、Images（生成的图片，原图预览）、Dataset（CSV，表格预览）、PPT（大纲）、Cognia（个人资料，按路径分文件夹）、Shelf（材料与结果，原文件预览） | 已写，待验证 |
| 项目讨论的旧浮窗 `discussion-split.ts` | 并入侧栏后删除 | 已删 |
| `packages/im-ui/src/host.ts`（旧侧栏/全屏宿主兼容导出，无调用方） | 删除并更新 README | 已删 |
| craft-finish 里的 `.dock-window` 样式（只给旧群聊浮窗用） | 属会话 [3c6203] 负责的层，发清单请其删除 | 待对方 |

## 5. 验收（对应目标）

| # | 验收 | 目标 |
| --- | --- | --- |
| AC01 | 从右下角打开侧栏，在讨论、浏览器、文件间切换；各自状态保留；收起再开恢复 | 1 |
| AC02 | 左侧真实让出宽度；拖动/键盘调宽；窄屏上下分屏；无遮罩无全屏 | 1 |
| AC03 | 助理开始浏览、对话里点文件、插件请求时侧栏自动打开对应标签；不改路由不抢焦点；Escape 与收起一致 | 2 |
| AC04 | 侧栏浏览器输入网址、前进后退刷新、点击输入（含中文输入法）；地址与网站身份始终可见 | 3 |
| AC05 | 在侧栏浏览器登录并使用一个真实网站；说明登录状态与本机浏览器分开 | 3 |
| AC06 | 打不开、被拒、崩溃、没有 Chrome 时都有看得懂的状态与恢复办法 | 3 |
| AC07 | 助理在侧栏浏览器完成多步任务，提交前停下等确认；用户中途接手再交回 | 4 |
| AC08 | 允许一次 / 这个网站以后不问 / 禁止（连看都不行）都生效且可撤销；上传必确认并显示文件；敏感路径拒绝 | 4 |
| AC09 | 页面跳走或换站后旧观察不能用来点击（驱动次数为零） | 4 |
| AC10 | 截图交给模型前已遮蔽密码类字段；没有遮蔽标记的截图被拒 | 4 |
| AC11 | 把当前页面或选区交给助理，材料带来源与时间，被助理引用 | 5 |
| AC12 | 从助理对话打开 PDF、图片、成果预览，并跳到所属插件；失效附件如实标出 | 6 |
| AC13 | 文件标签列出 Files、Coding、Pages、Artifacts 的文件，预览并跳回插件；无文件的插件不出现；项目边界不变 | 7 |
| AC14 | 一个新插件只靠声明加入文件来源和侧栏视图；停用后撤下 | 8 |
| AC15 | `surface:browser` 声明在安装摘要里可见；带路径/查询串的声明被拒；手册与自动检查到位 | 8 |
| AC16 | 能力对照表如实更新（surfaces、sources）；SDK 只有一条谱系 | 9 |
| AC17 | 明暗、键盘、读屏、中文输入法、1440/1024/800/390、长内容与异常状态；减少动态；讨论不退化 | 10 |

工程通过、真实场景通过、用户本人验收分开记录（第 7 节）。

## 6. 协作

- 助理会话（`feature/system-assistant`、`~/code/goalboard-assistant`、4240/4241）：不进其工作树；agent-host 的助理规则与 assistant 服务新接口由它改，本任务先发清单。
- 会话 [3c6203]（助理面板改版）：不动底栏中间列与 `.assistant-*`；它在面板里调用 `molis:side-open`。
- 预览用本任务自己的端口（4290 起）与 scratchpad 里的隔离 Home；不拷贝别的会话的 Home。

## 7. 进度与证据

2026-09-30 现状：经 molis-ai/molis-work#118 合入 main（d38e6099）。SDK 来源已经 molis-ai/prologue#3 合入 prologue main（89ef145f）。工程与真实场景通过，浏览器全量回归见 7.1。用户本人验收未开始，按用户决定在正式版里做。

### 7.1 工程通过（自动测试）

- `tests/side-panel-platform.test.ts`：
  - 文件来源协议的形状与分页；`side` 槽随插件启用与停用出现、撤下；
  - 地址栏只收网页地址；
  - 真 Host 上文件标签经动作目录列出、预览，新插件只靠声明加入，停用后撤下，项目边界不串；
  - 个人插件（灵光）的侧栏文档能渲染，缺失视图回一句 HTML；
  - `surface:browser` 声明只收完整来源，CLI 输出 `browser_sites`。
- `tests/side-panel-browser.e2e.test.ts`（真 Chrome）：
  - 查看、点击、输入、弹窗叠层、页面对话框、禁止本机地址与非网页协议；
  - 空白页可看；标签按 `<label>` 读名称；
  - 接手后旧观察作废；macOS 上 Control+a 可选中；
  - 截图遮蔽且按 CSS 像素；
  - 2x 出帧（新加）；正常关闭和宿主停掉后留下的浏览器都保住登录 Cookie（新加）。
  - 全部通过（新加的两条先在时段 S9 跑过，S14 全量里再跑一次）。
- `tests/side-panel-assistant-surface.test.ts`（真适配器 + 助理服务）：
  - 空白页看 → 问 → 批 → 开 → 问 → 批 → 点；
  - 允许过的网站不问；离开空白页照问；禁止的网站连看都不看；
  - 启动前允许过的网站，撤销后当场要问。
- Prologue SDK（`9fc3b173`）：app-mode-surfaces（含 Character 绑定、空白页）、ui-control、plugin-manifest、computer-use，以及记忆的 5 个文件，全过。
- 其他：assistant-delegation（子工作带 `browser:false`）、announce-guard（浏览器动作）、soft-workbench-refinement 设计门禁，全过。
- 构建：`pnpm build`、`boundary:check`、`typecheck:all` 通过（合 main 后）。
- 非浏览器全量（2026-09-30，合 110ef251 后）：580 个文件，3290 个用例通过。失败只有两条，都在 main 上同样失败，不是本分支引入：
  - `plugin-global-settings` 的 Shelf 设置断言：设置页不再输出 isolation_fact，本分支没改那个页面；
  - `pages-draft-race`：只加载 Pages 的 client.ts，本分支与 main 的 client.ts 和测试逐字相同。
  另有 `pages-mcp` 在满负载下超时一次，单独重跑 15 秒通过。
- 合入 main 722dcd31（含 #113、#114）后：受影响的 93 个非浏览器文件 673 通过，失败同上两条。之后再合 8c73de02、42b0919c：受影响的测试全部通过；上面两条既有失败已由 #117 修好。
- 浏览器全量（时段 S14，本分支 9e6b25a8 对照基线 42b0919c，两边都整体构建）：共 104 个文件（102 个 e2e，加 `web.test.ts`、`functions-draft-retention.test.ts`），真 Chrome，并发 1。**没有新增失败。**
  - 全量 231 条用例里 217 通过、10 失败。当时机器上另有一次未安排的整体构建，负载 15–26。
  - 10 个失败文件逐个单跑：6 个通过（其中 `project-user-journey` 是和基线成对再跑时两边都通过）。
  - 剩下 4 条在基线上以同样的用例、同样的报错失败，是 main 原有的问题，已交合并协调：
    - `plugin-event-recovery`：等插件事件列表超时；
    - `plugin-sample`：离线 npm 缺 `molis-work-kernel`；
    - `shelf-dropagent-parity`：`shelf.no_model`；
    - `workbench-pane-feed`「opening a related Goal inside a pane」：等两个可见窗格 iframe 超时。
  - 证据见 molis-ai/molis-work#118 的评论。

### 7.2 真实场景通过（预览 4292、隔离 Home、MiniMax-M3、真实网站）

| 验收 | 结果 |
| --- | --- |
| AC01、AC02 | 1440/1024/800 工作区让出宽度，与侧栏间隔 8px，无横向滚动；390 为底部面板；分隔条可拖动，也能用方向键调宽，宽度记住。状态保留：在讨论里写草稿 → 切到文件打开 README.md → 切到浏览器（example.org）→ 收起 → 从底栏再打开，回到浏览器同一页；文件标签仍是 README.md；讨论草稿还在（同一个框架，未重载） |
| AC03 | 助理开始浏览、请求确认时侧栏自动切到浏览器；按上下文打开不改路由（地址与历史长度不变）、不抢焦点；底栏按钮打开时焦点进入当前标签；Esc 关闭后焦点回到按钮 |
| AC04 | 地址栏、前进后退、点击、中文输入（必应搜索框）可用；站点身份常显。系统输入法的组字过程没法用工具真测，走组字事件转发。本地网页模式实测；桌面壳用 `?desktop=1` 渲染（带标题栏拖动区）实测侧栏浏览器可用，真正的桌面应用（Tauri 窗口）没有启动测 |
| AC05 | 登录状态与本机浏览器分开，封面上写明。持久 Cookie 经得住重启；被整组强停时，最近约 30 秒内设的会丢（Chrome 定时写盘），正常退出不丢。**在真实网站上登录要用户本人做**（不代输密码） |
| AC06 | 本机地址被拒、非网页协议被拒、没有 Chrome、打不开：e2e 覆盖；真实场景只见过加载慢 |
| AC07 | 真实多步：在 the-internet.herokuapp.com 登录页只填用户名，没填密码、没提交；中途接手，自己输入，交还；助理重新查看后先选中再替换，旧的「输入 tomsmith」没有执行 |
| AC08 | 「允许这一次」「这个网站以后不用问」「禁止」都生效：禁止的网站连看都被拒。撤销与恢复当场生效（D22）。上传必问并显示本机路径，允许过的网站也问；选「不允许」没传 |
| AC09 | 接手后旧观察作废（真实）；换页后旧观察不点（SDK 测试） |
| AC10 | 遮蔽与拒收未遮蔽截图：只有工程证据，真实会话里模型用的是可访问树 |
| AC11 | 「交给助理」→ 底栏建议 → 放进输入框 → 助理回答并写明「依据页面……取得时间……来自侧栏浏览器」 |
| AC12 | 真实模型走通三类：<br>• 助理用 Pages 建的「侧栏成果」：从对话点开，侧栏里显示 Markdown，「在插件中打开」跳到 Pages 那篇文档。<br>• 附上的图片：点开在侧栏显示原图（320×180）；重启后同一张标「（已失效）」，悬停说明原因和补救（重新添加）。<br>• 附上的 PDF：点开显示读出的正文，原件不保留，这一点如实说明。<br>• 交给助理的网页：点开显示原样材料，「原页面」链接回到侧栏浏览器。 |
| AC13 | 项目工作目录指向一个真实文件夹（README.md、data.csv、docs/chart.png、docs/report.pdf）：<br>• 文件标签列出这些文件，以及 Pages 文档、置物架材料；<br>• CSV 显示为表格，PNG 显示原图，PDF 在侧栏的 PDF 查看器里；<br>• 「在插件中打开」把 README.md 在 Files 里打开。<br>Coding 用的就是这同一个工作目录（Files 页写明「Coding 会话在哪个目录工作，这里就显示哪个」），Coding 没有另一份文件来源。 |
| AC14 | 真实操作：在项目里拿掉 Pages 和灵光后，侧栏没有灵光标签，文件标签不列 Pages，/side 路由 404；加回后都恢复（与页面共用一份可显示插件表）。灵光侧栏标签可以记下并保存一条灵光 |
| AC15 | `surface:browser` 声明、校验、市场卡片与 CLI 输出已落地；本期没有内置插件声明，市场上的显示没有真实样例 |
| AC16 | 能力对照表已更新（surfaces 已接、sources 如实记未接，见 D20）；SDK 一条谱系，是与记忆线合成的包 |
| AC17 | 已查：<br>• 明暗主题；键盘；读屏语义（region、tablist、tab 与 aria-controls、separator 带取值）；减少动态效果；讨论标签不退化。<br>• 手机宽度（390）+ 深色走了一遍主要流程：从底栏打开底部面板（焦点进当前标签，无横向滚动）；CSV 预览；助理打开 example.org，在助理面板的确认卡上允许；收起助理面板后看到侧栏浏览器和「助理正在操作 · 接手」。<br>• 手机宽度下助理面板会盖住侧栏，这时确认只能在助理面板上做（两边是同一个确认）。 |

### 7.3 用户验收

未开始。用户 2026-09-30 决定：侧栏按合并协调的原顺序走（轮到时再跑浏览器回归、开 PR，开之前先问用户），本人验收放到合入 main 之后，在正式版里做。以下每步都能在预览（`.claude/launch.json` 里的 `side-panel`，端口 4292，隔离 Home，项目「侧栏验证」）或合入后的正式版里走。每步写明看什么算通过。

1. **打开与切换（AC01–AC03）**：点底栏右侧托盘里的侧栏按钮 → 在讨论、浏览器、文件、灵光之间切换 → 收起再打开。
   通过：左侧工作区让出宽度、不被盖住；焦点在当前标签；讨论草稿、浏览器页面、打开的文件都还在；Esc 与收起按钮效果一样。
2. **登录一个真实网站（AC05，需要你本人）**：在侧栏浏览器地址栏打开一个你常用、需要登录的网站，自己登录并用一会儿；然后重启 Molis Work 再打开这个网站。
   通过：能正常登录和使用；重启后仍是登录状态；你自己的 Chrome 里不受影响（侧栏用独立的浏览器资料）。
3. **让助理动手（AC07–AC09）**：对助理说「在侧栏浏览器打开某网站，找到某个表单，填好但不要提交」。
   通过：每一步先弹确认（网站、动作、要输入的原文）；中途点「接手」后助理停下，你改动后点「交还助理」，它先重新看页面再继续；提交前停下问你。
4. **网站授权（AC08）**：在确认时选「这个网站以后不用问」，再在盾牌菜单里「撤销」或「禁止助理使用这个网站」。
   通过：允许后同一网站的点击、输入不再问（上传仍问）；撤销后立刻又问；禁止后助理连看都看不到。
5. **交给助理（AC11）**：在侧栏浏览器打开一页，点工具栏的✨，在底栏上方「放进输入框」，问它这一页讲什么。
   通过：回答里写明依据的是哪一页、什么时候取的。
6. **助理工作的文件（AC12）**：在助理对话里附一张图片和一个 PDF 发出去；再让助理用 Pages 建一篇文档。然后点对话里的附件和成果。
   通过：图片、PDF 正文、Pages 文档都在侧栏打开；「在插件中打开」跳到 Pages 那篇；重启后那张图片标「（已失效）」并说明怎么补救。
7. **插件文件（AC13、AC14）**：在项目设置 → 工作目录里关联一个真实文件夹，打开侧栏的文件标签。
   通过：能看到 Files 工作区、Pages、置物架等的文件；Markdown、CSV、图片、PDF 都能预览；从项目里移除 Pages 后它的文件不再出现，加回后恢复。
8. **窄屏和深色（AC17）**：把窗口拉窄到手机宽度并切到深色，重复第 1、3 步。
   通过：侧栏变成底部面板，没有横向滚动；确认卡能在助理面板里操作。

验收结果（逐条通过/不通过与意见）记在这一节下面。

### 7.4 已知问题与后续

- 平台范围：隐藏的插件创作台框架会让页面上新渲染的节点带上它的原型，按 `instanceof Element` 判断的委托点击被静默忽略。侧栏已改按 `nodeType` 判断（D24），根因已由 #110 修复。
- 灵光的动作行在侧栏宽度下不换行，「复制内容」被截。属插件样式，交插件复查线。
- 助理有时向业务网关传错输入类型、反复被拒（网关和模型那边），与侧栏无关。
- 测试环境：预览窗格隐藏时 `document.hidden` 为真，插件的可见性生命周期不启动（Files 不读目录等）。
  验证时在页面里把 hidden 视为假；这不是产品缺陷。
- 待办：
  - 用户本人验收（7.3），结果记在 7.3。
  - 与动态交互 P1 重叠的四处，由 #119 在合入本线后的 main 上解开冲突，并补跑了 e2e（证据在 #119）。
  - 旧的 vendored 包 `assistant-intake.tgz` 删不删，由用户决定。
