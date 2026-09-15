# DV4 完整切片验收

2026-09-06。Contract：`goal-reorg-dv4` revision 1。本报告取代把分阶段进展直接当作完整验收的做法；保留所有原失败和修复记录。最终产物检查发现的旧编译残留已修复，新npm消费链和macOS包复验通过。三项工程条件通过，正式状态以Molis Work Review为准。整体重组尚未完成。

## 边界与职责退出

| 原职责 | 当前唯一实现与 caller | 核对结果 |
| --- | --- | --- |
| Home 安装 | Local Host `installer/home.ts` 负责事务，source/dependencies/release/files/launcher 分责；根 CLI 只补默认安装源并调用公开 `installMolisWorkHome` | 主事务170行；source检查、依赖收集、原子切换/失败回滚没有在CLI或Desktop复制 |
| Runtime 接入 | Local Host 的配置 adapters、文本保留、文件/Skill IO、planner、confirmation service；Web 通过公开 `RuntimeIntegrationService` | 配置预览/确认/冲突/回滚保留；真实 launcher 验证使用 MCP App 公开API，不直接访问其内部实现 |
| 常驻服务 | Local Host platform/detection/process/operations/planning/contract/manager；CLI/Web调用公开Manager | 同一所有权、过期计划、健康和PID规则；Web自重启经确认→202→afterResponse→launchd→新PID健康核对 |
| 卸载 | Local Host Service负责确认和步骤；Projects公开catalog检查；根装配注入只读连接与原Demo删除 | installer不持有业务Store、不查询业务SQL；普通数据保留、强确认清除、失败收据继续有效 |
| macOS分发 | `apps/desktop/tooling/`，Cargo/Tauri配置指向Desktop adapter | 根pnpm/CI调用同一工具；payload消费Local Host公开创建API，不在workspace manifest上孤立npm install |
| npm分发 | Local Host `createMolisWorkNpmPackageDirectory` 与 `tooling/pack-npm.mjs` | 临时staging、只复制声明资产、内部JS包随包、注册表原生依赖由消费者安装；不改源码manifest、不公开发布私有包 |
| 来源与开发资产 | 统一release资产列表、源码检查/内容摘要；vendor tarball、provenance、SBOM、LICENSE、README、Skill/方法资产 | vendor仍是供应链资产，不变成业务Module；方法资产随Goals包并供安装Skill引用 |

只读caller盘点：实际安装调用位于 `src/cli/main.ts`；服务/接入调用位于 `src/web/server.ts`；根卸载装配为 `src/local-host/uninstall.ts`；发布工具分别位于两类App的tooling。均消费公开App/Module入口。`src/install/` 无源码；根scripts只剩workspace inventory和boundary工具，旧macOS脚本和build-manifest实现已退出。

当前边界检查：48包、518源码、1599 imports、71依赖边、30 Contract subpaths，0 errors；workspace清单48个唯一包名、0 errors。检查结合上述真实调用链，不将scanner结果单独当作架构证明。仍有4个legacy huge files及10个兼容条目，它们属于后续总Cutover，不能据DV4声称全仓Huge Class治理完成。

## 可复现验证

### 当前源码的独立npm消费链（本轮重新执行）

目录 `/private/tmp/molis-work-dv4-final-npm.ht4RY9`，源码基于checkpoint `6ba65c8` 加当前未提交修复。

1. 正式 `pnpm package:npm /private/tmp/molis-work-dv4-final-npm.ht4RY9/archive`：48 workspace包、根入口、PTY bundle完整构建后生成3048820-byte tgz。不是只对较早快照的产物重新读版本号。
2. 新consumer正常 `npm install` 本轮tgz：63 packages，未跳过安装脚本、未全局安装，独立生成锁文件。Node/macOS arm64当前平台原生依赖实际安装。
3. 既有生产路径 `tests/npm-distribution-smoke.mjs` 全通过：npm CLI；SQLite写入/重开；真实Runtime Host PTY输出；Goals方法加载；从无关cwd默认源安装Home；重复安装unchanged；临时demo创建；版本升级、注入失败回滚、恢复版本后的数据库保持；临时移走npm源包后安装CLI与真实MCP initialize/tools/list仍工作；卸载预览不写、确认清除临时程序和可重建demo。普通用户数据保留由下面真实App旧项目及installer回归另行证明。
4. 当前installer/service/uninstall/catalog/runtime-integration/payload/npm-package定向回归66/0/0。覆盖同版本刷新、构建过期拒绝、配置冲突/不相关内容保留、失败回滚、真实慢MCP握手、来源资产内容、禁止覆盖现有输出、payload源不可用仍自包含、未知服务不接管、卸载强确认和恢复收据。npm archive检查没有构建机 `.node`/spawn-helper 或workspace/file依赖协议泄漏。

日志：同目录 `pack.log`、`install.log`、`smoke.log`、`regression.log`、`boundaries.log`、`workspace.log`。所有进程均成功终止；仅临时消费环境/日志保留。

### 最终产物检查发现的旧编译残留

第一份当前npm包仍包含 `modules/governance-collaboration` 已删除源码对应的 `proposal-submission-store.js`、声明和maps。调用链测试通过不能证明这类文件已退出。根因是workspace tsc只写新输出，不删除已移走源码的旧输出；根build原先只清root dist。

修复 `build:migrated-packages` 复用既有 `workspace:build`，先由每个包自身clean删除生成的dist，再按真实依赖拓扑构建。没有手动删除单个旧文件、修改manifest绕过校验或在发布包中做路径黑名单。两个发布命令和typecheck共用这条清理构建链。

修复后的正式npm命令输出到同目录 `clean-archive/`；正常安装到全新的 `clean-consumer/` 后，完整真实分发smoke再次通过。独立比较前后tar内容证明原包含上述残留、新包不含；workspace全部JS输出均能找到当前对应源码（此检查针对当前一对一TypeScript编译布局）。日志 `clean-pack.log`、`clean-install.log`、`clean-smoke.log`、`clean-exit-check.log`。原失败产物保留，不能引用第一份包作最终发布物。

随后完整 `env -u APPLE_SIGNING_IDENTITY pnpm desktop:build:macos` 再次从workspace清理开始成功构建App/DMG/zip，codesign通过。实际最终App资源目录不含旧Governance JS/声明/maps；其中bundled Node实际执行产品CLI成功。日志 `clean-macos.log`、`clean-app-check.log`。这是构建链/产物改动，没有再改UI，上一轮真实Native用户操作证据继续对应相同UI源码；本轮没有重启现用服务或更新用户安装。

### macOS安装与用户可见旅程

- 干净源码依赖安装/拓扑构建与DMG生成：`dv4-progress.md` 的干净副本 `molis-work-dv4-clean.ITjqKC`。此后当前代码又完整生成App/DMG/zip，最新日志 `/private/tmp/native-titlebar-macos-build.log`，真实DMG安装与窗口由 `../native-titlebar-alignment/spec.md` 记录。
- 首装、首启、退出重开、服务断线恢复：`dv4-gui-validation.md`；其发现的重启失败不是当前结论，已由 `dv4-restart-repair.md` 的真实取消/确认/新PID恢复和App重开验证解决。
- 真实旧0.1.13 DMG→0.1.14、普通项目正文/历史保留、普通卸载保留DB/WAL、实际App重装恢复：`dv4-upgrade-validation.md`。保留缺Listener表的失败证据，修复后全新旧环境重验通过。
- 最新App的顶部对齐、全屏、目录收展与设置跨页：`../native-titlebar-alignment/spec.md`。全部测试服务移除，09:02:43 UTC原服务恢复且原配置不变，未更新现用用户安装。

### 文档与发布边界

中英文安装/开发指南提供根pnpm命令、独立npm消费方式、Node要求、App-owned工具位置、确认/回滚/服务恢复和数据保留边界。已修正项目结构仍列 `src/install/` 的矛盾。Local Host/Desktop README说明公开调用方式和平台责任；供应链资产已由实际payload测试比较内容及tarball摘要/组件身份。

CI仍仅手动触发；未改触发器、上传、registry发布或操作真实用户Runtime配置。macOS arm64是实测平台；Intel真实机器、Developer ID/Apple公证和公开发布未执行，不把本地ad-hoc有效签名当成这些证明。当前任务交付的是原安装/分发流程按新包结构真实可运行，**不是给现用安装升级或发布新版本**。用户真实Runtime新Session加载也未冒充已验证。

## 三项判定

- `dv4-boundary`：通过。公开API、唯一安装/发布owner、具名注入及实际caller已核对。
- `dv4-legacy-exit`：通过。源码职责已拆；最终发现的旧编译残留由公共构建清理流程移除，新npm和App都已核对，不仅是源码中删除。
- `dv4-result`：通过本切片。当前干净编译的npm独立消费、App安装/升级/恢复/保留、回滚/卸载、bundle、来源/SBOM、文档路径均有对应生产执行证据。

不由本报告关闭：全产品前后端用户E2E、清理后重复E2E、全仓剩余旧路径/Huge Class/调用链/开发规范审计；完整样式套件已有搜索框旧断言失败仍留给该阶段。DV4正式Review不得把上述总目标任务吞入已完成结果。
