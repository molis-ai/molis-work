# 第 16 批 B/C 运行接入合同

状态：开工合同已审（2026-11-08，稿件头 `7e86b87feb`；独立 Astra/high 评审未发现 P1）。以 `7cb0bc89b5` 的实现为核对起点。[需求书](spec.md)管行为与验收，[A 段设计稿](a-section-contract.md)管文件、SDK 和展示合同，本稿补 [实施方案](implementation-plan.md) 中尚未接到产品的部分。审批与范围见 [B/C 开工前检查](bc-preflight.md)。这是实施依据，不代表合同代码、产品验证或最终公共合同合审已完成。

## B 段　一个 Home 外观主人

新服务归 `horizontal/appearance/`，由 Local Host 按实际 Home 装配，生命周期跟随该 Home 的宿主。Design System 的 `resources/`、`baseline.ts` 继续拥有随产品发布的共同规格、皮肤、字体和资源定义。服务用 SDK `/ui` 的解析和 resolver，按登记查引用，只向消费者给当前组合、可选内置项与问题。包内文件缺失或资源无效在 owner 边界显式报告。Workbench、Desktop、插件和组件板各自消费投影，平台入口经 Host 取得该 Home 的状态。

- **正式选择。** 沿实施方案 §4.2 的 `Home/interface/state.json`，B 只记皮肤的精确 `UiDefinitionRef`、字体跟随推荐或固定引用、独立等宽覆盖（无覆盖用所选方案的代码角色），以及选择修订、最近可恢复组合与本次操作需要的提交结果。定义正文和缓存由来源重建。缺文件采用内置基线；引用失效时先试已记录的有效组合，再用基线并提示。修订必须能区分先后两次选回同一组合；A 的 `UiEnvironmentSnapshot.revision` 仍标识组合和语言，不充当提交修订。新持久文件首版按 1 登记，备份和升级沿现有存储登记。
- **最近使用的语言。** [`ui-locale-memory.ts`](../../apps/local-host/src/ui-locale-memory.ts) 的文件读写、缓存和错误处理归到同一服务，保留 `config/ui-locale.json`、`schema_version: 1` 及读写时机，避免合文件引发迁移。宿主仍从用户切换成功或本人发起助理轮次更新记录，单纯开页面不写。保持 best effort 与较新版本不覆盖。平台默认语言及允许的标记由入口从平台词包描述提供，横向服务不依赖 Workbench。此记录只供无页面的工作开始时读，与各入口的 Cookie 分开。
- **其他偏好。** 明暗、密度、终端主题仍走 [现有设备偏好](../../packages/design-system/src/preferences.ts) 与 frame 的 `state`。正式皮肤选择接通时移除旧 `molis-work:skin` 的读取和写入，产品消费新 owner；托盘/药丸旧样式的去留由统筹按本批已有待决核对。语言切换本身不改变字体策略或明暗。

### 动作、权限与失败结果

以下三项是设置和应急恢复所需的缺口，公开输入输出放在现有 `platform/ui`。Local Host 在 [`project-host.ts`](../../apps/local-host/src/project-host.ts) 的平台 provider 集合登记一次，provider 拟为 `system.appearance`，范围 Home、受众 `user`。沿 [`local-owner-permissions.ts`](../../apps/local-host/src/local-owner-permissions.ts) 的按 provider 授权，Web 薄适配器绑定准确动作并收窄为读取或写入权限；原生恢复入口走同一绑定。actor、Home、会话和目标作用域来自已验证的入口，动作参数只描述要选的定义和操作。浏览器的操作请求标识与现有一次性传输键分开，传输拒绝重复请求后仍能只读核对原操作。名称经合同合审确定，动作首次按 1 登记。

| 拟新增动作 | 输入与实际结果 |
| --- | --- |
| `appearance.selection.get@1` | 无参数返回当前选择、`selection_revision` 和可呈现的内置项、问题；可按原应用 `request_id` 查本人的应用与撤销结果，用于断开恢复。首屏装配直接从同一 owner 取有效投影，渲染过程不逐页重新发现动作。 |
| `appearance.selection.apply@1` | `expected_revision`、`request_id` 及准确皮肤/字体策略/等宽引用，或选择「恢复内置外观」。后者选回 Soft Workbench、系统字体及基线等宽，保留语言和设备偏好。输出 `request_id`、`selection_revision` 与已提交选择。样张不调用写动作。 |
| `appearance.selection.undo@1` | `expected_revision` 和 `applied_request_id` 均从原 apply 结果取得，可直接沿用动作的 `undo` 声明。撤销以原应用标识为幂等键。当前修订仍是原应用提交的修订、原组合重验可用时才恢复；结果含同一标识与新修订。 |

按动作服务的信号、会话权限和 `beforeEffect()` 执行。资源准备在提交外做；等外部服务的动作沿用 `scheduling: "concurrent"`，本批内置选择只核随包定义与资源，验证依据绑定准确版本。提交点重新核对授权、取消和 owner 生存期，在无 `await` 的短段读取正式记录，先认同一 actor、动作、原 `request_id` 及等价输入的已提交结果，再比 `expected_revision`。同键不同输入拒绝，两次并发从同一修订提交时只有一次写成功。状态与回执用 Storage 已有的版本文件写前拒绝与原子写能力一次提交，成功后才通知。`atomicWriteFileSync` 可能在 rename 后抛错，须按原请求回读，区分已提交、未提交和无法确认，不能把异常直接解释为未写入。较新、待升级或不可读的文件不因恢复按钮被覆盖，窗口仍可显示固定内置组合并如实报告保存受阻。取消、撤权或宿主停用发生在提交前时没有业务写入或广播；提交后断开则用原请求查回结果，重启后亦然。

### 首屏、方案 C 与多窗口

- Host 给渲染器注入 A §4.4 的 `UiEnvironmentSnapshot` 和准确样式引用，保持快照轻量。Soft Workbench 由现有基础 CSS 首绘；其他获准内置组合首绘前装载经登记的准确版本样式，按需取字体资源。既有引导读设备偏好，服务端不猜浏览器 localStorage。用同一解析结果更新 `html` 与 `body` 对应作用域并去掉遮盖它的重复令牌层。可观察加载、实际字体/字重、缺字及后备；文件准备失败保留可用外观。
- [方案 C](../../docs/design/appearance-selection/README.md) 已确认。把 `look-card`、`look-proof`、`look-fade` 从 Design System 的 `catalog-appearance` 标本提成组件板与产品共用的实件，产品接 [`settings-appearance.ts`](../../apps/workbench/src/settings-appearance.ts) 及现有设置目录。卡片选候选，样张在自己作用域准备外观，窄屏用 Sheet；「用上」才提交。在用状态、加载、失败和冲突在原位可见。明确固定字体换肤时保留，用户可选改用推荐；等宽独立。另一窗口有新修订时保留候选和样张，显示新正式选择，「仍然用上」以用户看到的新修订重新提交。恢复入口用固定内置投影，可从设置外或 Mac 菜单进入，经同一 apply/undo；不要依赖可能失效的当前样式。淡入沿标本的动效变量与减少动态效果规则，变更提交与反馈不等待动画。
- 当前只有账号等专用事件流，没有可直接复用的外观 SSE。复用现有同源、当前 Home 会话及关闭/退订做法，增加每个文档至多一个 Home 外观失效订阅（拟 `GET /api/ui/appearance/events`），消息仅携带 `selection_revision`。发起者直接消费提交结果，其余文档失效后合并重读一次；重新连接或从隐藏恢复时以当前 owner 投影为准，切 Home 释放旧连接。每个文档独立准备并更新展示，未能应用的保留最后可用组合、显示原因并原地重试。文档重试只读 Home。无需全窗确认、持久事件表或轮询。文档更新成功后才登记/发 `molis-work:ui-environment-changed`，载荷为当前快照修订和实际改变的维度，首个监听者用来重测终端，不重启会话。B 先用既有绑定端口发 `environment` 的快照/样式部分，C 再接词包和双份文档。

B 先用真实工作台、Issues 侧栏的现有插件 frame 与 Builder 候选板走通外观链。用户 2026-11-08 已确认本会话展示的真实隔离工作台视觉与交互定样，按此方向继续；工程、资源与尚未实操的入口仍分别验收，不将该确认计作 C 段或整批完成。B 的文字仍走现有入口。组件元数据从 `PLUGIN_COMPONENTS` 搬到共同规格，由真实实现提供 kind 绑定，标准板和 Builder 用同一个投影。Folio 正式视觉沿 2026-11-08 确认的「杏纸与常青」（grove）。定样指导实现，真实工作台的浅深色和交互仍按 FSS-02/17 验收。Resource Han Rounded v1.910、Nunito 的生产裁法、实际加载与资源增长许可另取证。

### B2 实施接力

独立 Astra/high 评审核对了 `228dd32993` 的 B2 接入约定，未发现 Blocker、P1 或 P2。

- **共同规格与组件绑定（FSS-05、26）。** `UiSpecFile.components` 收现有 `PLUGIN_COMPONENTS` 的 `kind`、`catalog`、`name`、`description`、`group`、`use`、`intents`、`data`、`icon`。名称和说明用 `TextRef`，B 以现有中文原文和 `L` 展示，C 在统一切换窗口迁稳定键。SDK 解析时拒绝重复 kind、未知字段、非法枚举和引用。Design System 以组件板的真实标本及生成页的实现核对 kind，保留代码里的渲染与合法操作绑定。标准板索引和 Builder 候选板消费同一份元数据投影，组件的状态和变体由对应标本展示。按 [A §3.3](a-section-contract.md)，这一阶段规格文件沿用 `format_version: 1`。
- **可用的文字角色（FSS-01、16–18）。** `UiFontRole` 加 `size_px` 与无量纲 `line_height`，均为有限数值，范围分别为 10–64 和 1–3。规格在 `UiFontRoleSpec.tokens` 声明 `size` 与 `line_height` 的令牌，补 `reading` 与 `note`，与 `body`、`control`、`title`、`display`、`code` 一起由 SDK 解析。基线为各角色给出尺寸、行高、真实字重与字距的有效值，其他方案缺项从同一基线补。比例角色可单列字族，省略时沿本方案正文的字族，代码始终用等宽。Design System `typeface` 和共有控件消费正文、控件、标题与说明角色，Workbench 阅读面和样张消费 `reading`，代码、Diff 和终端消费独立的 `code` 角色。选择 Menlo 只替换等宽角色，系统字族不可用时用声明的后备。原控件最小高度、触控下限和内容显式格式仍由各自规则约束。
- **同一份已校验外观（FSS-02、07、20、23）。** Owner 在现有有效选择解析里带出准确的 `resolvedSkin`、`font` 和 `mono`，含回退结果，复用 SDK 的 `resolveSkin`、`resolveFontScheme`、`resolveUiEnvironment` 和令牌、face 输出。Host 从本次请求的语言和一次有效投影拿快照与准确样式引用，页面只合并设备状态。用于首屏的选中投影由 owner 在正式选择变化时失效。候选和已提交回执可从同一批已校验内置定义取得对应投影。页面、候选样张和 frame 共用这份资源解析，CSS 从登记定义生成。换用前准备实际需要的 face，启动时先用声明的后备字体等待资源加载。Soft Workbench 默认打开时不请求 Folio 字体。
- **同一文档和 Home 的失效流（FSS-08、20、28）。** 浏览器以现有页面证明走同源 `molisWorkRequest` 的 `GET` 原始响应，和 [`plugin-frame/events.ts`](../../apps/workbench/src/browser/plugin-frame/events.ts) 共用 SSE 解析。Host 核对当前 Home 的原会话和页面证明，经共享插件页权限守卫拒绝来自插件或上下文页的调用，再订阅已装配的 owner。流只发 `selection_revision`，初连据此补齐首绘与订阅之间的变化。断开、撤权、切 Home、关服或文档离开时解除旧订阅。暂时断线重连和隐藏恢复都用原页面证明，重读合并为一次，旧页面遇到换 Home 或会话失效即停。写回执与流消息交错时，发起者直接使用回执并消化本次修订，其他文档合并重读，晚到准备结果随修订作废。
- **中断后核对回执（FSS-14、27）。** 文档保留原操作标识和输入。顶层页面离开时用本窗口的 `sessionStorage` 交接，绑定页面证明中的公开 `viewScope`，供同一范围的后继页面一次取用。账号守卫仍能丢弃缓存页或切换空间。后继页面先只读核对原回执，再开放提交和撤销。查不到回执时，用这次回执读取所在的修订判断是否已前进。若仍未知，用户可显式继续原操作，保留领域标识与原输入，每次 HTTP 尝试取新的传输一次性键。
- **应急恢复（FSS-32）。** 设置外的工作台入口与 Mac 菜单打开同一个使用固定 Soft Workbench 投影的恢复 Dialog。Mac 沿现有可信主 WebView 桥触发打开，核对目标窗口和本机 Origin，主文档及草稿原地保留。用户在 Dialog 内确认后走同一 `appearance.selection.apply@1` 的 `restore`，仍按回执支持撤销和断开后核对。Dialog 采用独立的基线作用域、常规焦点与 Escape 规则，操作反馈区分正式保存和本窗更新，语言和设备偏好沿原入口读取。

## C 段　一次更换运行中的文字入口

### 主人、批量加载和安装

1. 平台词包继续从 Design System 的资源登记发现，由 [`ui-text-provider.ts`](../../apps/local-host/src/ui-text-provider.ts) 使用 Runtime 的 `pluginLocaleReader`。开发插件沿 `development-loader.ts` 和既有 `localePacks` 端口。内置包从 Runtime 登记定位其包目录，声明 `ui.locales` 和发布文件；创作台与 Alchemist 仅沿已经批准的装配例外取包。已装包从签名覆盖的 `payload.files` 读取。恢复出来的 `data:` 代码不自行寻文件。Studio/CLI 打包、安装白名单与运行绑定复用 A §6.2–6.3 的路径检查、`assertPluginLocales` 和 `pluginLocaleFilePaths`；`platform/plugin-sandbox` 的现行 `contract.json` 声明接已有的 locale 形状，由 `sandbox-manifest.ts` 投影到 Manifest；`sandbox-package.ts`、`pack-sandbox.ts` 和 Studio 的 `studio-release.ts` 核对同一套声明文件。旧字段与旧发布物的处置按开工前检查，不建运行双读。
2. 复用 [`plugin-text.ts`](../../apps/workbench/src/plugin-text.ts) 的登记、释放及 `t`／`say` 规则。基点的读表按进程 owner 取最近登记，C 改为准确来源：插件自己的调用绑定 Runtime 原 activation 对象，不能仅靠可在复制 Home 中重复的安装 ID 与代次；平台代画插件对象时，由宿主沿可信目录或挂载选择对象提供方的 reader，不能拿当前调用者的 reader 代替；无 Runtime activation 的内容包，沿当前 Home 已启用的发布记录选择其已验证包。`OwnedTextRef` 保持现有 owner/键形状，来源由宿主补齐，不接受浏览器或引用自报的身份。来源失效或缺键用既有 fallback，绝不去另一个 Home、版本或发布者的同名词表找。平台内置词表可共享，同页同准确来源的 owner/locale 只读一次。停止、卸载、换版本撤回原绑定，版本/签名变化作废相关缓存。沙箱和内容包只按完整 `plugin_id` 进 `say`；同进程可运行 `t` 的作者继续受前缀检查。词包只能提供自己的词；`common.*` 由平台投影。沙箱进程经现有受信启动数据取得本安装的文本上下文，调用时从 host/broker 已验证的范围取语言。
3. 默认用 A §4.4 的独立 Workbench 启动词资源和可缓存准确版本。宿主页面按当前已准入的挂载集合批量读本页所需 owner 与 locale，计划用一个同源批量读入口（拟 `GET /api/ui/locales`），复用原工作台文档证明、项目/页面及挂载许可，参数中的 owner 仅作选择范围。Host 先据该文档实际获准的准确挂载和运行来源求交，核对版本和当前生存期后才返回所需包与公开共有词；同屏同名挂载分别关联来源，只对相同来源与语言去重。父文档一次准备供本屏挂载共享，按需开启的新一组挂载再批取，frame 不发请求。Issues 隐藏文档计入首屏。Goals 的同步词先从真实首屏查出使用者：工作台拥有的句子归工作台，Goals 自己的句子从其准确词包同步准备；最终下发范围以实测和预算批准确定，避免整包复制到工作台词表。动态资源路由、清单及增量见待决。

### 请求语言与可信 frame

- `WebLocale`、`WEB_LOCALES` 和现有 `ActionLocale` 改由通过校验的平台语言描述导出或验证，先覆盖已定中英；不另加动作业务入参。页面解析 Cookie 的明确语言或「跟随系统」，再用已登记语言匹配浏览器偏好，显示实际语言及后备。预览/双渲染只用同源、只读的请求级语言覆盖（拟 `x-molis-work-ui-locale`），不写 Cookie 或最近语言，也不改变 action scope、安装和权限。正常写偏好拟走 `POST /api/ui/locale`，接现行同源、会话、控制证明和一次性键防护（当前变更守卫只覆盖 `/api/` 等受保护路径）。它兑现入口 Cookie，无需另设系统动作。无 JS 的 `GET /locale` 仍走安全站内回跳，跨站不得更新最近语言。
- [`local-web-actions.ts`](../../apps/local-host/src/local-web-actions.ts) 已给本机调用注入 `ActionCallContext.locale`。从仍存活的请求或可信页面调用取得，继承到嵌套调用、frame 转发和实际 handler；异步延续不得借已经结束的页面语言。[动作网关](../../apps/local-host/src/action-gateway-http.ts) 先验 Home、身份、实例和授权，无页面调用再从同一 owner 读取一次最近语言并进入 `runBackgroundWork`。不增加网关请求体的 locale 字段。定时/恢复/插件后台入口用同一个范围接点，结束即失效；错误路径沿 SDK 缺上下文规则，保留原错误码。Agent 仍由 `AgentStartAuthority.reply_language` 冻结本轮语言，切换界面只影响下一轮；工具输入和插件不能替代平台决定。
- [frame 的既有协议](../../apps/workbench/src/browser/plugin-frame/types.ts) 实际需换 `FrameConfig.messages` 为 `environment` 和有界的 `text`（本 owner、所需包与 `common.*`）；`FrameDown` 加 A §4.5 的 `environment` 更新（快照、需要的文字包/旧新文档、准确样式引用）。首连由宿主生成的 srcdoc 引导脚本携本次一次性挂载凭据发起握手并持有端口；父端核对当前窗口、凭据及挂载仍有效后，才沿这个端口下发本来源词包。`onload` 与 `contentWindow` 不能独自证明接收文档，导航前后的 `WindowProxy` 可以相同。子端只接收父窗口的首个有效连接，从宿主生成的 srcdoc 确定预期 Origin，再比对事件来源。其后的消息只走既有 `MessagePort`，受当前挂载、安装代次、版本、可见性及释放规则限制。父端从当前授权构造包与链接，子端先装 SDK 上下文再载入插件脚本。保持 `connect-src 'none'` 和样式/字体路径限制，首连前导航、异源窗口、越权 owner、失效端口及撤权后的晚到更新有拒绝证据。设备状态沿原 `state`；C 一次删 `host.translate`、`L`/LF/LFor 与聚合词表。

FSS-60、69 的 C 接入验证额外覆盖：两个 Home 的同名插件使用不同版本，其中一版缺键仍不能串词；内层调用已结束但外层请求仍存活时，内层遗留工作不能借到外层语言；后台 job 在发起页面仍存活时开始，也从自己的 Home 读取最近语言。FSS-08、20 的端口验证包括首连前导航、撤权后迟到响应和同屏同名挂载，不只断言消息字段或窗口相等。

### 无刷新切换及重试

沿 A §5.4 和现成 [`createLocaleSwitch`／`mergeLocaleText`](../../apps/workbench/src/browser/locale-switch.ts)，让工作台、到达/项目选择、设置、规格板、Builder、侧栏、浮层、插件和胶囊调用同一个切换控制器。真正提交前，把同一入口的旧/新语言渲染及所需词包、frame 投影都准备好。两份表示 GET 要走同一只读数据与渲染路径，核对具体入口没有写入副作用；带状态的启动 GET 先隔开初始化。双渲染差异中无法确认的业务变化留给原有业务更新，不能当作翻译覆写。复用既有文本/属性序列合并与产出记录，保持节点、表单值、编辑区、焦点、选区、滚动和终端；一次成功后发已有的 `molis-work:select-item { invalidate: true }` 让实际支持的视图重取。日期、完整句参数、CSS 里的界面字及客户端绘制路径要改到真实消费者。

每文档只允许最新目标进入提交。一项准备失败或被取消时保留当前 Cookie、文本上下文和页面，提供原位重试。发出偏好写后先判定实际是否保存；断开时读回入口实际偏好。同步合并阶段先算并核对可写差异，文档/上下文作为一次更新，不能出现合并异常后上下文退回、已写节点留下半页新语言。若偏好已保存而本窗口更新失败，展示仍用最后可用版本，告知这一步并重取该窗口，不盲改同源窗口的选择。成功后同源通知只提示重读 Cookie；旧包、旧渲染和旧 frame 结果不得盖回新语言。迟到的业务结果保留原事实和回执，有结构化文字引用的状态在当前语言重算，`lang/dir` 与有效上下文一起更新；旧语言 HTML 片段只可通过已声明的只读路径重取，绝不重发业务写入。真界面字留旧语言、译错或半页混合交回统筹，用户已接受的同字误换仅限需求 §6 的临时显示情形。

Desktop 主 WebView、胶囊及原生菜单沿现有可信桥，替换 [`sync_capsule_locale`](../../apps/desktop/adapters/tauri/src/main.rs) 中语言切换重导航。IPC 只传当前受信窗口提交后的有限原生标签/状态投影及版本，继续校验窗口、Home 和生命周期；启动时需用的最小文案由同一平台词包生成，Rust 不再另写中英文表。将 WebView 无刷新证据与原生启动、菜单和恢复入口的实际证据分开。

调用数按 A §11 的 N42–N56 口径重测。首屏只读一次准备好的外观投影，主题外的字节按已用资源入账；皮肤提交一次，同窗口直接用结果。切语言每个同源文档两次表示 GET，工作台新词一次、本页插件词一次批取、入口偏好一次写，frame 无自发网络请求。目录/授权沿各入口已有路径完成，不随词条和挂载个数反复发现或开库。

## 实施接力与验收边界

首屏前置与 B2 真实外观切片已进入本批集成树。用户已确认视觉、交互及预算 §6.6 的具体资源增长，B2 定向工程验证和独立限定复核通过，现进入 C。原生菜单实际操作与全入口综合验证仍在本批最终验收范围中，不以 B2 工程证据代替。一个写手顺次提交子分支，最终只开第 16 批一个 PR。下表各行是各片的验收范围。

| 顺序与主要文件主人 | 交给下一片的结果 | 原 FSS 编号与证据边界 |
| --- | --- | --- |
| **B1 外观 owner**。新横向包、Host 组合根和本机 action/权限薄接线，合同 `platform/ui` | 先做只读内置定义/快照、最近语言移归和调用点；合同审过后接持久提交、撤销、断开重查。登记包边界、唯一版本表、Home 数据、存储和实际 API/动作快照，验证拒绝路径。 | FSS-01、14、19、24、27、32 的 owner 部分，验证隔离 Home 中的选择、拒绝、竞争、重启和回执。组件视觉、助理、自定义和真实 Home 另取证。 |
| **B2 真实设置切片**。Design System 组件与样式、Workbench 设置/首绘/控制器、Local Host 的投影资源和失效；Desktop 恢复入口 | 复用实件落方案 C，真实工作台和一个现有插件接外观，标准板与 Builder 候选板同源。按已定的 Folio 杏纸与常青实现；裁法实测及资源批准后接真实字体。三个宽度、两种语言、深浅色、键盘、减少动态效果、多窗口、失败/恢复；本人看真实界面后关闭 B 验收。 | FSS-01–03、05、07–08、12、16–18、20、23–24、26–28、32–33 的内置手动外观部分；FSS-66–68 是标本依据。覆盖 B 的内置真实切片，不代表全部插件、正式发行或 FSS-04 的导入。 |
| **C1 主人和接点**。SDK Manifest、Runtime 词包、Host scope/网关与安装签名链、Workbench frame/加载器 | 在 C 子分支先备准确 owner 绑定、词包加载、端口和切换准备。已批准的等强门禁替换与声明、生产消费者合在 C2 同次启用。 | FSS-08–09、20、34、37、60、69–70 对应的真实注册、授权、隔离和释放。沿 FSS-52–53 的合法形状和拒绝用例；其中 A 的沙箱暂拒与内置暂缓按获批的 C 门禁替换。生产页面原地切换由 C2 证明。 |
| **C2 入口与内容切换**。Workbench 与现存插件各管文案/业务，Desktop 管桥，Studio/CLI 管生成、文档及签名接点 | 依同一切换窗口迁移稳定键、目录/状态、脚手架、Builder 挂载章节及获批内容，助理记录由其 owner 按现行 v1 结构接入，不升版本、不做迁移。一次启用并删旧路。跑真实四个首屏及受影响入口，检查旧响应、终端、窄屏、原文、SDK 两包真实作者路径与 Studio 回放；最终头重做首屏预算和防漏报告。 | FSS-06–10、17–18、20、29–30、33–39、71–72、74。FSS-61 只证明合并基本盘，FSS-BG-01–05 只证明资源账和采样。FSS-38 的原文保真及恢复以现行非空隔离 Home 验收。真实模型、本人视觉、已签名发布物转换单列，FSS-40/41 仍暂不实施。 |

可先独立完成的准备是 B1 的只读投影和最近语言接线，以及 C 的调用点、词包、动态请求和签名包范围盘点。C 的生产切换要等 B 验收及 C 所需红线授权。最终验证按包 README 和 [并行开发规则](../../docs/system/PARALLEL-DEVELOPMENT.md) 汇总，工程通过、最终产物实操与本人验收分别记录。

## 已批变更与待决边界

- **用户已定。** 助理通知和跟进记录沿 [开工前检查](bc-preflight.md#助理通知与跟进记录) 改为结构化文字引用；用户 2026-11-09 明确版本不升、其他照常、不考虑迁移，因此助理库保持 v1，不增加升级段，取消原 1→2 与随后拟议 2→3。用户内容、第三方错误和原始回执完整保留，不截断或猜译；以现行非空隔离 Home 验证显示、语言切换、重启及去重，真实 Home 不操作。内容版本仍仅限 [内容版本候选](bc-content-scope.md) 中实际发生版本化内容变化的条目从 1 升到 2，连同日常版本检查与 C 翻译/分期门禁的等强替换随本批唯一 PR；不将本次助理库决定扩大为其他条目的重置。
- **合同补齐。** 日期的可选 `time_zone` 在阶段一现行接口内补齐，按 [开工前检查](bc-preflight.md#日期时区合同) 统一校验与格式化，调度语义沿用现行规则。新动作和外观状态文件经合同合审后按首版 1 登记，沿唯一版本表、存储登记、API/动作快照和拒绝测试验证。
- **待决。** 共同规格、语言文件等已有格式确需改版或确需放宽门禁时，列出具体差异和理由交用户决定。本次 B 补齐随包组件描述、字体字号/行高及 reading/note 角色，沿 [A 设计 §3.3、§3.4](a-section-contract.md)，定义尚未进入 Home，保留现行 `format.ui.spec` 与 `format.ui.font` 的 1；D 段受管定义入 Home 后才按 A 稿的持久化接点进入版本文件升级链，不将此范围扩成持久文件免升版的通则。最近语言移归使用现行格式。已签名旧发布物仅可提出原发布 owner 可审的候选；转换、发布与真实 Home 维护须另行授权。
- **资源决定。** B2 的字体和外观资源已按 [预算 §6.5、§6.6](resource-budget.md) 获用户批准，许可只覆盖列明的逐资源和默认页面净增。C 的新增启动词资源及动态路由仍按类给实际冷/热、逐资源和浏览器开销。现有资产发现只识别已支持的路由形式；新动态 `/assets/` 如需修改识别规则，与首屏清单增量和用户许可一并审，不能靠改地址躲过原检查。
- 本批范围为内置定义的选择、预览、应用、撤销和恢复，以及现有入口接入。自定义库、编辑/导入/导出、外观制作 Skill 和助理创建/应用流程随 D/E；此稿不引入其草稿、证书、任务或迁移机制。
