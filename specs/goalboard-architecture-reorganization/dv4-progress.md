# DV4 阶段进展

2026-09-06 09:24:26 UTC：DV4 全三项正式 Review pass，Molis Work projection completed，cursor1238。完整证据见 [DV4 验收](dv4-validation.md)，Evidence `evidence-85cd5c01-b889-49fe-9dff-b3e81387672c`，Review `review-21270bfe-6272-4111-b518-5d359b641b2e`。当前 npm 独立消费和 66 项回归通过；最终产物中的旧编译残留已由公共 workspace clean/build 修复，新 npm/App 均复验。下方保留各阶段原始结果，不再将旧阻塞作为当前状态。未升级用户安装，未公开发布；整体安全恢复、Cutover、全产品 E2E 与清理后复验仍未完成。

2026-09-06 09:03 UTC：安装包实际使用检查新增的整个工作台顶部对齐/全屏占位已修复，见 `../native-titlebar-alignment/spec.md`。真实 App 验证普通/全屏、目录展开/收起、标题/标签和全屏内跳转；普通 Web 不受 Native 偏移影响。定向 6/0/0、完整 App/DMG 构建和边界检查通过。完整样式套件另有 HEAD 已存在的搜索框旧断言失败，留整体测试清理。DV4 全三项正式审计/Review 和总重组仍未完成。

2026-09-06 08:45 UTC：真实 0.1.13 DMG 升级实测发现旧项目缺 Listener 表，已修复 FeedStore 的 owner 初始化遗漏。修复前 HTTP 500、修复后 14/0/0；重新打包并从全新旧版环境升级，原 Goal 正文与两条事件保留。已安装卸载 Service 使用既有 Runtime 目录隔离参数完成普通卸载，项目 DB/WAL 不变；实际新版 App 重装后正文/历史仍可用。08:44:41 原服务恢复、原配置不变。详见 `dv4-upgrade-validation.md`。全量 DV4 Review 和整体 E2E/最终审计仍未完成。

2026-09-05，Goal 仍执行中；不是最终验收报告。

2026-09-06 08:21 UTC：用户授权的桌面确认框及真实重启修复已通过实际 App 验证。最终测试 PID 从 48298 切换为 48829，仍为受管 running/owned 服务；取消不改变 PID，退出重开正常。详见 `dv4-restart-repair.md`。用户补充的 Onboarding 标题栏重叠与高度对齐也已修复，并经最终 DMG 实际 App 截图、迁移/跳过操作与普通 Web/390px 布局验证，见 `../onboarding-native-titlebar/spec.md`。08:20:58 UTC 原服务和配置已恢复，测试 App/服务已退出。不再将这些问题或测试授权列作阻塞；未升级原用户 Home，不冒充 DV4/总重组完整验收。

2026-09-06 补充：用户已授权临时暂停现用服务，当前源码实际重新构建 App/DMG/zip并完成隔离首启、诊断、断线恢复、退出重开；原服务已在 07:28:27 UTC 恢复，原安装/服务配置逐字节未变。真实 UI 的“重启”确认框缺失，DV4 仍不通过；完整证据与边界见 `dv4-gui-validation.md`。下文“尚未授权/未运行 GUI”为历史，不重复索取已给予的测试授权。

## 已完成的首切片

Runtime 接入旧实现从 src/install/runtime-integration.ts 迁到 apps/local-host/src/installer，并删除旧文件及失效 compatibility allowlist entry。Web server/render、uninstall 和相关测试均使用 Local Host public API，没有保留旧业务转发。

六个文件各有职责：runtime-integration-contract（类型/错误）、runtime-config-adapters（五种 Runtime 的配置规则）、runtime-config-text（保留现有文本的格式操作）、runtime-installation-files（文件和 Skill 链接）、runtime-integration-planner（只生成预览）、runtime-integration（确认执行与回滚/探测）。原 1,393 行混合文件拆为 189/288/214/127/242/376 行；不是把整个大类挪到另一目录。MCP handshake 仍调用 MCP App 公开 validator，没有复制协议。

行为保留：detect/prepare 只读、明确 confirmation、过期/冲突拒绝、仅改 Molis Work entry、备份、失败恢复配置与 Skill、所有权收据、幂等移除和完整 Runtime 身份。Local Host 只增加对 MCP App 的公开依赖，未取得业务数据库。

## 验证事实

- `tests/runtime-integration.test.ts`：13 通过，含真实 launcher、延迟启动、失败回滚、五种 Runtime 配置和字节保留。
- `tests/web.test.ts`：59 通过，含浏览器交互及 HTTP 设置/确认/服务/回收等现有回归；首跑沙箱 listen EPERM，获准沙箱外执行后通过。没有把权限错误当成产品修复或跳过测试。
- `tests/uninstall.test.ts`：4 通过，真实临时 home 安装后确认卸载、保留用户项目、精确二次清除确认、失败恢复记录。首跑 source.build_stale；运行当前 33 个迁移包的原 TypeScript 构建、重建 root dist、PTY bundle 并生成原构建指纹后通过，没有放宽旧构建保护。
- `node scripts/check-package-boundaries.mjs`：48 packages、330 source files、70 dependency edges、10 compatibility entries、0 errors。
- `node scripts/workspace-packages.mjs`、受影响包/根 TypeScript、git diff --check：通过。

移除的旧源码可从 Git 历史和本次迁移后的职责文件恢复；dist 是清理后重新生成的产物，未删除用户项目/安装目录。没有 commit/reset。

## Home、常驻服务与卸载切片（本次续接）

旧 home 903 行、web-service 793 行、uninstall 486 行和 fingerprint 63 行实现均已删除；`src/install/` 无剩余源码。Home 主事务 170 行，其余源包检查、依赖收集、release 切换/回滚、launcher、文件 IO 与类型独立。常驻服务以 public Manager 组合只读检测、平台适配、launchctl 转换、操作/恢复和预览政策。卸载 Service 239 行，不再导入 SQLite/旧 Catalog；Projects 提供具名只读 catalog inspection，根 Local Host 只注入连接生命周期及原 Demo 删除。

本次唯一有意补强：build fingerprint 原来漏掉 workspace 代码，现在覆盖根 workspace 配置、构建 scripts 和现有各级包 src/package.json/tsconfig.json，忽略 dist/node_modules。实际安装证明 workspace 源码改变时拒绝旧构建，原 manifest/launcher 字节和可运行性不变；生成文件变化不会造成无意义过期。调用 API 需明确 sourceDirectory，CLI 保留原默认根目录行为。

验证事实：

- Home/卸载/只读 catalog：`node --import tsx --test tests/install.test.ts tests/uninstall.test.ts tests/uninstall-catalog.test.ts`，24 通过。含从其他工作目录调用真实 CLI、不传 --source 安装根产品，启动已安装 CLI、重复安装不变；保留用户数据、演示数据精确删除、强确认清除与失败收据；旧 schema 无 data_class 时只读分类，数据库字节不变，未知 owner 拒绝。
- 常驻服务：`tests/service.test.ts`，23 通过。含占用端口/身份不符拒绝、稳定 PID/health、旧配置修复、失败恢复、过期计划及真实 CLI 预览。运行的是原有 launchctl adapter fixture，没有操作真实用户 LaunchAgent。
- Web + Desktop：`node --import tsx --test tests/web.test.ts tests/desktop-tui.test.ts`，93 通过，含实际浏览器交互、设置与服务 HTTP 确认、控制令牌持久化/认证、TUI 启动恢复。获准临时端口/本地浏览器权限后执行。这是受影响回归，不是最终全产品用户 E2E。
- 33 个迁移包按原 TypeScript 命令构建；之后受影响 Projects / Local Host / root 再编译通过。root dist 清理并重建、PTY bundle 和新 build-manifest adapter 实际执行；不保留删除源码对应的旧 dist/install 产物。
- 边界：48 packages、350 sources、70 edges、10 compatibility entries、0 errors；workspace inventory 和 diff check 通过。
- 新 CLI 测试首写错误假设安装 manifest 仍记录 source_directory、安装 runtime 的 package name 等于源包名；核对原 release 格式后改为原固定 runtime 名、源版本与已安装 CLI 内容/行为比对，最终通过。未改生产发布语义迁就测试。

开发说明已更新 Local Host/Projects README、Huge Class/迁移矩阵、中英文开发和安装说明。已删除源码可从 Git 历史或迁移后的职责文件恢复；仅重建生成的 dist，没有删除用户安装/项目。

## 发布 tooling 与干净构建切片

macOS build/prepare/install/start/version-check 已迁 `apps/desktop/tooling/`；根 build-manifest invocation 迁 Local Host tooling。根 pnpm 命令保留，CI 消费相同命令，不新增发布任务或自动发布。Desktop 公开依赖 Local Host，边界 scanner 补扫 tooling / bin，没有豁免其跨包导入。

`createMolisWorkRuntimePayload` 复用 App installer 的 source 检查、递归依赖收集和 release 创建。准备脚本使用已验证 Node 与 payload cwd 打开 better-sqlite3、node-pty、ws 和 Local Host，并实际运行 CLI；通过后才替换资源目录。未知的已有 API 输出被拒绝，准备失败保留旧 Desktop 资源。共享 release 增加 vendor tarballs/provenance/SBOM、LICENSE、README，并纳入安装内容摘要；没有把 vendor 作为业务包。

真实干净副本 `/private/tmp/molis-work-dv4-clean.ITjqKC`：

- 不带 node_modules/dist/target 拷入源码后，`pnpm install --frozen-lockfile` 成功，118 项锁文件供应链策略通过，原生依赖安装脚本正常执行。未关闭供应链策略或修改当前工作区 node_modules。
- 首次 `pnpm build` 暴露手写顺序错误：Goals Plugin 在其依赖模块之前编译。改为 pnpm 的依赖拓扑顺序后，`pnpm workspace:clean && pnpm build` 实际完整构建 48 个 workspace 包、root 和 PTY 成功。
- 同时发现 Plugin CLI bin 指向尚未生成的 dist，pnpm 没创建命令且 build 后仍缺失。改成随源码存在的薄 bin import；重装建链、构建后 `pnpm exec molis-work-plugin --help` 和对真实样例 manifest 的 validate 均成功。
- `bash apps/desktop/tooling/prepare-macos-runtime.sh` 真正下载 Node v24.14.0 darwin-arm64，官方 SHA256 校验通过，原生依赖/CLI 检查通过，生成 Tauri runtime resources。不是仅用系统 Node 代替下载路径。
- `tauri build --bundles app,dmg --ci` 在干净副本实际成功生成 `Molis Work.app` 与 `MolisWork_0.1.14_aarch64.dmg`。工具使用本机 `Tauri Local Development` 签名；因没有 Apple 公证环境凭据跳过 notarization，不是公开发布资格证明。未上传或发布。
- 真实 install-macos-app.sh 只读挂载上述 DMG，并安装到临时副本的 installed-apps/Molis Work.app；设置 SKIP_OPEN，没有启动 UI 或写用户 Applications。随后使用已复制 App 内的 Node/CLI 安装到临时 dmg-user-home，返回 installed/self_contained；该 Home 的启动器实际输出完整 CLI 帮助。DMG 挂载由脚本正常卸载。仍未把 App GUI 首启/升级/恢复当成已验证。

本工作区 `runtime-payload/install/plugin-authoring` 23 项、sample E2E/模板边界 2 项和 release version 1 项通过。payload 用实际 Desktop 准备工具生成，再调用产物自身 CLI 安装到临时 home；删除源 payload 后 CLI、原生库、Projects 和 Goals 方法加载仍成功。两个 vendor tarball 的 SHA256 与随包 provenance 匹配，SBOM 主组件身份/版本一致。这证明文件完整性与记录一致，不声称这些 sidecar 自身是可信第三方签名。边界 48 packages / 356 sources / 71 edges，0 errors。

## 下一步仍须完成

1. installer 与 release tooling 归属已迁，App/DMG 已构建；继续 App GUI 首启和安装恢复验收。根 npm pack 原先失败的 workspace:* 问题已由下述正式 npm staging 路径修复；旧失败复现文件保留在 `/private/tmp/molis-work-dv4-npm.iJUCGg`，不能把它误报为当前状态。
2. workspace source fingerprint 已补齐；后续 release tooling/资产归属改变时，须核对新位置是否仍在真实构建输入与分发完整性范围内。
3. scripts/Tauri bundle、workspace dependencies、vendor provenance/SBOM、开发/安装文档和干净分发包路径。
4. 正式 pnpm 干净安装与全部 48 包构建已经实际通过，原环境问题不再作为阻塞。当前工作区原 node_modules 未清理；后续仍应使用可复现干净副本验证完整分发。
5. 在临时环境真实验证安装、升级、回滚、卸载和来源；已安装宿主 reader 3 / Session schema 5 的问题仍需正式更新和恢复验证，不改数据库绕过。

总目标还需 GW5、其余 Coordinator/Draft/Decision/Cutover、全部前后端用户 E2E、清理后重复 E2E和初始架构规范审计。当前证据只能记录 DV4 部分进展，不能通过其全部验收。

## npm 产物实际安装、升级、回滚与卸载

Local Host 新增 `createMolisWorkNpmPackageDirectory`，复用安装构建新鲜度和运行依赖发现；只修改临时发布 manifest，不改变源码 workspace 关系。随包附带实际需要的 35 个 workspace/vendor JavaScript 包；SQLite、PTY 等注册表依赖在消费者环境安装，不把本机 Node 或原生二进制放进通用 npm 包。Root `pnpm package:npm` 完整构建后调用 App-owned tooling；直接根 npm/pnpm pack 明确报正确入口，不再默认产出不可安装包。中英文安装/开发说明与 Local Host README 已更新。

真实证据（macOS arm64、Node 24.14.0）：

- 干净副本 `/private/tmp/molis-work-dv4-clean.ITjqKC` 实际 `pnpm package:npm` 成功，全部 48 包/root/PTY 构建成功；tgz 位于其 `release/npm/adeptify-molis-work-0.1.14.tgz`，2,825,742 bytes，35 bundled packages。
- 新 consumer `/private/tmp/molis-work-dv4-npm-consumer.JbALTN` 正常 npm install 成功，63 packages，未使用 ignore-scripts。首次显式禁用 lockfile 后 npm ls 不能核实本地 tarball 来源；改回 npm 默认锁文件流程安装后 npm ls 通过。未修改产品语义处理此 npm metadata 问题。
- `node tests/npm-distribution-smoke.mjs /private/tmp/molis-work-dv4-npm-consumer.JbALTN` 真实通过：npm bin CLI；SQLite 创建/写入/关闭重开读取；正式 Runtime Host PTY 执行 shell 并收到输出；公开 Goals 方法加载；默认源定位安装 Home；重复安装 unchanged；实际 demo 创建；不同 release version 升级；在写安装清单之前注入故障，启动器回滚且 demo DB 字节不变；恢复原版本且 demo DB 字节不变。
- 临时移走 npm product 源目录后，Home CLI 与真实 MCP initialize/tools/list 握手仍成功；vendor SBOM 保留一致。最终卸载 preview 保持 demo DB 不变，confirm 返回 uninstalled 并删除本次临时安装与可重建 demo。脚本恢复 npm 源目录并清理自己创建的临时 Home，不触碰用户 Home、Applications 或 Runtime 配置。
- 初次 smoke 直接 spawn node-pty，绕过既有 Runtime Host 的 macOS spawn-helper 权限初始化，因此 posix_spawnp 失败。测试改为产品真实使用的公开 MolisWorkPtyHost 后通过；未加入新生产补丁。该测试证明 Molis Work 终端路径，不声称裸 node-pty 无条件可用。
- `tests/npm-package.test.ts` 在干净副本 1 项通过：真实 npm pack、方法/Plugin CLI/vendor 资产进入 archive、无 node-pty/SQLite 或 .node/spawn-helper 二进制、无本地依赖协议泄漏、源 manifest 未改及拒绝覆盖既有输出。完整 tar listing 独立检查同样没有原生二进制。
- Local Host TypeScript、diff check、workspace inventory、边界扫描通过：48 packages / 358 sources / 71 edges / 0 errors。

本切片已达到 npm 分发链功能可用；没有 registry 发布、没有跨平台实测、没有 Apple 公证或 App GUI 首启验收。用户数据保留的原 installer 回归仍有效；这里的真实数据库比较是临时 demo，不拿它替代全产品真实用户数据/前后端 E2E。

## 完整 macOS 发布命令与签名模式验收

已实际执行两次完整 `pnpm desktop:build:macos`，不只是分段调用 Tauri：一次保留当前环境已有的 Tauri Local Development 身份，一次用 `env -u APPLE_SIGNING_IDENTITY` 验证未指定身份时的新显式 ad-hoc 默认值。两次均完成全部 workspace/root/PTY 构建、Node 下载/SHA 校验、App/DMG、zip 与 SHA256 sidecar，且 codesign 完整性验证通过。后一份实际输出 `Signature=adhoc`；未上传/发布，均跳过 Apple 公证。

最初普通沙箱对旧 App 执行 codesign 返回 CSSMERR_TP_NOT_TRUSTED，进一步对同一旧 App 在获准的正常环境只读验证成功。因此这是验证环境与证书信任可见性差异，不是已证实的旧 App 损坏。当前进程原本就设置了 APPLE_SIGNING_IDENTITY=Tauri Local Development，不能把先前签名误称为自动误选。脚本现在保留显式身份、无身份时提供 `-` 默认值、校验产物并报告实际签名；文档同时纠正当前 GitHub workflow 仅手动触发，不恢复 tag 发布。

最终 ad-hoc 产物在 `/private/tmp/molis-work-dv4-clean.ITjqKC/release/macos/`。DMG/zip 的 `shasum -a 256 -c` 均通过。zip 由 ditto 真正解包到 `/private/tmp/molis-work-dv4-release-check.tmaj5v/unpacked/Molis Work.app`，解包后 codesign 验证通过；正式 install-macos-app.sh 只读挂载 DMG 并复制到同一临时根的 `installed-apps/Molis Work.app`，自动卸载镜像，没有打开 GUI 或改用户 Applications。

### GUI 首启与当前服务的实际隔离限制

Tauri web_service.rs / main.rs 固定使用 127.0.0.1:4173；升级路径调用 service install，LaunchAgent label 同样固定。已只读确认当前 `com.molis.work.web` 在 gui/501 运行，配置为 `/Users/yijunwang/.molis-work/bin/molis-work-web --home /Users/yijunwang/.molis-work`，当前 4173 监听者为 node。因此仅改测试 MOLIS_WORK_HOME 不能保证 GUI 首启使用独立服务，也不能把打开现有服务器算作新 App 首启验证。

下一步需要明确允许短暂暂停当前 4173 服务：保留原 LaunchAgent plist/安装/项目不变，在临时 Home 运行 App 首启与恢复检查，停止并移除本次临时测试服务，然后恢复原服务。未经该操作授权不停止/接管当前服务；不为测试额外引入新产品端口、隐藏模式或跳过安装。当前 DV4 仍未完成，以上只覆盖安装包与分发路径，不覆盖 App GUI 首启、正式宿主更新恢复、整体前后端 E2E或公开发布验收。
