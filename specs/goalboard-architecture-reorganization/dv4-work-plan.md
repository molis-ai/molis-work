# DV4 安装、供应链与开发文档迁移

accepted Goal goal-reorg-dv4 revision 1。唯一结果：按新包结构可复现地安装、升级、回滚、卸载和验证来源；保留实际用户数据与 Runtime 配置。

## 2026-09-06 已授权的桌面实测

用户已明确同意临时暂停现用 4173，用隔离数据测试后恢复原服务。本次只暂停原受管服务，不更新用户安装、不改 Runtime 配置或用户项目；原 plist 与服务收据保持原样。先重新构建当前源码的 App/DMG，通过原安装脚本复制到新临时目录，再以独立 MOLIS_WORK_HOME 启动实际 App。核对首次安装、真实窗口/设置、退出重开和断线恢复；测试服务使用临时 Home 旁的 plist，但占用相同 LaunchAgent label，因此必须顺序进行。结束或故障时先退出测试 App、移除测试服务，再用原启动器恢复服务并验证健康及原配置不变。未完成的 GUI、升级或全产品验收明确保留，不用局部测试替代。

## 当前证据与范围

### 2026-09-06 顶部兼容修复后的文档核对

实际工作台标题栏修复见 `../native-titlebar-alignment/spec.md`，已完成真实窗口/全屏、收起/展开及页面跳转验证。继续 DV4 文档验收时发现中英文开发指南在前文正确说明 Local Host owner，但“项目结构”仍列已删除的 `src/install/`。修正该目录图为唯一 installer owner 与两个 App-owned tooling 位置，不保留两套互相矛盾的开发指引。历史分阶段记录不作为当前全部验收结论，后续三条件报告需要归一当前证据。

完整产物盘点发现：`modules/governance-collaboration/dist/proposal-submission-store.js` 对应源码已删除，但工作区旧编译文件未清，当前正式 npm archive仍包含该JS及声明。这是已经发生的迁移发布遗漏，不是未来防御要求。`pnpm build` 只清root dist，workspace tsc不会删除旧输出。最小完整修复为让既有 `build:migrated-packages` 调用已存在的 `workspace:build`（先workspace:clean再依赖拓扑build），使根build、typecheck及两种发布流程不再依赖残留dist。各包clean只删除包内生成的dist，不删除node_modules或用户数据。验证通过真实被删除源码的旧输出作为反证，修复后新npm包不得包含它；完整构建、当前安装/分发回归和新包真实consumer链重验。不能仅手动删除这一个文件或在pack时黑名单过滤。

### 2026-09-06 实际旧包升级补验

重启和标题栏修复已通过后，继续补 DV4 的旧安装升级链。仓库保留真实 `Molis Work-0.1.13-macos-arm64.dmg`，不是伪改版本号；与当前 0.1.14 DMG 分别安装到新临时目录。先以独立 Home 启动旧 App，使用前端创建一个普通用户项目并记录可见内容，再退出旧 App、打开新 App，验证内嵌 Runtime 升级、受管服务切换、原项目与内容可见、退出重开保持。必要时通过该临时安装的正式 CLI 预览/确认普通卸载，再由新 App 重装并验证保留的项目恢复。当前真实用户 Home、Runtime 配置和 App 安装均不升级；共享 4173 只按已有授权短暂停用并恢复原服务。

这条验证只写本轮明确创建的测试项目，通过实际前端操作证明项目可用；后端检查核对安装版本、受管实例身份与持久化结果。不能把旧包比较、单元测试或安装收据单独当作完整用户旅程通过。失败时保留证据并在本 Goal 内定位，不修改产品版本或引入测试专用行为。现有生产回滚测试继续负责失败事务，不尝试把新 schema 强行降回旧 reader。

08:28 UTC 真实旧包升级复现：0.1.13→0.1.14 安装成功，PID 63873→66542，原项目仍在目录，但打开项目返回 `no such table: listener_instances`。旧项目已经记录 Feed 历史迁移 22/23/24/29，重组新增的 Listener 表只挂在这些旧迁移中，因此旧项目不会执行它；新项目测试全部先建表，漏掉该入口。FeedStore 构造已经初始化 Sources/Attention/Feed，却未初始化其恢复/游标 API 所依赖的 Listener。最小完整修复是在 Sources 初始化后调用 Listener 的公开幂等 migration，保持 DDL/旧 cursor 导入由 Listener owner 维护，不复制 SQL、不重写历史 migration、不吞掉异常。回归须覆盖已完成旧迁移的 DB、旧游标导入、重开不覆盖新游标和原 Goal/Feed 保留，并通过真实 HTTP 项目打开及重新打包 App 升级验证。

### 2026-09-06 桌面服务确认修复（用户已明确“修”）

真实 App 中诊断页重启按钮依赖 `window.confirm`，WKWebView 未呈现确认框，导致已有服务操作不能完成。本次修复属于安装/服务 caller 的兼容验收，不增加未来业务功能、不改变 Goal Contract。保留预览、明确确认/取消、过期计划拒绝、服务所有权与恢复规则。

先将此处浏览器原生 confirm 替换为现有风格的 HTML dialog，独立放入 Workbench 的服务设置脚本，不混入 Runtime 接入状态。默认聚焦取消，Escape 等同取消；执行期间禁止重复提交；预览/执行失败可读且不报成功。动态路径用 textContent 渲染。范围仅服务设置 caller、必要的 Local Host 服务执行链与定向测试/文档，不全局替换其他 confirm。

先用生产脚本定向测试确认/取消/失败/重复点击，再构建实际 App，隔离 Home 验证取消不改变服务 PID、确认后真实 PID 切换且受管服务健康、退出重开和原服务恢复。需特别实测 Web 进程是否因停止自己而中断重启；若复现，先补本段具体根因和执行边界再修，不把“弹框成功”当作“重启成功”。完成等级是本条真实桌面功能可用，不代表总重组或全产品 E2E 已完成。

07:56 UTC 实测已复现后端问题：确认后 test PID 35006 退出、LaunchAgent stopped、HTTP `Load failed`。原服务随后已恢复。修复仅针对 Web 对自身受管实例的 restart：Local Host 验证同一预览、快照、所有权和 launchd PID 后返回 `restarting`（HTTP 202，不是成功）；Web 在响应发送完成后调用 Local Host 提供的延后操作，以 `launchctl kickstart -k` 保持已加载 job 并让 launchd 重启它，不先 bootout 自己。CLI/非自身操作保留原同步语义。浏览器最多等待 30 秒，以新 PID 的健康响应加受管服务 running/owned 核实成功，期间不重复执行；失败给可重试说明。无需新常驻进程、任务队列、持久化 job 或另一套安装器。增加真实时序/重复确认/陈旧预览的回归检查，最后再用安装 App 实测。

src/install 仍有 home 903 行、runtime-integration 1,393 行、web-service 793 行、uninstall 486 行。Runtime integration 已把 MCP handshake 移到 MCP App，但仍混合五种 Runtime 配置格式、变更预览、执行回滚、安装探测和 Skill 链接操作。home 还假设 root package 布局；新的 workspace 分发、vendor provenance/SBOM、macOS bundle 和安装文档必须一起验证。

保留现有预览/确认、计划过期检查、字段所有权、配置字节保留、失败回滚、数据保留、安装 source digest 和供应链校验。替换旧源码归属、路径假设和重复发布逻辑；忽略“已建包就是已完成”或“单测绿就是无损”的历史简化。不开市场、不改未来插件策略、不读写用户凭据；开发测试仅使用明确创建的临时 home。

## 顺序与职责

1. Runtime 接入迁入 apps/local-host 的 installer 子目录：公开类型/错误、配置格式适配、预览生成、文件/Skill IO、确认执行各自分责。复用 MCP App 的公开 launcher validator。Web 和测试使用 Local Host 公开入口；旧 src/install/runtime-integration.ts 在 caller 清零并验证后删除。不是创建新的业务 Module 或横向通用 installer 包。
2. home installer、服务管理、卸载和发布指纹按 App owner 迁移；保留唯一构建产物定位与安装事务，继续拆分源包检查/依赖收集、release staging/promote/rollback、launcher 与文件操作。调用者不得自行拼第二套安装逻辑。
3. scripts、Tauri bundle 和 workspace package 分发适配新归属；检查 vendor 资产 provenance/SBOM 随真实产物交付，不把 vendor 变成业务包。文档、SDK 样例、Skill/方法资产和新 Plugin CLI 都消费同一分发路径。
4. 干净临时环境实际构建/安装/升级/回滚/卸载、真实 launcher 握手与 Node/依赖自包含，核对发布包和供应链文件。现有工作区 pnpm 自动安装问题、已安装 reader 版本落后要以事实处理，不关闭验证或换数据库绕过；用户 home 的升级/服务重启如需新的精确授权先报告，不影响临时环境验证。

## 首切片的输入输出与边界

输入是原 RuntimeIntegrationService options、Runtime ID、connect/remove 和显式 confirmation。输出/错误/收据结构不变；实际写入仍只限当前预览管理的配置 entry、Skill symlink、备份和所有权记录。

允许修改：apps/local-host/src/installer、必要 public exports/Contracts、apps/mcp 的公共类型接线、src/install 与其原 caller、相关 tests/package/lock/inventory/boundary 和开发文档。配置解析仅在格式边界处理未知对象；服务不取得 Goal Store 或 Registry 数据库。任何新行为需先记录，不静默改确认或回滚规则。

## 验收

- dv4-boundary：App owner、public API、允许依赖，无跨 owner Store/深导入/复制业务规则。
- dv4-legacy-exit：旧入口和包路径假设退出；Huge Class 按职责拆分，不能只换目录；vendor 保持发布资产。
- dv4-result：干净环境安装、升级、回滚、卸载、bundle、provenance、SBOM 和文档步骤全部真实通过。

首切片运行受影响包与根 TypeScript、runtime-integration/web/uninstall 定向回归、boundary check 和 diff check；之后按真实安装影响扩大验证。未完成全部三项前 DV4 保持进行中。总目标还要求后续全产品用户 E2E、清理与重复 E2E，不以本 Goal 替代。

## 发布 payload 切片

发布签名检查需要区分进程环境与产物：最初 sandbox codesign 校验返回 CSSMERR_TP_NOT_TRUSTED，但获准的完整发布进程签名校验通过；进一步核对发现当前环境已经指定 APPLE_SIGNING_IDENTITY=Tauri Local Development，因此不能把本次证书归因为 Tauri 无故误选，也不能称旧 shell 此次报告错了。按已有“无签名身份则内部 ad-hoc”约定明确提供 `-` 默认值，有显式身份时原样保留；打包前验证实际 App 签名并输出产物信息。两个环境分支需分别真实验证。无 Apple 公证不宣称公开可发布。当前 workflow 为 manual-only，文档不得描述为已有自动 tag 发布触发。

Desktop GUI 首启固定使用 4173 和同一用户 LaunchAgent label；用户正在用该端口，临时 MOLIS_WORK_HOME 并不能隔离监听/LaunchAgent。普通无损重组不新增测试专用端口或隐藏禁用安装开关。先完成隔离 CLI/产物验证；需要真实占用该端口的 App 首启验收时，提供当前服务身份、暂停/恢复步骤和影响，取得精确授权后执行。

干净副本实际 `pnpm install --frozen-lockfile` 已通过供应链校验，但原 build:migrated-packages 手写顺序在 Goals Plugin 处失败：它依赖的 Goals / Evidence Verification 模块尚未构建。改用 pnpm 按已声明依赖拓扑构建所有 workspace 包，不保留残留 dist 才能跑通的顺序；不通过加入虚假业务依赖调整构建。干净构建和完整包检查都必须再次执行。

同一干净安装还证实 Plugin CLI 的 bin 直接指向未生成的 dist/main.js，pnpm 没创建命令且编译后也未自动补回。bin 改成随源码/发布包存在的薄启动文件，只 import 原编译入口；不复制 CLI 逻辑。安装建链后、构建完成时，实际 `pnpm exec molis-work-plugin` 必须可用。

已证旧 macOS payload 脚本复制 workspace:* 根 manifest 后执行孤立 npm install，不能分发新结构。Local Host 增加 `createMolisWorkRuntimePayload` 公开构建入口：明确 source / 新 output / 已校验的 Node 文件，复用原 source inspection、递归依赖收集与 createRelease。不能在脚本里再写一套依赖树复制逻辑。输出是可直接用于 Tauri 和后续 `molis-work install --source` 的自包含目录；失败清理仅限本调用创建的 staging，不覆盖已有 output。

共享 release 内容包含 vendor 原始 tarball / provenance / SBOM、许可说明和原文档，它们也参与安装内容指纹，避免只复制运行代码而丢失来源。Node checksum 与目标架构校验保留在 Desktop release 工具；下载后用实际 bundled Node 打开 payload 的原生依赖并运行 CLI，不能只检查文件存在。移动 build / prepare / install / start / version-check 到 apps/desktop/tooling，package scripts、CI 和文档切新路径；根构建记录 adapter 属 Local Host tooling，workspace fingerprint 也覆盖对应 tooling 源文件。

验收先实际 payload→临时 home 安装→运行 CLI/MCP/方法目录，并在源目录不可用时验证依赖自包含；错误输出路径、缺少源资产和 vendor 数据变化分别验证原输出/用户数据不被覆盖。完整 DMG/安装链与干净 pnpm 安装继续是 DV4 必需项，不以 payload 切片替代。

## npm 分发切片（已复现 workspace 协议失败）

根 npm pack 产物带 workspace:*，独立 npm install 失败 EUNSUPPORTEDPROTOCOL。新增 App Local Host 所有的 npm staging 与 pack 工具：复用安装器的构建新鲜度检查和依赖发现，把实际需要的 workspace / file vendor 包作为 bundledDependencies，发布 manifest 中引用其真实版本；注册表依赖保留为由目标环境安装的依赖，不复制开发机的 SQLite/PTY 原生二进制。保持源码 workspace manifest 不变，不发布私有子包，不访问发布凭据。

构建后用 `pnpm package:npm` 在独立临时 staging 生成标准 tgz；直接从源码根 npm/pnpm pack 必须明确引导到此命令，不能悄悄产生不可安装包。staging 只包含 root / 子包 files 声明的发布资产与 package.json，保留 vendor 来源、SBOM、Skill、方法、CLI 和样例。只写新 staging，不覆盖未知目录；失败清理本调用创建的临时文件。

验收用真实产物 npm install 到独立 consumer，运行 CLI、MCP handshake、原生 SQLite、PTY 和 Goals 方法加载，再从 npm 安装源安装独立 Home；构建/源目录不可用时仍工作。检查发布物无 workspace/file 本地依赖泄漏、无开发机原生模块。不能用仅解压检查或 --ignore-scripts 安装替代真实安装验证。开发与安装文档同步新命令与平台边界。

## 卸载切片

卸载器迁到 Local Host installer，分开公开 Contract、受管资产检查/文件 IO、预览确认和分步骤执行。保留普通卸载保留数据、清除数据需精确二次确认、Demo 删除通过原 Projects lifecycle、失败收据和计划过期规则。原直接读取 catalog 的 SQL/旧 data_class 推导移入 Projects 的具名只读检查；根 Local Host composition 只打开只读连接并注入检查与 Demo 删除端口，不把 Catalog/Store 给卸载器。只读预览不得运行 schema migration。Web 控制令牌的既有文件路径与创建函数迁 Local Host 公共入口，安装清理与 Web 共用同一来源，不复制路径和验证行为。

## 常驻服务切片

Web Service Manager 保留公开的 detect / prepare / confirm 和相同结果、错误、确认规则。内部将 macOS 路径与 plist/health/命令适配、只读状态检测、launchctl 运行状态转换、安装/恢复事务、预览政策分别归入 Local Host installer。进程身份健康检查、第三方端口不接管、停止超时与失败恢复的原始判断不变；不启动真实用户 LaunchAgent。CLI、Web、卸载和测试切公开入口后删除旧实现，用原 service 回归加 Web/CLI 调用验证。

## 主安装器切片

home.ts 迁到 Local Host installer，按公开类型、源包检查、运行依赖收集、release staging/切换/回滚、launcher、受管文件 IO、安装事务分责。`installMolisWorkHome` 的 public API 要求显式 sourceDirectory；只有根 CLI 装配处按自己的入口位置提供默认产品根目录，保留用户不传 --source 时的原行为，不能在新子包中再用 ../.. 猜产品根目录。没有已发布的额外 Home API 兼容承诺，仓库所有调用者都随本切片切换。

构建指纹也归 App installer，root scripts 只调用公开生成函数。原检查仅覆盖根 src，迁到 workspace 的代码会漏检；增加当前 workspace 包的 src/package.json/tsconfig.json 和根 workspace/构建配置。忽略编译产物和 node_modules，避免检查因自身构建输出变化而永久过期。包发现按当前 pnpm workspace 层级，新增 workspace 层级时必须同步本列表与构建脚本。通过实际 install 测试证明只改 workspace 源码会拒绝旧构建、不会覆盖已有安装；更新构建记录后可安装。发行物没有源码时保留原 release 安装路径，不强加源码清单。
