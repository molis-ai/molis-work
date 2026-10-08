# C 端就绪方案（§4.19，只出方案）

状态：方案（W1-21，2026-10-08）；本文不实现任何一项。27 项用户决定已全部定，本文用到的写在 §0.1；还要用户定的在 §8。代码基线 main `f8ea20b9`。决定取自 spec §1 与 §10 的决定表，该表在分支 `docs/anti-corruption-decisions-5`（PR #312，提交 `bd1117a4`）里，合入 main 前以该分支为准。

任务要求：`docs/prompts/repository-anti-corruption.md` §4.19 与交付第 22 项（C 端就绪方案）。进度与决策记录在同目录 [spec.md](spec.md)，普查证据在 [roadmap-2026-10-07.md](roadmap-2026-10-07.md) 的 §4.19 一节；缺口清单最早见 `docs/prompts/code-health-report-2026-09-30.md` §3.3。

## 0. 怎么读

- **范围**：任务书点名的七项（公证签名、自动更新、崩溃上报与可观测性、在线备份、跨平台桌面、不依赖 `sandbox-exec` 的沙箱、减少私有 vendored 依赖），加数据升级策略（§3.2，自动更新与备份的前置），以及与第三方插件安装的接口（§3.9，方案归 W1-15）。体检报告 §3.3 里的 BYOK 引导、浏览器代码打包、错误基类、皮肤叠加不在本文（§7 写明归哪一片）。减少私有 vendored 依赖这一项已由决定 #25 定下，归 W1-20，本文不再计价、不排期（§3.8）。
- **标注**：`[已确认]` 读了代码或跑了命令（命令在 §10）；`[推断]` 由已确认的事实推出；`[未验证]` 靠外部工具的文档记忆或需要账号才能验证，对应的探针在 §6。
- **成本口径**：人日是一个熟悉该处代码的工程师的理想工作日，不含评审等待和外部等待；写成「乐观–保守」区间。依据是本文写出的代码规模与调用点个数，不是做过的测量，一律是 `[推断]`。外部等待（账号、证书、他人答复）单列，不折成人日。防腐路线里已有的片（W 系列）的成本不在本文重复计价，只写依赖。
- **不能违反的硬约束**（`AGENTS.md`）：一个 Home 只有一个执行进程，所以备份、迁移、日志轮转都由常驻宿主做，不另起进程；模型调用只经 `horizontal/agent-host`，所以 Prologue 的 exporter 槽也从那里接；插件只提供内容、不出自己的整页，所以更新、备份、上报的开关都进宿主设置，不是插件页面；密钥只给引用，所以诊断包和上报里不出现密钥本体，备份对密钥的处理见 §3.4 与 D6。
- **依赖片**：W1-16（`docs/system/HOME-DATA.md`）已在 main，本文引用它的第 2、3.1、6.1、6.2、6.3、7、8、9、10、11 节。W1-20（依赖与 SDK 计划）与 W1-22（版本策略）各有一条未合入的分支（`docs/deps-and-sdk-plan`、`docs/release-policy`），本文只引用它们已写出的结论并标明出处，入库后按 §9 核对。
- **不动 spec §1 的决策表**：§8 的决定还没做，不写进去；用户决定后，由收到答复的会话把结论写成 §1 的一行，实现按里程碑拆 PR，条目进 `specs/BACKLOG.md`（`specs/README.md`：未完成只记在那里）。

### 0.1 已定的决定在本方案里的落点

| 决定（spec §1，2026-10-08，除注明外） | 结论 | 本方案怎么用 |
| --- | --- | --- |
| #20 备份范围与「卸载并清除数据」 | 统一库登记表；离线快照命令，经常驻宿主暂停后拍一致快照，带清单与版本核对；清除覆盖所有登记的库；**定时在线备份留给 C 端计划** | 登记是 W4-11，离线快照是 W5-16，都是前置，不在本方案计价。C-4 就是被留下的那一块，只做 W5-16 之上多出来的部分（§3.4）；C-2 迁移前的快照也用 W5-16（§3.2） |
| #21 真实 Home 的残留物 | 保留 10-07 维护前整份备份与 runtime-configs；被换下的旧文件搬到 `~/molis-work-backups`；其余旧备份、孤儿文件、空库、旧 `goalboard-*` 安装版核对后删；目录库 v22 用 Home 加项目 id 推导路径；实验库在拷贝上演练后标 v1；动手前先整份备份 | F4、F8 里 dev 机 Home 的体量是清理前的测量，清理后会变（§2）；v22 是 C-4「恢复到新路径」的前提（W5-17）；探针 S3 只用拷贝（§6） |
| #11 第三方插件的安装与信任（只写计划） | `molis-work plugin install <bundle>`；首次安装确认并记住发布者密钥；独立进程沙箱运行 | §3.9 写它对 C 端的约束，方案归 W1-15 |
| #15 「不留兼容」何时结束（2026-10-08） | 第一个装到开发机外的版本（1.0 或第一个外部用户装上的版本）；日期写进 `docs/system/CONTRACT-CHANGES.md`；之前照旧「不留兼容」 | C-2 的规则（§3.2） |
| #14 CI 产品子集是否挡合并 | 先不挡：单独作业跑约两周、隔离不稳定用例后加进 Verify；不改分支保护 | 新系统的 CI 作业（C-6、C-7）照这个做法（§3.6、§3.7）；S4 即 W1-11 |
| #25 Prologue SDK 与私有包 | 三个私有 tarball 不再放进公开仓库，改从私有 registry 或 release 附件取 | §3.8：只记 C 端的后果，不计价、不排期 |
| #4 讨论页签与 IM 代码 | 保留并继续迭代；只修数据登记（`server/server.sqlite` 进 Home 数据与备份表）、宿主越界读表、包的归类 | C-2、C-4 遍历登记时会遇到这个库；IM 线的定位见 §7 |
| #5 调用编号上界面 | 错误详情显示短编号可复制；「设置 › 诊断」按编号列出最近的调用 | C-5A 的诊断导出带最近调用的编号（§3.5） |
| #26 Characters 的代码身份 | 并进宿主，变成设置的一节 | C-2 里 `characters.sqlite` 的 owner 变更（§3.2） |
| #23 版本与发布策略 | 一个产品版本，下一版 0.3.0 | F17；W5-15 切的 0.3.0 是不是第一个外部版本，见 D1 |

## 1. 结论

**现在离「装到别人的机器上」差的，按用户会先撞上的顺序**：没有公证（首次打开被 Gatekeeper 拦）、升级后打不开旧库（存储版本不符就拒绝，没有升级链）、出问题没有可发回的诊断、核心 AI 包的再分发许可没有书面答复。前三件加上前置的离线快照，构成第一个里程碑 M1；第四件是外部门槛，问题已在 W1-20 草案里，不另问。自动更新、定时在线备份、可选上报是第二个（M2），它们依赖 M1 的公证、升级策略和快照。沙箱继任者和 Windows/Linux 是第三个（M3），并且是整套里最不确定的两项，先用探针量一次再定。

**和防腐路线的关系**：C 端各项不在路线的 87 片里。M1 的前置片落在第 4、5 波（W4-11、W5-13、W5-16），所以按路线原顺序，M1 最早在第 5 波之后收口，M2、M3 在路线之后；想更早，只能前移前置片（D1）。逐项的最早开工与收口见 §4.1。

**建议顺序与总成本**（细表见 §5）：

| 里程碑 | 内容 | 人日（乐观–保守） | 外部等待 |
| --- | --- | --- | --- |
| M0 探针与决定 | §6 的 5 个探针 + §8 的 7 个待决 | 5–9 | 用户答复 |
| M1 能装到第二台 mac | 公证签名、数据升级策略、本机诊断与崩溃记录（前置：W5-16 离线快照） | 15–25 | Apple 开发者账号与证书；Prologue 负责人对再分发的答复 |
| M2 保持更新、不丢数据 | 自动更新、定时在线备份、可选崩溃上报 | 22–36 | 更新清单托管；上报端点 |
| M3 不止 macOS | 沙箱继任者；Linux/Windows 先跑通宿主，再做 Windows 桌面 | 30–50（只做跨平台）至 54–90（含按系统的沙箱后端） | Windows 代码签名证书 |

**要用户先定的三件**：顺序与是否前移前置片（D1）、备份里的密钥怎么处理（D6，W5-16 开工前）、账号与更新清单托管（D8，C-1 开工前）。诊断与上报（D3）、沙箱继任者（D4）在各自那一项开工前定；平台顺序（D5）、路线增补（D9）可以边做边定。每件的选项与推荐在 §8。

## 2. 现状（方案依赖的事实）

| # | 事实 | 出处 | 标注 |
| --- | --- | --- | --- |
| F1 | 发布只能手动触发，矩阵只有 macOS arm64（`macos-15`）与 x64（`macos-15-intel`）；CI 三个 job 都在 `ubuntu-latest` | `.github/workflows/release-macos.yml:4-5,17,19`；`.github/workflows/ci.yml:22,100,131` | 已确认 |
| F2 | 签名与公证的路径已接好：6 个 `APPLE_*` secret 齐了才导入 Developer ID 证书并构建；tag 构建缺凭据直接失败；没有凭据只出 ad-hoc 包（`signingIdentity: "-"`）。仓库里没有 entitlements、hardened runtime、`notarytool`、`stapler` 的任何字样，公证全靠 Tauri CLI 读环境变量。调查记录 `gh secret list` 无输出，本片没有复核，按「没有凭据」处理 | `release-macos.yml:23,50-51,58,65,74`；`apps/desktop/src-tauri/tauri.macos.conf.json:4`；`apps/desktop/tooling/build-macos-release.sh:23,36`；对 `apps/desktop .github docs scripts package.json` grep 上述词为空 | 已确认（secret 一项：调查记录） |
| F3 | 桌面没有更新器：`tauri` 只开 `tray-icon`、`macos-private-api`。升级靠重下 DMG：内嵌运行时仅当版本比 Home 里新才装进 Home，装完修复常驻服务 | `apps/desktop/src-tauri/Cargo.toml`（依赖段）；`apps/desktop/adapters/tauri/src/web_service.rs:93-106,198-212,279-292` | 已确认 |
| F4 | Home 里程序发布是原子换目录并带失败回滚；没有清理旧 release 的代码。dev 机 `releases/` 约 2.0 GB，其中改名前的 11 个版本约 1.7 GB；一份 release 目录解开约 334 MB。这是决定 #21 清理旧 `goalboard-*` 安装版之前的测量，清理后 dev 机的数字会变，产品的保留规则（C-3.7）与此无关 | `apps/local-host/src/installer/home-release.ts:242-275`；`docs/system/HOME-DATA.md` 第 10 节；`du`（§10） | 已确认 |
| F5 | 存储版本不符就拒绝，没有升级链：`applySqliteBaseline` 对其他版本抛 `SqliteSchemaVersionError`，目录库同理。helper 之外 20 处调用（13 处直接调用，7 处经 `openBaselineHomeSqlite`，命令在 §10）；25 种权威库里 20 种用 `user_version`、2 种自带 meta 表、1 种自管 `user_version`、2 种无版本 | `packages/storage/src/sqlite-baseline.ts:31-45`；`apps/local-host/src/catalog-schema.ts:31-39`；`docs/system/HOME-DATA.md` 第 2 节 | 已确认 |
| F6 | 没有备份命令：源码里没有 `.backup(`、`VACUUM INTO`，唯一的 checkpoint 是 `LocalSqliteStorage.checkpoint()`。文档只写离线整份拷贝；唯一的恢复用例是离线的，只盖目录库、项目库、会话库（含加密正文）和成果版本 | `packages/storage/src/sqlite.ts:167`；`docs/installation.md` 「离线备份与恢复边界」；`tests/home-backup-recovery.test.ts` | 已确认 |
| F7 | 必须同一时点的备份组 A–F 与不必备份清单已经列好；主密钥在 macOS Keychain，不在 Home 里（没有 Keychain 时是 Home 里的 `feed/secrets.key`）；目录库存项目库的绝对路径，所以恢复只能回原路径 | `docs/system/HOME-DATA.md` 第 7、8、3.1 节；`packages/storage/src/adapters/file-secret-store.ts:1-8,145,166,192,207` | 已确认 |
| F8 | 体量（dev 机，2026-10-08，只读 `stat`/`du`，没有打开任何库）：Home 约 10 GB；活库（不含 `releases/`、`maintenance-3-replaced/`、`runtime-config-backups/`）145 个 `.db`/`.sqlite` 文件共 1.14 GB，其中 `sessions/sessions.db` 约 1.01 GB；Home 里另有 `maintenance-3-replaced/` 约 1.9 GB，决定 #21 要把它搬出 Home | §10 的命令 | 已确认 |
| F9 | 可观测性是空的：`packages/observability` 在 SSOT 标 `absent`，合同是 10 行占位；宿主日志是 LaunchAgent 的 stdout/stderr 文件，没有轮转代码；`logs/action-calls.jsonl` 只存命令结果、保留最近 1000 条；`console.*` 共 81 处（其中 `apps/local-host/src` 60 处）；`uncaughtException`/`unhandledRejection` 处理 0 处；Rust 无 panic hook | `docs/SSOT-MATRIX.md:67`；`packages/contracts/src/platform/observability.ts`；`apps/local-host/src/installer/web-service-platform.ts:37-38`；`docs/system/HOME-DATA.md` 第 6.3 节；§10 的 grep | 已确认 |
| F10 | 桌面发布配置 `panic = "abort"`、`strip = true`：崩溃不留回溯也不留符号。没有崩溃上报库：grep 到的 `sentry` 命中都是 Sentry 连接器的目录项（如 `apps/local-host/src/connector-mcp.ts:49`） | `apps/desktop/src-tauri/Cargo.toml:105-106` | 已确认 |
| F11 | Prologue 上游的 observability exporter 槽（`046251ec`，2026-09-30）既不是 vendored 基线 `af7375c7` 的祖先，也不是 `9fc3b173` 的祖先；它是 `9fc3b173` 之后上游 main 的 24 个提交之一。vendored 包的 `dist` 里没有 `exporter` 字样，只有 `AuditSink`。W1-20 草案核对出现行 vendored 包就是上游 `9fc3b173` 的 `packages/sdk`（无补丁），本文没有复现这一条 | `~/code/prologue`（`git merge-base --is-ancestor`、`git log 9fc3b173..origin/main`）；`vendor/prologue-sdk/` 的 tgz 解开后 `dist/index.d.ts:45`；W1-20 草案 §4.1（分支 `docs/deps-and-sdk-plan`） | 已确认（`9fc3b173` 即 vendored 包：W1-20 草案，未复现） |
| F12 | 平台绑定：`main.rs` 有 24 行、桌面 Rust 共 40 行写 `target_os = "macos"`，5 个 `*_macos.rs`；常驻服务只有 launchd；主密钥只在 darwin 走 Keychain；素材 OCR/音视频提取靠 Swift 助手且非 darwin 直接 503；沙箱只认 darwin | `apps/desktop/adapters/tauri/src/`；`apps/local-host/src/installer/web-service-platform.ts:84`、`web-service-detection.ts:7`；`apps/local-host/src/material-native.ts:41,46`；`packages/plugin-sandbox/src/runner.ts:41` | 已确认 |
| F13 | 已有多平台分支的：目录选择器（darwin/linux/win32）、浏览器定位。`node-pty` 1.1.0 预编译只有 darwin-arm64/x64、win32-arm64/x64，没有 linux；`better-sqlite3` 12.8.0 走 `prebuild-install` | `apps/local-host/src/directory-picker.ts:34-59`；`apps/local-host/src/browser/locate.ts:28-54`；`node_modules/.pnpm/node-pty@1.1.0/.../prebuilds`；`better-sqlite3/package.json` | 已确认 |
| F14 | 沙箱：3 处启动 `/usr/bin/sandbox-exec`；只有 `runner.ts` 执行不可信的插件代码，另两处（类型检查、依赖解包）只解析不可信数据；网络策略已在宿主一侧（`https-proxy.ts`），不依赖 Seatbelt | `packages/plugin-sandbox/src/runner.ts:74`；`apps/local-host/src/plugin-builder/build-checks.ts:197`、`build-dependencies.ts:83`；`packages/plugin-sandbox/src/seatbelt.ts:9-20` | 已确认 |
| F15 | 桌面 IPC：`default.json` 把 pty、capsule、shelf 等权限开放给 `http://127.0.0.1:4173/*` 与 `http://localhost:4173/*` 的页面，`csp` 为 `null`。插件侧栏的 iframe 没有 `sandbox` 属性（`apps/workbench/src/side-panel.ts:45`），是否同源取决于每个插件的 `src`，没有逐项核对。插件 frame 或别的进程能否调到这些命令 `[未验证]`。这是现在就存在的安全问题，不是更新器才有的，去向见 §4.1 与 D9 | `apps/desktop/src-tauri/capabilities/default.json:5-6`；`apps/desktop/src-tauri/tauri.conf.json:46` | 已确认（可达性：未验证） |
| F16 | 三个私有 vendored 包：`@prologue/sdk`（`package.json` 里 `private: true`、无 license 字段，包内也没有 LICENSE 文件）、`@adeptify/intelligence-client`、`@adeptify/search-evidence-layer`（provenance 写 MIT，源仓库 `adeptify/trick-catalog` 本账号解析不到，调查记录）。随发布带走的是：`vendor/` 下除 `prologue-sdk/*.tgz` 之外的全部文件（`release-assets.ts:22` 跳过 prologue 的 tgz），即 `prologue-sdk/README.md`、26 个 `.patch`（Prologue `packages/sdk` 源码的 diff）、两个 adeptify 的 tgz 加 provenance 与 SBOM；另外编译后的 SDK 在安装物的 `node_modules/@prologue/sdk/dist`。同一组函数（`vendorReleaseAssetPaths`）供 Home 发布、桌面运行时载荷（它走 `createRelease`）与 npm 包使用。dev 机的 `releases/molis-work-0.2.0/vendor/prologue-sdk/` 有 26 个 `.patch`、0 个 tgz，`node_modules/@prologue/sdk` 有 `dist`。spec §1 的 2026-10-08 行已定：tarball 不再放进公开仓库 | `vendor/`；`apps/local-host/src/installer/release-assets.ts:6-30`；`apps/local-host/src/installer/home-release.ts:30`；`apps/local-host/src/installer/package-release-files.ts:35`；根 `package.json` 的 `files`；`tests/runtime-payload.test.ts:21-36`；`tests/npm-package.test.ts:37-41` | 已确认 |
| F17 | 发布版本号的 6 处来源由脚本核对一致；2026-10-08 决定下一版 0.3.0、根包/桌面/Tauri 同一版本 | `apps/desktop/tooling/verify-release-versions.mjs`；spec §1 的 2026-10-08「版本与发布策略」行 | 已确认 |
| F18 | 备份里的密钥问题：会话正文的数据密钥是 Home 里的明文文件 `sessions/content/content.key`（base64，0600），`blobs/` 非空而没有这把钥匙时拒绝创建新钥匙，所以丢了它不只读不出旧正文，新写入也失败；Agent 运行记录的 `agent-runtime/storage.key` 丢了则 `records/` 里的加密正文读不出（HOME-DATA 第 6.1 节）；主密钥在 Keychain 或 `feed/secrets.key`，它封存的 `feed/secrets.json` 里除模型 Key 与连接器凭据外，还有 Feed 证据与 Alchemist 检索正文的内容密钥（`system:feed:evidence-content-key:v1/v2`）；没有这些密钥时，旧证据正文读不出，新写入落进 `-recovered-v2` 根 | `modules/private-work-context/src/content-store.ts:30,42-47`；`packages/storage/src/adapters/evidence-content.ts:15-16,56-60,67-73,110-113`；`packages/storage/src/adapters/file-secret-store.ts:1-8,134`；`docs/system/HOME-DATA.md` 第 6.1、6.2、7 节 | 已确认 |

**已有的、方案直接用的**：Home 程序发布的原子换目录与回滚（F4）；桌面「内嵌版本更新才装进 Home」与服务修复（F3）；存储版本不符即拒绝，可兼作降级保护（F5）；HOME-DATA 的备份组与不备份清单（F7）；`SecretStore` 的三种后端和 `backend()` 描述（`file-secret-store.ts:1-8`）；沙箱的宿主侧网络策略与消息代理（F14）；版本一致性脚本（F17）。

## 3. 七项方案

编号 C-1…C-8 只用于本文引用。

### 3.1 C-1 公证签名（M1）

**要补的**（F2）：账号与证书；给内嵌运行时逐个签名；entitlements；公证后的校验；恢复 tag 触发。

1. **账号与证书（用户）**：付费的 Apple Developer Program 账号，Developer ID Application 证书，公证用的凭据，填进 F2 里的 6 个 secret。签名人名会显示在用户的 Gatekeeper 提示里，所以个人还是组织名下要先定（D8）。
2. **内嵌运行时逐个签名**：载荷里除 Tauri 主程序外，还有下载的 Node 24.14.0（`apps/desktop/tooling/prepare-macos-runtime.sh:7,33-35` 核对 SHASUMS 后解压）和原生插件（dev 机一份 release 里有 10 个 `.node`、2 个 `spawn-helper`，含另一架构与 Windows 的预编译）。公证要求所有 Mach-O 带 Developer ID 签名、hardened runtime 和时间戳 `[推断]`。做法是先枚举再由内向外签，把「枚举 + 签名」做成 `apps/desktop/tooling/` 下的一步，放在 Tauri 打包之前或之后（S2 定）。
3. **entitlements**：hardened runtime 下 Node 需要的最小集合（JIT 等）和原生插件是否需要放宽库校验，`[未验证]`，由 S2 在本机用 ad-hoc 加 `--options runtime` 先试，拿到账号后再用真实公证验证。
4. **CI**：公证后 `stapler staple` 与 `stapler validate`，用 `spctl` 评估 `.app` 和 DMG，两个架构各一次（F1）；有凭据才跑，tag 缺凭据照旧失败（F2）。
5. **恢复触发**：`release-macos.yml:4` 的注释写明恢复 `push.tags`；做完第 4 步再恢复。
6. **验收**：干净用户账户经浏览器下载（带 quarantine）的 DMG，双击打开、不需要右键放行；`spctl` 显示 `Notarized Developer ID`。

**成本** 4–7 人日（枚举与签名 2–3、entitlements 迭代 1–2、CI 校验与双架构 1–2），S2 另计 1–2。**外部等待**：账号与证书，数日到数周 `[未验证]`。**依赖**：D8；W1-20、W1-22 先合入——三者都改 `release-macos.yml`，W1-22 还把 `verify-release-versions.mjs` 从 `apps/desktop/tooling/` 搬到 `scripts/`，W1-20 草案要在安装依赖前加取私有包的步骤，签名步骤排在它之后（§9）。**风险**：公证拒绝信息逐轮迭代（每轮几分钟到几十分钟）；Tauri 对嵌套资源的签名范围 `[未验证]`；`panic=abort`/`strip` 与公证无关，但与 C-5 的符号有关。

### 3.2 C-2 数据升级策略（M1，自动更新与备份的前置）

**为什么在这里**：F5 说明任何改了库版本的构建，对旧 Home 都是「打不开」。当前这是有意的（spec §4.1「不留兼容逻辑」）。窗口何时结束已由决定 #15 定下：第一个装到开发机外的版本（1.0 或第一个外部用户装上的版本）起，日期写进 `docs/system/CONTRACT-CHANGES.md`（W1-13，未合入），此前照旧「不留兼容」。更新器一旦存在，这个窗口就必须关上。

**方案**：

1. **规则**：从第一个外部版本起，库版本变更必须带迁移；此前维持现状。#15 的原文说的是「不留兼容」整体与读兼容的合同流程，库升级算不算在内，本文按 `[推断]` 处理：spec §4.1 把「版本不符就拒绝」算作不留兼容的一部分，所以同一时点结束。降级保护保留：旧程序看到更新的版本仍然拒绝（`catalog-schema.ts:31-39` 的做法）。**窗口在第一个外部版本关闭**，所以已排期的库版本变更要在它之前做完，之后每一次都要写迁移：W2-05（给两个无版本库补版本）、W5-17（目录库 v22）、Characters 并入宿主（#26，第 4 波切片）。
2. **机制**：`applySqliteBaseline` 扩成「版本 + 建库语句 + 按序迁移」：库版本低于当前则在一个事务里依次迁移并写 `user_version`；高于当前、或有表无版本，照旧拒绝。目录库（`catalog_meta`）、会话库（`session_meta`）、`characters.sqlite`（自管 `user_version`）三类自管版本的接入各自实现同一接口（HOME-DATA 第 2 节）；Characters 并入宿主后它的 owner 是宿主或一个 Module，接入点跟着走。两个无版本库先由 W2-05 补版本。
3. **保护**：迁移前对要动的库取快照，用 W5-16 的离线快照（不用 C-4：C-4 依赖 C-2，不能反过来）；迁移失败回到快照并保持旧程序。迁移由常驻宿主在「维护态」做（AGENTS.md：一个 Home 只有一个执行进程，其他入口转发）；直连库的入口（CLI 和管理 MCP 在没给库路径时的默认库，`docs/system/HOME-DATA.md` 第 8 节）要先被版本检查挡住。
4. **跨库**：多个库的升级不可能原子；写一份「升级记录」（要升哪些库、升到了哪一步），中断后从记录续做或整体回快照 `[推断]`。
5. **门禁**：`tests/home-store-baselines.test.ts` 已把基线与存量库夹具比对；加「上一个发布版本的库夹具 → 迁移 → 与新基线逐表一致」的回放，发布清单里的各库版本表（W1-22）由登记生成。第一个外部版本没有「上一版」可回放，它的库夹具在发布时存下，从第二个外部版本起才有回放 `[推断]`。

**成本** 6–10 人日（机制 3–4、回放夹具 2–3、三类自管版本接入 1–3）。每个库以后每次升版本的迁移是各 owner 的日常工作，不计。**依赖**：W1-22（版本表，第 1 波）；W2-05（第 2 波）；W4-11（决定遍历哪些库，第 4 波）；W5-16（迁移前快照，第 5 波）；W1-13（窗口日期）。#15 已定。**风险**：项目库有 29 段建表（HOME-DATA 4.2），迁移粒度是库级版本还是分段要在机制里先定；多个常驻进程同时开库的时机。

### 3.3 C-3 自动更新（M2）

**方案**：

1. **更新单元**是整个 `.app`（含内嵌运行时）。F3 的现有流程在新 `.app` 启动时把运行时装进 Home 并修复服务，Home 里的程序发布又是原子换目录（F4），所以更新器只负责把新 `.app` 换到位并重启 `[推断，S5 验证]`。
2. **通道**：Tauri v2 的 updater 插件（`Cargo.toml` 已是 `tauri = "2"`）。更新包用 Tauri 自己的密钥对签名，与 Apple 证书无关；公钥写进 `tauri.conf.json`，私钥进 CI secret；产物（`.app.tar.gz`、`.sig`、`latest.json`）随 GitHub Release 发布，arm64 与 x64 各一条 `[未验证：按 Tauri v2 文档，S5 核实]`。
3. **体验**：启动时和每隔若干小时检查；发现新版只提示「重启以更新」，不静默安装；说明取自 CHANGELOG（W1-22）；可延后。升级前自动快照（C-2.3）。
4. **安全**：更新检查与安装由 Rust 侧发起，网页只收状态事件。更新命令**不进** `capabilities/default.json`：该文件对 `127.0.0.1:4173` 的页面开放 pty、capsule、shelf（F15），把安装更新放进去等于让任何同源页面能触发它。
5. **回滚**：程序可回滚（旧 release 目录仍在，F4），数据不能向后（库拒绝更新的版本）。所以「回到上一版」= 恢复升级前快照 + 旧程序，要做成一条命令，不能只靠换回旧 `.app`。
6. **自举**：已安装的 0.2.0 没有更新器（F3），第一台带更新器的构建必须手动安装 `[推断]`。
7. **旧 release 的保留**：当前不清理（F4），更新器上线前要定「保留当前 + 上一个」。dev 机上改名前的旧 release 是决定 #21 的一次性清理，不是这条规则。

**成本** 7–12 人日（插件与密钥 2–3、发布产物与清单 2–3、重启与服务衔接 1–2、旧 release 清理 1、双架构端到端 1–3），S5 另计 1–2。**依赖**：C-1（未公证的包无法稳定通过 Gatekeeper 首次运行 `[推断]`）；C-2；W5-16（升级前快照）；W1-22；D8（清单托管在哪）。**风险**：全量包大（F4：一份 release 目录解开约 334 MB），Tauri 没有原生的差量更新 `[未验证]`；更新时常驻服务与 MCP 转发进程的重启顺序。

### 3.4 C-4 定时在线备份（M2；决定 #20 把它留给本方案）

**前置（路线图已有，不重复计价）**：

- W4-11 单一 Home 存储登记：遍历哪些库、哪个 owner、备份类。决定 #20 要求清除（`uninstall --purge`）与备份读同一份登记，所以备份范围由登记的备份类决定，本方案不另写名单；HOME-DATA 第 7 节的 A–F 组是现状的描述。登记里包括 W2-12 带进来的 `server/server.sqlite`（#4，讨论页签在用）。
- W5-16 `molis-work home snapshot --to <dir>`：经常驻宿主静默、对每个库用 SQLite 备份 API、非 SQLite 状态一并带上、带版本与摘要的清单、完整性检查、版本不符拒绝恢复、测试盖满登记里的每个库。
- W5-17 目录库按 Home 与 `project_id` 推项目库路径（目录库 v22，决定 #21）：没有它，备份只能还原到原路径（F7）。

**C-4 在 W5-16 之上多出来的**（本方案只计这些）：① 周期触发；② 不停服的、有时限的静默；③ 去向、保留与失败处理；④ 恢复到新路径；⑤ 界面；⑥ 调度特有的测试。W5-16 已含的——SQLite 备份 API、完整性检查与摘要、清单与版本核对、恢复时拒绝版本不符、盖满登记的测试——不再在这里计价。

**方案**：

1. **执行者与触发**：常驻宿主的周期任务，登记在 W4-09 的周期任务清单里；不另起进程。错过的补跑（机器睡眠后）、上一次没跑完则跳过本次。
2. **静默**：W5-16 的静默是宿主暂停、不接新写（路线图原文：quiesce through the resident host）。1.14 GB 的活库（F8）上这段要多久不知道，由 S3 量 `[推断]`。定时备份在它上面加：静默有时限（默认秒级），超时放弃本次并记录；在静默里只固定各库的时点：每个库先 `wal_checkpoint`（`LocalSqliteStorage.checkpoint()`，F6）再做同卷的 APFS clone，文件型数据用 clone 或硬链接；耗时的复制放到静默外，对 clone 用备份 API 复制到去向。非 APFS 的卷退化为静默里直接复制。静默过长就退化为按组静默（A–F 组各自一个静默）`[推断，S3 量]`。
3. **去向**：默认写到用户选的另一个本地目录（外置盘），目录 0700、文件 0600。放进云同步目录等于把会话正文交给云盘，要用户明确选择，并看到密钥一节的提示。
4. **密钥与密文**：见下一小节与 D6。
5. **保留**：最近 N 份日备和 M 份周备；目标不可用、写满、连续失败时在设置里提示，超过 N 天没成功就提示。
6. **恢复**：在 W5-16 的恢复命令上加两点：写到新 Home 路径（依赖 W5-17）；清单里某个库的版本低于当前程序时，先走 C-2 的迁移再恢复（C-2 之前只能拒绝）。只在服务停止时恢复。
7. **界面**：设置里显示上次备份时间、立即备份、打开备份目录。

**密钥与密文（F18）。** 备份把 Home 里的数据拷到别处，数据密钥也在 Home 里，所以必须说清哪些密钥跟着走：

| 密钥 | 保护的数据 | 不带它恢复后 | 默认备份 |
| --- | --- | --- | --- |
| `sessions/content/content.key`（Home 内明文文件） | `sessions/content/blobs/` | 会话正文读不出；`blobs/` 非空时拒绝创建新钥匙，新会话正文也写不进去 | 含，与 `blobs/` 同一时点（HOME-DATA 组 B） |
| `agent-runtime/storage.key`，及 `plugin-builder/<project_id>/runs/<build>/storage.key`（Home 内文件） | `agent-runtime/records/` 与那份独立存储根里的加密正文 | 记录里的加密正文读不出 | 含（组 C 与 `plugin-builder/`） |
| 主密钥：Keychain、环境变量或 `feed/secrets.key` | `feed/secrets.json`（模型 Key、连接器凭据、Feed 证据与 Alchemist 检索正文的内容密钥） | 凭据要重新授权 `[推断]`；已有的 Feed 证据与 Alchemist 检索正文读不出，新写入落进 `-recovered-v2` 根 | **默认不含**主密钥、`secrets.json`、`secrets.key`，也不含靠它们读的 `feed/evidence*/` 与 `alchemist/projects/*/search-content*/` |

三条规则：① **密文与解开它的密钥同进同出**——有密钥的数据带着密钥，没有密钥的数据不带，这样恢复出来的 Home 不会留下读不出的 blob；② 含 `content.key` 的备份里，密钥与 blob 并排，谁拿到备份谁就能读会话正文，所以备份本身要按私人对话内容对待：默认位置由用户选并显示出来，权限 0700/0600，设置里写明，不自动放进云同步目录 `[推断：数据密钥在 Home 内与密文并排，加密防的是只拷走一半，不是拷走整个 Home]`；③ 要含主密钥与 `secrets.json`，就用口令加密整个备份包（复用 `file-secret-store.ts` 的 AES-256-GCM 与 scrypt），不把 Keychain 主密钥明文写进包里。W5-16 的离线快照同样要在这一点上定，所以 D6 要在第 5 波开工前决定，不是 M2 才问。恢复时缺主密钥的行为只读了代码，没有演练，S3 在拷贝上演练一次（恢复后连接器与模型供应商是否显示为待授权，Feed 与 Alchemist 的读写是否按 `evidence-content.ts:67-73,110-113` 走）。

**体量**（F8）：活库 1.14 GB，`sessions.db` 占约 89%，每次全量都以它为主；变更检测与增量放到备份稳定之后 `[推断]`。

**成本** 9–14 人日（周期任务与登记驱动 1–2、有时限静默与按组退化 2–3、去向与保留与失败处理 2–3、恢复到新路径与先迁移 1–2、界面 2、调度特有的测试 1–2）；口令加密整个包与云端去向再加 5–8，不在 M2。**依赖**：W4-09、W4-11、W5-16、W5-17、C-2；D6。**风险**：1 GB 库在线复制期间对写入的影响（S3 测）；备份目标不可用或写满；备份含私人对话，默认位置要让用户看得见。

### 3.5 C-5 可观测性与崩溃上报（A 在 M1，B 在 M2）

**A 本机，不联网（M1）**

1. **结构化日志**：W5-13 的最小 logger 替换宿主里的 `console.*`（F9：全仓 81 处，其中 `apps/local-host/src` 60 处，W5-13 写的范围是「宿主」，本文按 `apps/local-host/src` 的 60 处计，其余 21 处在 `apps/cli`（5）、`apps/desktop`（6）、`apps/server`（7）、`packages/ui-host`（2）、`server/tooling`（1），其中 CLI 与启动器的是面向终端的输出，不一定要换，由 W5-13 定 `[推断]`）。字段：时间、级别、组件、错误码，W3-01 落地后加 `call_id`。脱敏：不写正文、不写带用户名的路径、不写密钥（SSOT `packages/observability` 一行写的「安全脱敏」）。
2. **落盘与轮转**：宿主自己写 `<Home>/logs/` 下按日期的文件，按大小和天数轮转；launchd 的 stdout/stderr 文件只收启动失败。桌面直接启动的子进程日志去向 `[未验证]`，要读 `web_service.rs` 之外的启动代码确认。
3. **崩溃捕获**：Node 宿主装 `uncaughtException`/`unhandledRejection`（F9：现为 0 处），写 `<Home>/logs/crash/<时间>.json`（版本、各库版本、堆栈、最近日志摘录）后退出，由 launchd 的 `KeepAlive` 重启（`web-service-platform.ts:70-71`，间隔 5 秒）。Rust 侧装 `std::panic::set_hook` 写到同一目录，并为发布构建保留符号，否则 F10 的 `strip` 与 `panic=abort` 只留下系统崩溃报告。原生库（`better-sqlite3`、`node-pty`）段错误仍只有系统报告。
4. **`molis-work diagnostics export`**：把版本、平台、登记库的版本表（W4-11）、服务状态、最近日志、崩溃记录、最近调用的编号与结果（W3-01；与「设置 › 诊断」按编号列最近调用同一份数据，决定 #5）打成一个 zip，由用户决定发给谁。开关与入口放在「设置 › 诊断」，不是插件页面。

**成本 A**：5–8 人日（不含 W5-13）。

**B 可选上报，联网，默认关（M2）**

- 设置里显式开关，默认关；开启前预览将发送的字段。只发版本、平台、错误码、去路径的堆栈、库版本表；不发 Goal、项目、文件名、内容、路径。
- 去向（D3）：自建 Sentry 兼容端点、SaaS，或永远只手动发 zip。
- 模型调用一侧用 Prologue 的 exporter 槽（F11：审计投影成批外送、送前再脱敏、失败不改业务结果）。它不在现行 vendored 包里，要先把 SDK 升到含 `046251ec` 的上游提交；W1-20 草案把「前进到更新的上游头」列为第 5 步、另起一片、未排期、风险高（草案 §4.4）。所以 B 的宿主侧（崩溃与版本表）不等它，模型调用侧的外送等那一片，它的成本不在本文。

**成本 B**：6–10 人日（宿主侧），加端点运维与隐私评审。**依赖**：A；D3；模型调用侧另加 SDK 升级那一片。**风险**：本地优先的产品里遥测是信任问题，不是技术问题，所以默认关、先预览。

### 3.6 C-6 不依赖 `sandbox-exec` 的沙箱（M3，S1 先行）

**要满足的**（逐条来自 `seatbelt.ts:9-20` 与 `runner.ts:74`）：R1 只能读 Node、worker、插件包和系统库；R2 不能写文件；R3 不能联网；R4 不能创建进程；R5 有堆与 RSS 上限；R6 超时或撤销时整棵进程树被杀。网络与密钥由宿主一侧代理（F14），所以 R3 只要「沙箱里根本连不出去」。

**三个调用点要分开看**（F14）：`runner.ts` 执行不可信的插件代码，需要完整隔离；`build-checks.ts` 的类型检查和 `build-dependencies.ts` 的依赖解包只解析不可信数据，风险主要是时间和内存，不是代码执行 `[推断]`。

**候选**：

| 方案 | 做法 | 已知 | 不知道（S1 量） |
| --- | --- | --- | --- |
| A Node 权限模型 | `node --permission`，各 `--allow-*` 按需开 | 本机 Node 24.14.0 实验：读文件、起子进程、起 worker 都被拒（`ERR_ACCESS_DENIED`）；**连本机监听的 TCP 端口成功**，`node --help` 里也没有 `--allow-net`。所以单独用它满足不了 R3 | 官方对其安全定位、已知绕过 |
| B 按系统各一个后端 | macOS 继续 Seatbelt，或换成带 App Sandbox 的已签名 helper；Linux 用 bubblewrap 或 Landlock+seccomp；Windows 用 AppContainer/受限令牌 + Job Object | 体检报告 §3.3 写 Apple 已弃用 `sandbox-exec` 但仍可用 | 各系统的可用条件（如 CI 的 ubuntu runner 是否允许非特权用户命名空间）、Windows 要写原生 helper |
| C 单一后端：WASM 里的 JS 引擎（如 QuickJS）跑插件代码 | 引擎里本来没有文件和网络，只剩宿主消息通道；一份实现跨平台 | 现有 worker 本来只通过 JSON 消息和宿主代理说话（`runner.ts` 的 `send`/`receive`） | 现有 esbuild 产物能否运行、性能、内存与 CPU 限额、类型检查不适用 |
| D 容器 | — | 要求用户装 Docker，不适合桌面产品，排除 | — |

**推荐分步**（D4）：① 两个「解析数据」的调用点改走 A，加超时与 RSS 看门狗，使它们在非 macOS 上也能跑；② `runner.ts` 在非 macOS 上继续返回 `UNSUPPORTED_PLATFORM`（`runner.ts:41`），产品上写明「生成的插件目前只在 macOS 可用」；③ S1 出结果后在 B 与 C 之间选一个，再单独立项。macOS 上的 Seatbelt 保持，作为纵深。

**成本**：① 3–5 人日；B-Linux 6–10；B-Windows 15–25；C 15–25；S1 另计 2–3。**依赖**：S1；D4。**测试**：`tests/plugin-sandbox.test.ts:22` 在非 darwin 上整体跳过，新后端要有同一套用例在对应系统的 CI 上跑，否则等于没测。照决定 #14 的做法：新系统的作业先单独跑、不挡合并，约两周、隔离不稳定用例后加进 Verify，分支保护不改。

### 3.7 C-7 跨平台桌面（M3）

**分三层做，每层单独验收**：

- **L0 宿主 + CLI + 浏览器工作台在 Linux/Windows 上跑通**（npm 路径，`docs/installation.md` 「安装边界」）。要补的：常驻服务 provider（现在非 darwin 直接返回 `unsupported`，`web-service-detection.ts:7`；Linux 用 systemd `--user`，Windows 用计划任务 `[未验证]`）；主密钥后端（现在只有 darwin 走 Keychain，`file-secret-store.ts:145,166`；其余走 `aes-gcm-file` 兜底，把主密钥放文件里是否可接受要用户定，D6 一并问）；`node-pty` 在 Linux 要现编（F13）；先看 W1-11 的 ubuntu 通过率（S4）再修正本层估算。新系统的 CI 作业照决定 #14：先单独跑、不挡合并，约两周后并入 Verify。
- **L1 Windows 桌面壳**：Tauri 本身跨平台，但这是一次移植，不只是补 `cfg` 分支。
  - `main.rs` 的 24 行 macOS 分支（F12）要分成「核心」（窗口、托盘、PTY、外链）与「mac 专有」（Shelf 热键/拖拽/Drop wheel、剪贴板监听、红绿灯、胶囊透明窗、目录授权），后者在 Windows 上降级或重做。
  - 非测试代码里有不带 `cfg` 的 unix 假设：`web_service.rs:7` 引入 `std::os::unix::process::CommandExt`，`web_service.rs:219,224,235` 用 `/bin/kill`，`runtime_env.rs:5` 用 `/bin/zsh` 读登录环境，`main.rs:601,650` 用 `/usr/bin/mdfind` 与 `/usr/bin/open`；另有 `cfg(unix)` 的代码（`context_directories.rs:142,151`、`shelf_http.rs:445`）。这些在 Linux 上大多原样可用，所以 L2 比 L1 省。
  - 目录授权不在上面这张清单里：`context_directories_macos` 与 `context_directory_files` 两个模块整体由 `#[cfg(target_os = "macos")]` 门控（`main.rs:3-6`），后者的 `std::os::unix::fs`、`std::os::macos::fs` 引入（`context_directory_files.rs:10-11`）因此不会在 Windows 上编译；调用处在非 macOS 上返回「目录授权仅支持 macOS 桌面应用」（`context_directories.rs:170,243,288,313`）。所以它在 Windows 上是缺一项功能，不是要移植的代码；要不要做替代是产品决定，默认降级。
  - Node 运行时准备脚本现在是 macOS 专用 bash（`prepare-macos-runtime.sh`），要有 Windows 版；需要 Windows 代码签名（外部）`[未验证]`；更新器与发布矩阵加 `windows-latest`。
  - 视觉验收：W4-12 的像素比对在 macOS 的 Chrome 上做（路线图原文），Windows 壳要自己的基线 `[推断]`。
- **L2 Linux 桌面壳**：同 L1，加 AppImage 或 deb 打包与更新；排在 Windows 之后（D5）。

**素材 OCR/音视频**依赖 Swift 助手（`apps/local-host/native/materials/`），非 mac 已返回 `native_unavailable`（F12）；是否做替代是产品决定，本方案默认降级。

**成本**：L0 5–10 人日；L1 25–40；L2 15–25。**依赖**：S4（W1-11）；C-1/C-3 的 Windows 对应物；C-6（决定生成插件在新平台的状态）；W5-17（路径）。

### 3.8 C-8 私有 vendored 依赖（决定 #25 已定；本方案不计价、不排期）

决定 #25 已定：三个私有 tarball（`@prologue/sdk`、`@adeptify/intelligence-client`、`@adeptify/search-evidence-layer`）不再放进公开仓库，改从私有 registry 或 release 附件取；历史补丁删掉并记 sha256 与来源。怎么取、什么时候做、花多少，在 W1-20 的方案和执行片里（路线 W1-20，以及 W1-23「vendored provenance and patch cleanup」）。W1-20 草案（分支 `docs/deps-and-sdk-plan`，未合入，本文未复核其中的外部事实）推荐私有仓库的 release 附件加仓库内清单与校验和，理由之一是 GitHub Packages 不改包名托管不了这三个包（草案 §5.2）；机制以 W1-20 合入后的为准。

C 端只补三条**后果**，都是事实或顺序，不是新的工作量：

1. **再分发答复只问一次**：`@prologue/sdk` 无 license 且 `private: true`（F16），却会进 DMG 的运行时载荷和 npm 包。这个问题 W1-20 草案的 §7.2 已经要问 Prologue 的负责人，本方案不另问，只记一条依赖：没有书面答复，M1 的公证包只能内部用。
2. **先清理再出第一个公开安装包**：现在发布物带的不只是编译后的 SDK，还有 26 个 Prologue 源码补丁（F16）。W1-20 草案 §5.5 要让发布资产不再带 `*.tgz` 与 `*.patch`，W1-23 含补丁清理（第 1 波）；草案里取包机制与删 tgz 的步骤（§4.4 第 2–4 步）没有对应的路线片和波次。无论排在哪里，都要在第一个公开安装包之前完成，否则第一个公证包仍带着补丁。清理后 C-8.1 的范围缩到编译后的 SDK 与两个 adeptify 包。
3. **CI 凭据**：私有源需要凭据，W1-20 草案要求 `release-macos.yml` 的 build 作业在安装依赖前取包（草案 §5.4），C-1 的签名步骤排在它之后；来自 fork 的 PR 拿不到密钥（草案 §5.4）。这些归 W1-20，本方案只在 §9 登记它与 C-1 改同一个文件。

「减少私有包的个数」（把两个 MIT 的 adeptify 包公开发布，私有的只剩 `@prologue/sdk`）不在决定 #25 里，也没人排期；它需要 `adeptify/trick-catalog` 仓库的所有人同意（F16：本账号解析不到该仓库）。本方案只记下这个想法，不计价。

### 3.9 相邻：第三方插件安装（方案归 W1-15；信任模型已定）

决定 #11（只写计划）：`molis-work plugin install <bundle>`；首次安装由用户确认并记住发布者密钥；插件在独立进程的沙箱里运行。现状：`verifyPluginPackage` 只有 `tooling/plugin-cli/src/package-signing.ts`（`cli.ts` 经 `verifyPluginPackageFile` 调它）和 `tests/plugin-package.test.ts` 调用（grep 全仓，命令在 §10），产品里没有安装已签名第三方包的路径，也没有存放被记住的发布者公钥的地方。缺的两样正是：信任根（已定：首次确认并固定发布者密钥）和第三方代码在进程外隔离执行。

对 C 端的约束：

1. 在 macOS 上进程外沙箱已有（`runner.ts` 的 Seatbelt，F14），所以第三方安装在 macOS 首发不必等 C-6；第三方包是否直接走 `runner.ts` 由 W1-15 的方案定 `[推断]`。
2. 其他系统在 C-6 有继任者之前不能运行第三方代码，产品上与生成插件一样写明「仅 macOS」（D4 ①）。
3. 被记住的发布者公钥是 Home 里的新存储，要在 W4-11 的登记里给备份类；丢了可以重新确认，但授权类的文件（如 `config/mcp-tools.json`）在 HOME-DATA 里按「必备份」对待，建议同类 `[推断]`。

## 4. 依赖与顺序

### 4.1 和防腐路线各波的对应

C 端各项不在路线的 87 片里（任务书 §4.19 只要方案）。它们依赖路线里的片，那些片的波次决定 C 端最早什么时候能做完。波次和片名见 `spec.md` §10 与 `roadmap-2026-10-07.md`。

| 防腐波 | 本方案用到的片 | 状态（2026-10-08） | 本方案此时能做什么 |
| --- | --- | --- | --- |
| 1 | W1-09 Rust 的 rustfmt/clippy 进 CI；W1-11 ubuntu 探针（即 S4）；W1-13 `CONTRACT-CHANGES.md`；W1-15 第三方安装方案；W1-16 HOME-DATA；W1-20 依赖与 SDK；W1-22 版本策略 | 只有 W1-16 在 main；W1-20、W1-22 有分支未合入；其余未合入 | 探针 S1–S5（S4 即 W1-11）；D 类决定；C-1 在 W1-20、W1-22 合入后开工（三者都改 `release-macos.yml`）；Prologue 再分发答复由 W1-20 去问 |
| 2 | W2-05 两个无版本库补版本；W2-12 `server.sqlite` 进登记；W2-16 CI 产品子集第二步；W2-19 安全不变量测试 | 未合入 | C-2 的机制与回放夹具可以开始（所有库有版本之后才能遍历）；C-1 可收口 |
| 3 | W3-01 `call_id`；W3-06 Runtime 插件平台服务（W4-11 的前置） | 未合入 | 没有 C 端项能单独完成；C-5A 的 `call_id` 字段随 W3-01 |
| 4 | W4-09 周期任务登记；W4-11 Home 存储登记；W4-12 视觉比对；Characters 并入宿主（#26，第 4 波切片） | 未合入 | C-2 遍历登记；C-4 的任务登记；C-5A 的库版本表 |
| 5 | W5-13 logger；W5-15 切下一版；W5-16 离线快照；W5-17 目录库路径派生 | 未合入 | **M1 收口**：C-2 的迁移前快照（W5-16）、C-5A（W5-13）；C-4 的恢复到新路径（W5-17） |
| 6 | W6-05 最终回归；W6-06 交付汇总 | 未合入 | 路线结束；M2、M3 此后 |

逐项的最早开工与最早收口（`[推断]`，由上表的依赖得出）：

| 项 | 最早开工 | 最早收口 | 卡在 |
| --- | --- | --- | --- |
| M0 探针 S1–S5 | 现在 | 第 1–2 波内 | 无；S4 就是 W1-11 |
| C-1 公证 | 第 1 波内，W1-20、W1-22 合入后 | 账号到位后 | D8；Apple 账号 |
| C-2 升级策略 | 机制：W2-05 之后（第 2 波） | 第 5 波 W5-16 之后（迁移前快照挂上） | 遍历要 W4-11（第 4 波）；快照要 W5-16 |
| 离线快照 W5-16 | 第 5 波 | 第 5 波 | W4-11 ← W3-06（第 3 波，L 级）；D6 |
| C-5A 本机诊断 | W5-13 之后 | 第 5 波 | W5-13 只依赖 W1-09；版本表要 W4-11 |
| **M1 整体** | | **第 5 波 W5-13、W5-16 之后** | |
| C-3 更新 | M1 之后 | | C-1、C-2、W5-16 |
| C-4 定时备份 | W4-09、W4-11、W5-16、W5-17 之后 | | C-2、D6 |
| C-5B 上报 | C-5A 之后 | | D3；模型侧要 SDK 升级那一片 |
| M3 | M2 之后 | | S1、S4 的结果 |

几点：

- **M1 不是第 1 波之后就能并行做完的**。它的前置片 W5-16 在第 5 波，向上追 W4-11（第 4 波）和 W3-06（第 3 波）；只有 C-1 与探针可以现在开始。想让 M1 更早，只能前移前置片，选项在 D1。
- **窗口在第一个外部版本关闭**（§3.2）。W5-15 会按版本策略切「下一版」0.3.0（路线图 W5-15；spec §1 的 2026-10-08「版本与发布策略」行）。它是不是第一个外部版本由用户定（D1）：是，则 M1 要在它之前完成；不是，它只是开发机版本，窗口继续开着，C-2 的迁移要求从之后的某个版本才开始。
- **库版本变更要在第一个外部版本之前做完**：W2-05、W5-17、Characters 并入宿主，之后每次都要写迁移。
- **F15 不等 M3**：桌面 IPC 的范围是现在就存在的安全问题，转给 §4.18 的 W2-19（第 2 波），不留给 S5（S5 在更新器那一项，晚得多）；见 D9。

### 4.2 里程碑内的依赖

- **M0**：D1、D3、D4、D6、D8 与 S1–S5 先做完。
- **M1**：
  - C-1 公证 ← D8、W1-20、W1-22
  - C-2 数据升级策略 ← #15（已定）、W1-22、W2-05、W4-11、W5-16、W1-13
  - C-5A 本机诊断 ← W5-13（W3-01、W4-11 补字段）
  - 前置：W5-16 离线快照 ← W4-11 ← W3-06；D6
  - 外部门槛：Prologue 负责人对再分发的答复（W1-20 去问）
- **M2**（M1 完成后）：
  - C-3 自动更新 ← C-1、C-2、W5-16、W1-22、D8
  - C-4 定时备份 ← W4-09、W4-11、W5-16、W5-17、C-2、D6
  - C-5B 可选上报 ← C-5A、D3；模型侧另 ← SDK 升级那一片
- **M3**（M2 之后，S1、S4 的结果决定内容）：
  - C-6 沙箱继任者 ← S1、D4
  - C-7 L0（宿主跑通）← S4（W1-11）；L1（Windows 桌面）← L0、C-1/C-3 的 Windows 对应物
  - §3.9 第三方插件 ← W1-15 的方案；非 macOS 的运行 ← C-6

顺序的理由：M1 的三件每一件单独缺了，第二台机器上的第一次使用就出问题；M2 的更新器会让「库版本不符即拒绝」变成每次发版都可能触发的事故，所以必须排在 C-2 与快照之后；M3 最贵也最不确定，放最后并先探针。D1 的备选顺序见 §8。

## 5. 成本汇总

人日是乐观–保守，`[推断]`；不含 W 系列已在路线图计价的前置（W4-09、W4-11、W5-13、W5-16、W5-17、W2-05）。

| 项 | 里程碑 | 人日 | 外部等待 | 主要依赖 |
| --- | --- | --- | --- | --- |
| 探针 S1–S5 | M0 | 5–9 | — | — |
| C-1 公证签名 | M1 | 4–7 | Apple 账号与证书 | D8、W1-20、W1-22 |
| C-2 数据升级策略 | M1 | 6–10 | — | W1-22、W2-05、W4-11、W5-16 |
| C-5A 本机诊断与崩溃记录 | M1 | 5–8 | — | W5-13 |
| **M1 合计** | | **15–25** | Prologue 负责人的再分发答复（W1-20 去问，不计人日） | |
| C-3 自动更新 | M2 | 7–12 | 更新清单托管 | C-1、C-2、W5-16 |
| C-4 定时在线备份 | M2 | 9–14 | — | W4-09、W4-11、W5-16、W5-17、C-2 |
| C-5B 可选上报（宿主侧） | M2 | 6–10 | 端点运维、隐私评审 | C-5A |
| **M2 合计** | | **22–36** | | |
| C-6 沙箱：A 两个数据点 | M3 | 3–5 | — | S1 |
| C-6 沙箱：B-Linux / B-Windows / C 三选 | M3 | 6–10 / 15–25 / 15–25 | — | S1、D4 |
| C-7 L0 / L1 / L2 | M3 | 5–10 / 25–40 / 15–25 | Windows 代码签名证书 | S4、C-1/C-3 |
| C-8 私有 vendored 依赖 | — | 不计（决定 #25，归 W1-20） | — | — |

M1 合计是前三项之和（4+6+5 至 7+10+8）。M2 合计是三项之和（7+9+6 至 12+14+10）。C-4 只计 W5-16 之上多出来的部分（§3.4），C-8 不计（决定 #25，§3.8）。M3 的下限 30–50 是只做 C-7 的 L0 与 L1（5+25 至 10+40）；上限 54–90 再加沙箱 A 与 B 的 Linux、Windows 两个后端（3+6+15 至 5+10+25，合计 24–40）。两个区间都不含 L2 和 WASM 路线。C-5B 的模型调用侧（要先升级 SDK）、口令加密备份包与云端去向（再加 5–8）、C-4 之外的 SDK 升级都不在表里。

## 6. 探针（先量再定，不写产品代码）

| # | 要回答的 | 做法 | 成本 | 决定哪一项 |
| --- | --- | --- | --- | --- |
| S1 | 沙箱继任者里谁能满足 R1–R6 | ① 用 QuickJS-WASM 跑 `tests/plugin-sandbox.test.ts` 和 2–3 份创作台产物，量耗时与内存；② 在 ubuntu runner 上试 bubblewrap 的等价配置；③ 读 Node 24 权限模型文档，列已知绕过，量类型检查与解包的耗时和内存 | 2–3 人日 | D4、C-6 |
| S2 | 内嵌运行时能否在 hardened runtime 下运行并过公证 | 在载荷的临时副本上枚举 Mach-O，用 ad-hoc 加 `--options runtime` 签后运行 Node 与各原生插件，记下缺哪些 entitlements；有账号后提交一次真实公证看拒绝信息 | 1–2 人日 | C-1 的成本区间 |
| S3 | 在线备份的耗时、对写入的影响、跨库一致的静默要多久；缺主密钥时恢复的行为（C-4 密钥一节） | 只在 Home 的**拷贝**上做（来源：Home 的 APFS 克隆，或决定 #21 保留的 `~/molis-work-backups/2026-10-07-before-maint3`），不打开在用的 Home 的库：逐库 `backup()` 计时，对 1 GB 的会话库在并发写下测延迟；演练「恢复后没有主密钥」 | 1–2 人日 | C-4 的设计与区间、D6 |
| S4 | Linux 上现有非浏览器用例的通过率 | 就是 W1-11 的 ubuntu 探针，不另做 | 0 | C-7 L0 的区间 |
| S5 | Tauri 更新器能否与「内嵌版本更新才装进 Home」的流程衔接，以及网页是否碰不到更新命令 | 一个一次性构建加测试密钥，换 `.app` 后观察 Home 与服务；用同源页面直接调 IPC 验证 F15 | 1–2 人日 | C-3；F15 的结论同时交给 W2-19（D9） |

## 7. 本方案不覆盖

体检报告 §3.3 其余各行的归属：BYOK 首次引导（模型行，产品引导，不在防腐范围）；浏览器代码打包与 source map（W5-04）；错误基类与错误码（W3-02）；多代皮肤叠加（W5-05）；文档漂移（W1-02、W1-06）。移动端、云端同步、账号体系不在任务书里。

IM 线（`server/`、`apps/server`、`packages/im-ui`）不是 C 端七项之一，但也不是待删的实验：右栏「讨论」页签是在用、还会迭代的功能（决定 #4）。SSOT 现在把 `apps/server` 与 `packages/im-ui` 标为实验（`docs/SSOT-MATRIX.md:51,69`）；决定 #4 说它不是待删的实验，包的归类要改成业务（不是基础包），SSOT 行随 W2-12 修。它对 C 端的影响只有数据：`server/server.sqlite` 进 Home 登记、owner 表和备份类（W2-12），所以 C-2、C-4 遍历登记时会遇到它。`apps/server` 独立启动器的去留另定；SSOT 写它不随 Desktop/npm 发布（`docs/SSOT-MATRIX.md:51`，本文未核对）。跨设备接续的 `packages/exchange` 在 SSOT 里是 `absent`（`docs/SSOT-MATRIX.md:64`），不是 C 端就绪的一部分。

## 8. 待用户决定

选项后标「（推荐）」的是我的建议。已定的不再问：升级策略何时从「拒绝」转为「迁移」（决定 #15，§3.2）；私有包（决定 #25，§3.8，再分发答复由 W1-20 去问）。编号 D2、D7 因此空缺。

| # | 问题 | 选项 | 为什么 |
| --- | --- | --- | --- |
| **D1** | 顺序，以及 M1 的前置片要不要前移 | ① M1→M2→M3 如 §4，前置片按路线图原波次（推荐）；② 同①，另把三片前移：W5-13 的 logger 部分（它只依赖 W1-09）、W4-11 的宿主自有库登记部分（不等 W3-06 `[推断]`）、W5-16——需要路线负责人拆片并改 spec §10；③ 定时备份提前到 M1（M1 加 9–14 人日）；④ Windows 提前、不等更新器与备份。另外要答：W5-15 切的 0.3.0 是不是第一个外部版本 | M1 只要求离线快照（升级和迁移前自动取），定时备份是便利；路线里的几个前置片本来就在降低 M1 的成本（登记、logger、快照），前移要先确认它们能拆。0.3.0 是不是第一个外部版本决定「不留兼容」窗口的结束点（§4.1）。Windows 提前会让没有更新器、没有备份的版本先到更多人手里 |
| **D3** | 诊断与上报 | M1 只做本机诊断和手动 zip，M2 起可选上报、自建端点、默认关（推荐）；一开始就上 SaaS；永不联网 | 本地优先的产品里，遥测先要用户信任；手动 zip 零基础设施。SaaS 涉及数据驻留与合同。入口在「设置 › 诊断」（决定 #5 已把调用编号放在那里） |
| **D4** | 沙箱继任者 | ① 先只做两个数据点并声明生成插件仅 macOS，S1 出结果后在按系统各一个后端与 WASM 单一后端之间选（推荐）；直接做按系统三个后端；直接做 WASM | S1 只要 2–3 人日，能把 15–25 人日的两条路的风险量出来。生成插件是进阶能力，新平台首发可以不带；第三方插件在非 macOS 上也随它（§3.9） |
| D5 | 平台顺序 | M3 内先 L0（宿主跑通）再 Windows 桌面，Linux 桌面不排期（推荐）；Linux 先；只做 macOS | Windows 用户面更大；Linux 的 CI 已在 ubuntu，所以 L0 成本最低，用它的通过率修正后面的估算 |
| **D6** | 备份里的密钥（W5-16 开工前要定）；非 darwin 的主密钥后端 | ① 随数据的密钥（`content.key`、`agent-runtime/storage.key`）进每份备份；主密钥与 `secrets.json` 默认不含，靠它们读的 Feed 证据与 Alchemist 检索正文也不含；备份目录 0700、文件 0600，界面写明含私人对话（推荐）；② 口令加密整个包，含所有密钥（再加 5–8 人日，含云端去向）；③ 所有密钥都不进备份。非 darwin 的主密钥：先用 `aes-gcm-file` 兜底并在设置里写明（推荐）；口令加密；云端去向 | 数据密钥在 Home 里与密文并排（F18）：不带它们，恢复后会话正文读不出且新写入失败，所以③ 只有在接受丢会话正文时才成立；带它们，备份就等同于带着可读的会话正文，所以要当私人内容对待（规则见 §3.4）。不含主密钥最简单也最不容易泄露；把主密钥放文件意味着磁盘被拷走就能解密，要用户明确接受 |
| **D8** | 账号与托管 | Apple 开发者账号用谁的名义、Windows 签名走哪条路、更新清单放在哪（GitHub Release 或自有域名） | 签名人名会出现在用户看到的系统提示里；清单地址写进每个已发出的安装包，换起来要发一版 |
| D9 | 路线增补：桌面 IPC 范围（F15） | 把「桌面 IPC 的来源范围」补进 W2-19 的清单，作为一条要有拒绝断言的不变量（推荐）；留给 C-3 的 S5；不处理 | §4.18 普查把「桌面 Tauri IPC 范围：未核实、没有测试」列为缺失，但 W2-19 的清单没写这一项。这是现在就存在的安全问题（pty 等权限开给整个 `127.0.0.1:4173` 来源，csp 为 null），不该等到更新器才查 |

## 9. 与其他片的接口（核对点）

状态按 2026-10-08 的 main 与本机分支。「分支」栏的内容我读过的只有 W1-20、W1-22 两条。

| 片 | 本文用了它的什么 | 状态 | 变了要改本文哪里 |
| --- | --- | --- | --- |
| W1-16 | `docs/system/HOME-DATA.md` 第 2、3.1、6.1、6.2、6.3、7、8、9、10、11 节 | 已在 main | §2 F5–F8、F18，§3.4 |
| W1-20 | 私有包的取包机制与 CI 凭据（草案 §5）、再分发问题（草案 §7.2）、SDK 升级是单独一片（草案 §4.4 第 5 步）、对 `ci.yml`、`release-macos.yml` 的改动 | 分支 `docs/deps-and-sdk-plan`（草案，未合入） | §3.1（`release-macos.yml` 行号与步骤顺序）、§3.5 B、§3.8；F1、F2 的行号 |
| W1-22 | 版本策略、CHANGELOG、各库版本表；把 `verify-release-versions.mjs` 从 `apps/desktop/tooling/` 搬到 `scripts/`；改 `release-macos.yml` 的「Verify tag and package version」一步与 `ci.yml` | 分支 `docs/release-policy`（未合入） | §3.1、§3.2、§3.3；F1、F2、F17 的路径与行号 |
| W1-13 | `docs/system/CONTRACT-CHANGES.md` 里写第一个外部版本的日期 | 未合入 | §3.2 |
| W1-11 | ubuntu 探针 | 未合入 | §3.7、S4 |
| W1-15 | 第三方插件安装方案 | 未合入 | §3.9 |
| W1-09 | Rust 的 rustfmt/clippy 进 CI；W5-13 的前置 | 未合入 | §3.7 L1 的改动面、§3.5 A |
| W2-05 | 两个无版本库补版本 | 未合入 | §3.2 |
| W2-12 | `server/server.sqlite` 进登记与备份类；SSOT 的 IM 行改归类 | 未合入 | §3.4、§7 |
| W2-19 | 安全不变量清单（D9 要补桌面 IPC） | 未合入 | F15、D9 |
| W3-01 | `call_id` | 未合入 | §3.5 A |
| W3-06 | W4-11 的前置（路线图 W4-11 的依赖栏） | 未合入 | §4.1、D1 |
| W4-09、W4-11 | 周期任务登记、Home 存储登记 | 未合入 | §3.4、§3.2 |
| W5-13、W5-16、W5-17 | 结构化 logger、`home snapshot`、目录库路径派生 | 未合入 | §3.5 A、§3.4、§3.2 |
| W5-15 | 切下一版（0.3.0） | 未合入 | §4.1、D1 |
| 决定 #20、#21 | 备份范围、真实 Home 残留（均已定） | spec §1（PR #312） | §0.1、§3.4、F4、F8；#21 清理做完后重量 F4、F8 |
| 决定 #11、#14、#15、#25 | 第三方信任、CI 子集、不留兼容窗口、私有包（均已定） | spec §1（PR #312） | §0.1、§3.2、§3.6–§3.9 |

## 10. 复现命令

在仓库根执行，基线 main `f8ea20b9`。

```bash
# F2 签名/公证字样为空（退出码 1 = 无匹配）
grep -rn "entitlement\|hardened\|--options runtime\|notarytool\|stapler" apps/desktop .github docs scripts package.json | grep -v node_modules

# F5 baseline 调用点：13 处直接调用（不含 helper 自己），7 处经 openBaselineHomeSqlite
grep -rn "applySqliteBaseline(" apps packages horizontal modules plugins server --include='*.ts' --include='*.mts' --exclude-dir=node_modules --exclude-dir=dist | grep -v "^packages/storage/src/sqlite-baseline.ts" | grep -v "\.test\." | wc -l   # 13
grep -rn "openBaselineHomeSqlite(" apps packages horizontal modules plugins server --include='*.ts' --include='*.mts' --exclude-dir=node_modules --exclude-dir=dist | grep -v "export function\|\.test\." | wc -l   # 7

# F6 备份 API、F9 日志与崩溃
grep -rn -e '\.backup(' -e 'VACUUM INTO' apps packages horizontal modules plugins server scripts tooling --include='*.ts' --include='*.mts' --include='*.mjs' --exclude-dir=node_modules --exclude-dir=dist
grep -rn "console\.\(log\|error\|warn\|info\|debug\)" apps packages horizontal modules plugins server tooling --include='*.ts' --include='*.mts' --exclude-dir=node_modules --exclude-dir=dist | grep -v "/client/\|\.d\.ts" | wc -l   # 81
grep -rn "console\.\(log\|error\|warn\|info\|debug\)" apps packages horizontal modules plugins server tooling --include='*.ts' --include='*.mts' --exclude-dir=node_modules --exclude-dir=dist | grep -v "/client/\|\.d\.ts" | grep "apps/local-host/src" | wc -l   # 60
grep -rn "uncaughtException\|unhandledRejection" apps packages horizontal modules plugins server --include='*.ts' --exclude-dir=node_modules --exclude-dir=dist | wc -l   # 0
grep -n "packages/observability" docs/SSOT-MATRIX.md   # 第 67 行

# F12 平台绑定
grep -c 'target_os = "macos"' apps/desktop/adapters/tauri/src/main.rs   # 24
grep -rn 'target_os = "macos"' apps/desktop/adapters/tauri/src | wc -l   # 40
grep -rn 'process\.platform\|"darwin"' apps packages horizontal modules plugins server --include='*.ts' --exclude-dir=node_modules --exclude-dir=dist

# C-7 L1：哪些 Rust 模块由 macOS 门控，哪些 unix 假设没有门控
sed -n 1,12p apps/desktop/adapters/tauri/src/main.rs
grep -n "std::os::unix\|cfg(unix)\|/bin/kill\|/bin/zsh\|/usr/bin/mdfind\|/usr/bin/open" apps/desktop/adapters/tauri/src/*.rs

# F14 三处 sandbox-exec
grep -n "sandbox-exec" packages/plugin-sandbox/src/runner.ts apps/local-host/src/plugin-builder/build-checks.ts apps/local-host/src/plugin-builder/build-dependencies.ts

# F11 上游 exporter 槽不在 vendored 基线（需要本机的 Prologue 仓库）
git -C ~/code/prologue merge-base --is-ancestor 046251ec af7375c7 || echo "不在 af7375c7 里"
git -C ~/code/prologue merge-base --is-ancestor 046251ec 9fc3b173 || echo "不在 9fc3b173 里"

# F16 随发布带走什么（需要本机装过 0.2.0）
ls ~/.molis-work/releases/molis-work-0.2.0/vendor/prologue-sdk | grep -c patch   # 26
ls ~/.molis-work/releases/molis-work-0.2.0/vendor/prologue-sdk | grep -c tgz     # 0
ls ~/.molis-work/releases/molis-work-0.2.0/node_modules/@prologue/sdk            # README.md dist package.json

# F18 数据密钥的位置与"有 blob 无密钥就拒绝"
grep -n "content.key\|session content key unavailable" modules/private-work-context/src/content-store.ts
grep -n "evidence-content-key\|feed evidence content key unavailable\|useRecovery" packages/storage/src/adapters/evidence-content.ts

# §3.9 verifyPluginPackage 的使用者
grep -rlw "verifyPluginPackage" apps packages horizontal modules plugins server tooling tests scripts --include='*.ts' --include='*.mts' --include='*.mjs' --exclude-dir=node_modules --exclude-dir=dist

# F8 体量（只读元数据）
find ~/.molis-work \( -name '*.db' -o -name '*.sqlite' \) -not -path '*/releases/*' -not -path '*/maintenance-3-replaced/*' -not -path '*/runtime-config-backups/*' -type f -exec stat -f '%z' {} + | awk '{s+=$1; n++} END {print n, s}'   # 145 1138720768（dev 机）
```

Node 权限模型实验（§3.6 方案 A，Node 24.14.0）。把下面存成 `probe.mjs`，分别 `node --permission probe.mjs` 和 `node probe.mjs`：

```js
import net from 'node:net';
import fs from 'node:fs';
import cp from 'node:child_process';
const r = {};
try { fs.readFileSync('/etc/hosts'); r.fsRead = 'allowed'; } catch (e) { r.fsRead = e.code; }
try { cp.spawnSync('/bin/echo', ['x']); r.spawn = 'allowed'; } catch (e) { r.spawn = e.code; }
try { new (await import('node:worker_threads')).Worker('1', { eval: true }); r.worker = 'allowed'; } catch (e) { r.worker = e.code; }
const server = net.createServer((s) => s.end('hi'));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
r.net = await new Promise((resolve) => {
  const c = net.connect({ host: '127.0.0.1', port: server.address().port }, () => resolve('connected'));
  c.on('data', () => c.destroy());
  c.on('error', (e) => resolve('error:' + e.code));
});
console.log(JSON.stringify(r));
process.exit(0);
```

本机结果：带 `--permission` 时 `fsRead`、`spawn`、`worker` 都是 `ERR_ACCESS_DENIED`，`net` 是 `connected`；不带时四项都放行。
