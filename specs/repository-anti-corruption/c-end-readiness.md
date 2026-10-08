# C 端就绪方案（§4.19，只出方案）

状态：方案（W1-21，2026-10-08），等用户在 §8 决定；本文不实现任何一项。基线 main `f8ea20b9`。

任务要求：`docs/prompts/repository-anti-corruption.md` §4.19 与交付第 22 项（C 端就绪方案）。进度与决策记录在同目录 [spec.md](spec.md)，普查证据在 [roadmap-2026-10-07.md](roadmap-2026-10-07.md) 的 §4.19 一节；缺口清单最早见 `docs/prompts/code-health-report-2026-09-30.md` §3.3。

## 0. 怎么读

- **范围**：任务书点名的七项（公证签名、自动更新、崩溃上报与可观测性、在线备份、跨平台桌面、不依赖 `sandbox-exec` 的沙箱、减少私有 vendored 依赖），加数据升级策略（§3.2，自动更新与备份的前置），以及与第三方插件安装的接口（§3.9，方案归 W1-15）。体检报告 §3.3 里的 BYOK 引导、浏览器代码打包、错误基类、皮肤叠加不在本文（§7 写明归哪一片）。
- **标注**：`[已确认]` 读了代码或跑了命令（命令在 §10）；`[推断]` 由已确认的事实推出；`[未验证]` 靠外部工具的文档记忆或需要账号才能验证，对应的探针在 §6。
- **成本口径**：人日是一个熟悉该处代码的工程师的理想工作日，不含评审等待和外部等待；写成「乐观–保守」区间。依据是本文写出的代码规模与调用点个数，不是做过的测量，一律是 `[推断]`。外部等待（账号、证书、他人答复）单列，不折成人日。
- **不能违反的硬约束**（`AGENTS.md`）：一个 Home 只有一个执行进程，所以备份、迁移、日志轮转都由常驻宿主做，不另起进程；模型调用只经 `horizontal/agent-host`，所以 Prologue 的 exporter 槽也从那里接；插件只提供内容、不出自己的整页，所以更新、备份、上报的开关都进宿主设置，不是插件页面；密钥只给引用，所以诊断包和上报里不出现密钥本体，备份默认也不含（D6）。
- **依赖片**：W1-16（`docs/system/HOME-DATA.md`）已在 main，本文直接引用它的第 7、8、11 节。W1-20（依赖与 SDK 计划）在写，本文只引用路线图对它的定义和 spec §1 的 2026-10-08 决定；它入库后按 §9 的清单核对。
- **不动 spec §1 的决策表**：§8 的决定还没做，不写进去；用户决定后，由收到答复的会话把结论写成 §1 的一行，实现按里程碑拆 PR，条目进 `specs/BACKLOG.md`（`specs/README.md`：未完成只记在那里）。

## 1. 结论

**现在离「装到别人的机器上」差的，按用户会先撞上的顺序**：没有公证（首次打开被 Gatekeeper 拦）、升级后打不开旧库（存储版本不符就拒绝，没有升级链）、出问题没有可发回的诊断、核心 AI 包的再分发许可没有书面答复。这四件加上前置的离线快照，构成第一个里程碑 M1。自动更新、定时在线备份、可选上报是第二个（M2），它们依赖 M1 的公证、升级策略和快照。沙箱继任者和 Windows/Linux 是第三个（M3），并且是整套里最不确定的两项，先用探针量一次再定。

**建议顺序与总成本**（细表见 §5）：

| 里程碑 | 内容 | 人日（乐观–保守） | 外部等待 |
| --- | --- | --- | --- |
| M0 探针与决定 | §6 的 5 个探针 + §8 的 8 个决定 | 5–9 | 用户答复 |
| M1 能装到第二台 mac | 公证签名、数据升级策略、本机诊断与崩溃记录、私有包许可清理（前置：W5-16 离线快照） | 15–25 | Apple 开发者账号与证书；Prologue 负责人的许可答复 |
| M2 保持更新、不丢数据 | 自动更新、定时在线备份、可选崩溃上报、私有包改私有源 | 27–44 | 更新清单托管；上报端点 |
| M3 不止 macOS | 沙箱继任者；Linux/Windows 先跑通宿主，再做 Windows 桌面 | 30–50（只做跨平台）至 54–90（含按系统的沙箱后端） | Windows 代码签名证书 |

**要用户先定的四件**（其余四件可以边做边定）：顺序（D1）、升级策略何时从「拒绝」转为「迁移」（D2）、诊断与上报怎么做（D3）、沙箱继任者（D4）。每件的选项与推荐在 §8。

## 2. 现状（方案依赖的事实）

| # | 事实 | 出处 | 标注 |
| --- | --- | --- | --- |
| F1 | 发布只能手动触发，矩阵只有 macOS arm64（`macos-15`）与 x64（`macos-15-intel`）；CI 三个 job 都在 `ubuntu-latest` | `.github/workflows/release-macos.yml:4-5,17,19`；`.github/workflows/ci.yml:22,100,131` | 已确认 |
| F2 | 签名与公证的路径已接好：6 个 `APPLE_*` secret 齐了才导入 Developer ID 证书并构建；tag 构建缺凭据直接失败；没有凭据只出 ad-hoc 包（`signingIdentity: "-"`）。仓库里没有 entitlements、hardened runtime、`notarytool`、`stapler` 的任何字样，公证全靠 Tauri CLI 读环境变量。调查记录 `gh secret list` 无输出，本片没有复核，按「没有凭据」处理 | `release-macos.yml:23,50-51,58,65,74`；`apps/desktop/src-tauri/tauri.macos.conf.json:4`；`apps/desktop/tooling/build-macos-release.sh:23,36`；对 `apps/desktop .github docs scripts package.json` grep 上述词为空 | 已确认（secret 一项：调查记录） |
| F3 | 桌面没有更新器：`tauri` 只开 `tray-icon`、`macos-private-api`。升级靠重下 DMG：内嵌运行时仅当版本比 Home 里新才装进 Home，装完修复常驻服务 | `apps/desktop/src-tauri/Cargo.toml`（依赖段）；`apps/desktop/adapters/tauri/src/web_service.rs:93-106,198-212,279-292` | 已确认 |
| F4 | Home 里程序发布是原子换目录并带失败回滚；没有清理旧 release 的代码。dev 机 `releases/` 约 2.0 GB，其中改名前的 11 个版本约 1.7 GB；一份 release 目录解开约 334 MB | `apps/local-host/src/installer/home-release.ts:242-275`；`docs/system/HOME-DATA.md` 第 10 节；`du`（§10） | 已确认 |
| F5 | 存储版本不符就拒绝，没有升级链：`applySqliteBaseline` 对其他版本抛 `SqliteSchemaVersionError`，目录库同理。20 处调用；25 种权威库里 20 种用 `user_version`、2 种自带 meta 表、1 种自管 `user_version`、2 种无版本 | `packages/storage/src/sqlite-baseline.ts:31-45`；`apps/local-host/src/catalog-schema.ts:31-39`；`docs/system/HOME-DATA.md` 第 2 节 | 已确认 |
| F6 | 没有备份命令：源码里没有 `.backup(`、`VACUUM INTO`，唯一的 checkpoint 是 `LocalSqliteStorage.checkpoint()`。文档只写离线整份拷贝；唯一的恢复用例是离线的，只盖目录库、项目库、会话库（含加密正文）和成果版本 | `packages/storage/src/sqlite.ts:167`；`docs/installation.md` 「离线备份与恢复边界」；`tests/home-backup-recovery.test.ts` | 已确认 |
| F7 | 必须同一时点的备份组 A–F 与不必备份清单已经列好；主密钥在 macOS Keychain，不在 Home 里；目录库存项目库的绝对路径，所以恢复只能回原路径 | `docs/system/HOME-DATA.md` 第 7、8、3.1 节；`packages/storage/src/adapters/file-secret-store.ts:1-8,145,166,192,207` | 已确认 |
| F8 | 体量（dev 机，2026-10-08，只读 `stat`/`du`，没有打开任何库）：Home 约 10 GB；活库（不含 `releases/`、`maintenance-3-replaced/`、`runtime-config-backups/`）145 个 `.db`/`.sqlite` 文件共 1.14 GB，其中 `sessions/sessions.db` 约 1.01 GB | §10 的命令 | 已确认 |
| F9 | 可观测性是空的：`packages/observability` 在 SSOT 标 `absent`，合同是 10 行占位；宿主日志是 LaunchAgent 的 stdout/stderr 文件，没有轮转代码；`logs/action-calls.jsonl` 只存命令结果、保留最近 1000 条；`console.*` 81 处；`uncaughtException`/`unhandledRejection` 处理 0 处；Rust 无 panic hook | `docs/SSOT-MATRIX.md:65`；`packages/contracts/src/platform/observability.ts`；`apps/local-host/src/installer/web-service-platform.ts:37-38`；`docs/system/HOME-DATA.md` 第 6.3 节；§10 的 grep | 已确认 |
| F10 | 桌面发布配置 `panic = "abort"`、`strip = true`：崩溃不留回溯也不留符号。没有崩溃上报库：grep 到的 `sentry` 命中都是 Sentry 连接器的目录项（如 `apps/local-host/src/connector-mcp.ts:49`） | `apps/desktop/src-tauri/Cargo.toml:105-106` | 已确认 |
| F11 | Prologue 上游的 observability exporter 槽（`046251ec`，2026-09-30，在上游 main）不在 vendored 基线 `af7375c7` 里；vendored 包的 `dist` 里没有 `exporter` 字样，只有 `AuditSink` | `~/code/prologue`（`git merge-base --is-ancestor`）；`vendor/prologue-sdk/` 的 tgz 解开后 `dist/index.d.ts:45` | 已确认 |
| F12 | 平台绑定：`main.rs` 有 24 行、桌面 Rust 共 40 行写 `target_os = "macos"`，5 个 `*_macos.rs`；常驻服务只有 launchd；主密钥只在 darwin 走 Keychain；素材 OCR/音视频提取靠 Swift 助手且非 darwin 直接 503；沙箱只认 darwin | `apps/desktop/adapters/tauri/src/`；`apps/local-host/src/installer/web-service-platform.ts:84`、`web-service-detection.ts:7`；`apps/local-host/src/material-native.ts:41,46`；`packages/plugin-sandbox/src/runner.ts:41` | 已确认 |
| F13 | 已有多平台分支的：目录选择器（darwin/linux/win32）、浏览器定位。`node-pty` 1.1.0 预编译只有 darwin-arm64/x64、win32-arm64/x64，没有 linux；`better-sqlite3` 12.8.0 走 `prebuild-install` | `apps/local-host/src/directory-picker.ts:35-60`；`apps/local-host/src/browser/locate.ts:28-55`；`node_modules/.pnpm/node-pty@1.1.0/.../prebuilds`；`better-sqlite3/package.json` | 已确认 |
| F14 | 沙箱：3 处启动 `/usr/bin/sandbox-exec`；只有 `runner.ts` 执行不可信的插件代码，另两处（类型检查、依赖解包）只解析不可信数据；网络策略已在宿主一侧（`https-proxy.ts`），不依赖 Seatbelt | `packages/plugin-sandbox/src/runner.ts:74`；`apps/local-host/src/plugin-builder/build-checks.ts:197`、`build-dependencies.ts:83`；`packages/plugin-sandbox/src/seatbelt.ts:9-20` | 已确认 |
| F15 | 桌面 IPC：`default.json` 把 pty、capsule、shelf 等权限开放给 `http://127.0.0.1:4173/*` 与 `http://localhost:4173/*` 的页面，`csp` 为 `null`。插件侧栏的 iframe 没有 `sandbox` 属性（`apps/workbench/src/side-panel.ts:45`），是否同源取决于每个插件的 `src`，没有逐项核对。插件 frame 或别的进程能否调到这些命令 `[未验证]` | `apps/desktop/src-tauri/capabilities/default.json:5-6`；`apps/desktop/src-tauri/tauri.conf.json:46` | 已确认（可达性：未验证） |
| F16 | 三个私有 vendored 包：`@prologue/sdk`（`package.json` 里 `private: true`、无 license 字段，包内也没有 LICENSE 文件）、`@adeptify/intelligence-client`、`@adeptify/search-evidence-layer`（provenance 写 MIT，源仓库 `adeptify/trick-catalog` 本账号解析不到，调查记录）。`vendor/` 会被装进 release 载荷和 npm 包。spec §1 的 2026-10-08 行已定：tarball 不再放进公开仓库 | `vendor/`；`apps/local-host/src/installer/release-assets.ts:15-26`；`apps/local-host/src/installer/package-release-files.ts:35`；dev 机 `releases/molis-work-0.2.0/` 里有 `vendor/` 与 `node_modules/@prologue`、`node_modules/@adeptify` | 已确认 |
| F17 | 发布版本号的 6 处来源由脚本核对一致；2026-10-08 决定下一版 0.3.0、根包/桌面/Tauri 同一版本 | `apps/desktop/tooling/verify-release-versions.mjs`；spec §1 的 2026-10-08「版本与发布策略」行 | 已确认 |

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

**成本** 4–7 人日（枚举与签名 2–3、entitlements 迭代 1–2、CI 校验与双架构 1–2），S2 另计 1–2。**外部等待**：账号与证书，数日到数周 `[未验证]`。**依赖**：D8；不依赖别的代码片。**风险**：公证拒绝信息逐轮迭代（每轮几分钟到几十分钟）；Tauri 对嵌套资源的签名范围 `[未验证]`；`panic=abort`/`strip` 与公证无关，但与 C-5 的符号有关。

### 3.2 C-2 数据升级策略（M1，自动更新与备份的前置）

**为什么在这里**：F5 说明任何改了库版本的构建，对旧 Home 都是「打不开」。当前这是有意的（spec §4.1「不留兼容逻辑」，窗口到第一个装到开发机外的版本为止，路线图待决 #15，截至 `f8ea20b9` 的 §1 没有结论）。更新器一旦存在，这个窗口就必须关上。

**方案**：

1. **规则**（D2）：从第一个外部版本起，库版本变更必须带迁移；此前维持现状。降级保护保留：旧程序看到更新的版本仍然拒绝（`catalog-schema.ts:31-39` 的做法）。
2. **机制**：`applySqliteBaseline` 扩成「版本 + 建库语句 + 按序迁移」：库版本低于当前则在一个事务里依次迁移并写 `user_version`；高于当前、或有表无版本，照旧拒绝。目录库（`catalog_meta`）、会话库（`session_meta`）、`characters.sqlite`（自管 `user_version`）三类自管版本的接入各自实现同一接口（HOME-DATA 第 2 节）。两个无版本库先由 W2-05 补版本。
3. **保护**：迁移前对要动的库取快照（用 C-4 的备份 API，没有它时用 W5-16 的离线快照）；迁移失败回到快照并保持旧程序。迁移由常驻宿主在「维护态」做（AGENTS.md：一个 Home 只有一个执行进程，其他入口转发）；直连库的入口（CLI 和管理 MCP 在没给库路径时的默认库，`docs/system/HOME-DATA.md` 第 8 节）要先被版本检查挡住。
4. **跨库**：多个库的升级不可能原子；写一份「升级记录」（要升哪些库、升到了哪一步），中断后从记录续做或整体回快照 `[推断]`。
5. **门禁**：`tests/home-store-baselines.test.ts` 已把基线与存量库夹具比对；加「上一个发布版本的库夹具 → 迁移 → 与新基线逐表一致」的回放，发布清单里的各库版本表（W1-22）由登记生成。

**成本** 6–10 人日（机制 3–4、回放夹具 2–3、三类自管版本接入 1–3）。每个库以后每次升版本的迁移是各 owner 的日常工作，不计。**依赖**：D2；W2-05；W4-11（决定遍历哪些库）；W1-22（版本表）。**风险**：项目库有 29 段建表（HOME-DATA 4.2），迁移粒度是库级版本还是分段要在机制里先定；多个常驻进程同时开库的时机。

### 3.3 C-3 自动更新（M2）

**方案**：

1. **更新单元**是整个 `.app`（含内嵌运行时）。F3 的现有流程在新 `.app` 启动时把运行时装进 Home 并修复服务，Home 里的程序发布又是原子换目录（F4），所以更新器只负责把新 `.app` 换到位并重启 `[推断，S5 验证]`。
2. **通道**：Tauri v2 的 updater 插件（`Cargo.toml` 已是 `tauri = "2"`）。更新包用 Tauri 自己的密钥对签名，与 Apple 证书无关；公钥写进 `tauri.conf.json`，私钥进 CI secret；产物（`.app.tar.gz`、`.sig`、`latest.json`）随 GitHub Release 发布，arm64 与 x64 各一条 `[未验证：按 Tauri v2 文档，S5 核实]`。
3. **体验**：启动时和每隔若干小时检查；发现新版只提示「重启以更新」，不静默安装；说明取自 CHANGELOG（W1-22）；可延后。升级前自动快照（C-2.3）。
4. **安全**：更新检查与安装由 Rust 侧发起，网页只收状态事件。更新命令**不进** `capabilities/default.json`：该文件对 `127.0.0.1:4173` 的页面开放 pty、capsule、shelf（F15），把安装更新放进去等于让任何同源页面能触发它。
5. **回滚**：程序可回滚（旧 release 目录仍在，F4），数据不能向后（库拒绝更新的版本）。所以「回到上一版」= 恢复升级前快照 + 旧程序，要做成一条命令，不能只靠换回旧 `.app`。
6. **自举**：已安装的 0.2.0 没有更新器（F3），第一台带更新器的构建必须手动安装 `[推断]`。
7. **旧 release 的保留**：当前不清理（F4），更新器上线前要定「保留当前 + 上一个」。

**成本** 7–12 人日（插件与密钥 2–3、发布产物与清单 2–3、重启与服务衔接 1–2、旧 release 清理 1、双架构端到端 1–3），S5 另计 1–2。**依赖**：C-1（未公证的包无法稳定通过 Gatekeeper 首次运行 `[推断]`）；C-2；快照 API（W5-16）；W1-22；D8（清单托管在哪）。**风险**：全量包大（F4：一份 release 目录解开约 334 MB），Tauri 没有原生的差量更新 `[未验证]`；更新时常驻服务与 MCP 转发进程的重启顺序。

### 3.4 C-4 在线备份（M2；离线快照 W5-16 是前置）

**前置（路线图已有，不重复计价）**：W4-11 单一 Home 存储登记（遍历哪些库、哪个 owner、备份类）；W5-16 `molis-work home snapshot`（常驻宿主静默、SQLite 备份 API、带版本与摘要的清单、版本不符拒绝恢复）；W5-17 目录库按 Home 与 `project_id` 推项目库路径（没有它，备份只能还原到原路径，F7）。

**方案**：

1. **执行者**：常驻宿主的周期任务，登记在 W4-09 的周期任务清单里；不另起进程。
2. **单库一致**：用 SQLite 在线备份 API。`better-sqlite3` 12.8.0 有 `db.backup()`（`lib/methods/backup.js`），Node 24.14.0 的 `node:sqlite` 也导出 `backup`，两者在本机核对过。每个副本跑 `integrityCheck`（`sqlite.ts:168` 已有）并把摘要写进清单。
3. **跨库一致**：F7 的 A（目录库 + 项目库）、B（会话库 + 加密正文 + `content.key`）、C（Agent 与记忆）、D（凭据）要取同一时点，SQLite 只保证单库。做法：备份开始前宿主进入短静默（拒新写、等在途动作收尾，设秒级上限），在静默里固定各库快照点、对文件型数据用 APFS clone/硬链接固定，随后在静默外慢慢复制 `[推断，S3 量]`。静默过长就退化为按组静默。
4. **去向与密钥**（D6）：默认写到用户选的另一个本地目录（外置盘或同步盘）。默认**不含**主密钥与 `feed/secrets.json`（D 组），恢复后连接器和模型密钥重新授权；要含密钥就用口令加密整个包（复用 `file-secret-store.ts` 的 AES-256-GCM 与 scrypt），不把 Keychain 主密钥写进包。
5. **范围与保留**：备份 A–F 组；不备份 `releases/`、`bin/`、`search/`、`cache/`、`logs/`、`browser/profile/` 与锁、暂存（HOME-DATA 第 7 节）。保留最近 N 份日备和 M 份周备。
6. **恢复**：`home restore <快照>`，只在服务停止时；清单里的库版本都是本程序认得的才恢复（C-2 之后可先迁移）；写到新 Home 路径（依赖 W5-17）。
7. **界面**：设置里显示上次备份时间、立即备份、打开备份目录；超过 N 天没成功就提示。

**体量**（F8）：活库 1.14 GB，`sessions.db` 占约 89%，每次全量都以它为主；变更检测与增量放到备份稳定之后 `[推断]`。

**成本** 10–15 人日（周期任务与登记驱动 2–3、静默与跨库一致 3–4、恢复命令与版本检查 2–3、界面 2、测试盖满登记里每个库 1–3）；加密外送与云端去向再加 5–8，不在 M2。**依赖**：W4-11、W4-09、W5-16、W5-17、W1-16（已在）、C-2。**风险**：1 GB 库在线复制期间对写入的影响（S3 测）；备份目标不可用或写满；备份含私人对话，默认位置要让用户看得见。

### 3.5 C-5 可观测性与崩溃上报（A 在 M1，B 在 M2）

**A 本机，不联网（M1）**

1. **结构化日志**：W5-13 的最小 logger 替换宿主里的 `console.*`（F9，81 处，其中 `apps/local-host/src` 60 处）。字段：时间、级别、组件、错误码，W3-01 落地后加 `call_id`。脱敏：不写正文、不写带用户名的路径、不写密钥（SSOT `packages/observability` 一行写的「安全脱敏」）。
2. **落盘与轮转**：宿主自己写 `<Home>/logs/` 下按日期的文件，按大小和天数轮转；launchd 的 stdout/stderr 文件只收启动失败。桌面直接启动的子进程日志去向 `[未验证]`，要读 `web_service.rs` 之外的启动代码确认。
3. **崩溃捕获**：Node 宿主装 `uncaughtException`/`unhandledRejection`（F9：现为 0 处），写 `<Home>/logs/crash/<时间>.json`（版本、各库版本、堆栈、最近日志摘录）后退出，由 launchd 的 `KeepAlive` 重启（`web-service-platform.ts:70-71`，间隔 5 秒）。Rust 侧装 `std::panic::set_hook` 写到同一目录，并为发布构建保留符号，否则 F10 的 `strip` 与 `panic=abort` 只留下系统崩溃报告。原生库（`better-sqlite3`、`node-pty`）段错误仍只有系统报告。
4. **`molis-work diagnostics export`**：把版本、平台、登记库的版本表（W4-11）、服务状态、最近日志、崩溃记录打成一个 zip，由用户决定发给谁。

**成本 A**：5–8 人日（不含 W5-13）。

**B 可选上报，联网，默认关（M2）**

- 设置里显式开关，默认关；开启前预览将发送的字段。只发版本、平台、错误码、去路径的堆栈、库版本表；不发 Goal、项目、文件名、内容、路径。
- 去向（D3）：自建 Sentry 兼容端点、SaaS，或永远只手动发 zip。
- 模型调用一侧用 Prologue 的 exporter 槽（F11：审计投影成批外送、送前再脱敏、失败不改业务结果）。它不在 vendored 基线里，所以依赖 W1-20 把 SDK 收敛到含 `046251ec` 的上游基线。

**成本 B**：6–10 人日，加端点运维与隐私评审。**依赖**：A；D3；W1-20。**风险**：本地优先的产品里遥测是信任问题，不是技术问题，所以默认关、先预览。

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

**成本**：① 3–5 人日；B-Linux 6–10；B-Windows 15–25；C 15–25；S1 另计 2–3。**依赖**：S1；D4。**测试**：`tests/plugin-sandbox.test.ts:22` 在非 darwin 上整体跳过，新后端要有同一套用例在对应系统的 CI 上跑，否则等于没测。

### 3.7 C-7 跨平台桌面（M3）

**分三层做，每层单独验收**：

- **L0 宿主 + CLI + 浏览器工作台在 Linux/Windows 上跑通**（npm 路径，`docs/installation.md` 「安装边界」）。要补的：常驻服务 provider（现在非 darwin 直接返回 `unsupported`，`web-service-detection.ts:7`；Linux 用 systemd `--user`，Windows 用计划任务 `[未验证]`）；主密钥后端（现在只有 darwin 走 Keychain，`file-secret-store.ts:145,166`；其余走 `aes-gcm-file` 兜底，把主密钥放文件里是否可接受要用户定，D6 一并问）；`node-pty` 在 Linux 要现编（F13）；先看 W1-11 的 ubuntu 通过率（S4）再修正本层估算。
- **L1 Windows 桌面壳**：Tauri 本身跨平台，但这是一次移植，不只是补 `cfg` 分支。
  - `main.rs` 的 24 行 macOS 分支（F12）要分成「核心」（窗口、托盘、PTY、外链、目录授权）与「mac 专有」（Shelf 热键/拖拽/Drop wheel、剪贴板监听、红绿灯、胶囊透明窗），后者在 Windows 上降级或重做。
  - 非测试代码里有不带 `cfg` 的 unix 假设：`web_service.rs:7` 引入 `std::os::unix::process::CommandExt`，`web_service.rs:219,224,235` 用 `/bin/kill`，`runtime_env.rs:5` 用 `/bin/zsh` 读登录环境，`main.rs:601,650` 用 `/usr/bin/mdfind` 与 `/usr/bin/open`，`context_directory_files.rs:11` 引入 `std::os::unix::fs`；另有 `cfg(unix)` 的代码（`context_directories.rs:142,151`、`shelf_http.rs:445`）。这些在 Linux 上大多原样可用，所以 L2 比 L1 省。
  - Node 运行时准备脚本现在是 macOS 专用 bash（`prepare-macos-runtime.sh`），要有 Windows 版；需要 Windows 代码签名（外部）`[未验证]`；更新器与发布矩阵加 `windows-latest`。
- **L2 Linux 桌面壳**：同 L1，加 AppImage 或 deb 打包与更新；排在 Windows 之后（D5）。

**素材 OCR/音视频**依赖 Swift 助手（`apps/local-host/native/materials/`），非 mac 已返回 `native_unavailable`（F12）；是否做替代是产品决定，本方案默认降级。

**成本**：L0 5–10 人日；L1 25–40；L2 15–25。**依赖**：S4（W1-11）；C-1/C-3 的 Windows 对应物；C-6（决定生成插件在新平台的状态）；W5-17（路径）。

### 3.8 C-8 减少私有 vendored 依赖（许可清理 M1，改私有源 M2）

W1-20 出依赖清单、SDK patch 收敛计划和决策记录；spec §1 的 2026-10-08 行已定方向：源分支推到 Prologue 远端、删 25 个历史补丁并记 sha256、三个 tarball 不再放公开仓库。本节只补 C 端要的三件。

1. **再分发许可（M1，外部）**：`@prologue/sdk` 无 license、`private: true`（F16），却会进 DMG 的运行时载荷和 npm 包。公开发布任何安装包之前，要 Prologue 负责人书面确认可以这样分发。没有这个答复，M1 的公证包只能内部用。
2. **改私有源（M2）**：按 2026-10-08 的决定落地，二选一：私有 registry 或 release 附件加校验和。要保住 AGENTS.md 的 `pnpm install --frozen-lockfile --offline` 流程，所以预取到本地 store；CI 需要私有源凭据，**fork 来的 PR 拿不到凭据，跑不了完整 CI** `[推断]`，外部贡献流程要同时想清楚。registry 选 GitHub Packages 还是自建 `[未验证]`。
3. **减少个数**：`@adeptify` 两个包的 provenance 写 MIT，源仓库的所有人同意后可以公开发布，之后私有的只剩 `@prologue/sdk`。再往下（Prologue 开源或模型调用走服务）超出本方案。

**成本** 4–7 人日 + 外部。**依赖**：W1-20；D7。

### 3.9 相邻：第三方插件安装（不在七项内，方案归 W1-15）

`verifyPluginPackage` 只有 `tooling/plugin-cli` 调用，产品里没有安装已签名第三方包的路径（grep 全仓：消费者只有 `tooling/plugin-cli/src/package-signing.ts` 与 `tests/plugin-package.test.ts`）。它需要两样东西：信任根与发布者公钥的固定（路线图待决 #11，未决）、第三方代码在进程外隔离执行（C-6）。所以它排在 C-6 之后。

## 4. 依赖与顺序

- **M0**：D1–D4 与 S1–S5 先做完。
- **M1**（并行，互不依赖）：
  - C-1 公证 ← D8（账号）
  - C-2 数据升级策略 ← D2、W2-05、W4-11、W1-22
  - C-5A 本机诊断 ← W5-13
  - C-8.1 再分发许可 ← Prologue 负责人（外部）
  - 前置：W5-16 离线快照 ← W4-11
- **M2**（M1 完成后）：
  - C-3 自动更新 ← C-1、C-2、快照、W1-22、D8
  - C-4 在线备份 ← W4-09、W4-11、W5-16、W5-17、C-2
  - C-5B 可选上报 ← C-5A、D3、W1-20（SDK 收敛）
  - C-8.2 私有源 ← C-8.1、W1-20、D7
- **M3**（M2 之后，S1、S4 的结果决定内容）：
  - C-6 沙箱继任者 ← S1、D4
  - C-7 L0（宿主跑通）← S4（W1-11）；L1（Windows 桌面）← L0、C-1/C-3 的 Windows 对应物
  - §3.9 第三方插件 ← C-6、路线图待决 #11

顺序的理由：M1 的四件每一件单独缺了，第二台机器上的第一次使用就出问题；M2 的更新器会让「库版本不符即拒绝」变成每次发版都可能触发的事故，所以必须排在 C-2 与快照之后；M3 最贵也最不确定，放最后并先探针。D1 的备选顺序见 §8。

## 5. 成本汇总

人日是乐观–保守，`[推断]`；不含 W 系列已在路线图计价的前置（W4-09、W4-11、W5-13、W5-16、W5-17、W2-05）。

| 项 | 里程碑 | 人日 | 外部等待 | 主要依赖 |
| --- | --- | --- | --- | --- |
| 探针 S1–S5 | M0 | 5–9 | — | — |
| C-1 公证签名 | M1 | 4–7 | Apple 账号与证书 | D8 |
| C-2 数据升级策略 | M1 | 6–10 | — | D2、W2-05、W4-11、W1-22 |
| C-5A 本机诊断与崩溃记录 | M1 | 5–8 | — | W5-13 |
| C-8.1 再分发许可 | M1 | —（只等答复） | Prologue 负责人答复 | W1-20 |
| **M1 合计** | | **15–25** | | |
| C-3 自动更新 | M2 | 7–12 | 更新清单托管 | C-1、C-2、快照 |
| C-4 在线备份 | M2 | 10–15 | — | W4-09、W4-11、W5-16、W5-17 |
| C-5B 可选上报 | M2 | 6–10 | 端点运维、隐私评审 | C-5A、W1-20 |
| C-8.2 私有源 | M2 | 4–7 | 私有源与凭据 | C-8.1、W1-20 |
| **M2 合计** | | **27–44** | | |
| C-6 沙箱：A 两个数据点 | M3 | 3–5 | — | S1 |
| C-6 沙箱：B-Linux / B-Windows / C 三选 | M3 | 6–10 / 15–25 / 15–25 | — | S1、D4 |
| C-7 L0 / L1 / L2 | M3 | 5–10 / 25–40 / 15–25 | Windows 代码签名证书 | S4、C-1/C-3 |

M1 合计是前三项之和（4+6+5 至 7+10+8）。M3 的下限 30–50 是只做 C-7 的 L0 与 L1（5+25 至 10+40）；上限 54–90 再加沙箱 A 与 B 的 Linux、Windows 两个后端（3+6+15 至 5+10+25，合计 24–40）。两个区间都不含 L2 和 WASM 路线。

## 6. 探针（先量再定，不写产品代码）

| # | 要回答的 | 做法 | 成本 | 决定哪一项 |
| --- | --- | --- | --- | --- |
| S1 | 沙箱继任者里谁能满足 R1–R6 | ① 用 QuickJS-WASM 跑 `tests/plugin-sandbox.test.ts` 和 2–3 份创作台产物，量耗时与内存；② 在 ubuntu runner 上试 bubblewrap 的等价配置；③ 读 Node 24 权限模型文档，列已知绕过，量类型检查与解包的耗时和内存 | 2–3 人日 | D4、C-6 |
| S2 | 内嵌运行时能否在 hardened runtime 下运行并过公证 | 在载荷的临时副本上枚举 Mach-O，用 ad-hoc 加 `--options runtime` 签后运行 Node 与各原生插件，记下缺哪些 entitlements；有账号后提交一次真实公证看拒绝信息 | 1–2 人日 | C-1 的成本区间 |
| S3 | 在线备份的耗时、对写入的影响、跨库一致的静默要多久 | 只在真实 Home 的**拷贝**上做：逐库 `backup()` 计时，对 1 GB 的会话库在并发写下测延迟 | 1–2 人日 | C-4 的设计与区间 |
| S4 | Linux 上现有非浏览器用例的通过率 | 就是 W1-11 的 ubuntu 探针，不另做 | 0 | C-7 L0 的区间 |
| S5 | Tauri 更新器能否与「内嵌版本更新才装进 Home」的流程衔接，以及网页是否碰不到更新命令 | 一个一次性构建加测试密钥，换 `.app` 后观察 Home 与服务；用同源页面直接调 IPC 验证 F15 | 1–2 人日 | C-3 |

## 7. 本方案不覆盖

体检报告 §3.3 其余各行的归属：BYOK 首次引导（模型行，产品引导，不在防腐范围）；浏览器代码打包与 source map（W5-04）；错误基类与错误码（W3-02）；多代皮肤叠加（W5-05）；文档漂移（W1-02、W1-06）。跨设备接续与 IM 线（`server/`、`apps/server`、`packages/im-ui`）在 SSOT 里是 `absent` 或实验（`docs/SSOT-MATRIX.md` 的 `packages/exchange`、`packages/im-ui` 两行），不是 C 端就绪的一部分。移动端、云端同步、账号体系不在任务书里。

## 8. 待用户决定

前四件挡住后面的排期；后四件可以边做边定。选项后标「（推荐）」的是我的建议。

| # | 问题 | 选项 | 为什么 |
| --- | --- | --- | --- |
| **D1** | 顺序 | M1→M2→M3 如 §4（推荐）；定时备份提前到 M1（M1 +10–15 人日）；Windows 提前、不等更新器与备份 | M1 只要求离线快照（升级和迁移前自动取），定时备份是便利；但如果第一批外部用户的数据更值得保，提前它。Windows 提前会让没有更新器、没有备份的版本先到更多人手里 |
| **D2** | 数据升级策略从「拒绝」转为「迁移」的时间 | 第一个装到开发机外的版本起（推荐，即路线图待决 #15 的推荐）；现在就加；永远「不兼容就重装」 | 更新器存在后，「拒绝」就是每次发版的数据事故（§3.2）。现在就加会让还在频繁改库的阶段背迁移成本；永远重装与 C 端不相容 |
| **D3** | 诊断与上报 | M1 只做本机诊断和手动 zip，M2 起可选上报、自建端点、默认关（推荐）；一开始就上 SaaS；永不联网 | 本地优先的产品里，遥测先要用户信任；手动 zip 零基础设施。SaaS 涉及数据驻留与合同 |
| **D4** | 沙箱继任者 | ① 先只做两个数据点并声明生成插件仅 macOS，S1 出结果后在按系统各一个后端与 WASM 单一后端之间选（推荐）；直接做按系统三个后端；直接做 WASM | S1 只要 2–3 人日，能把 15–25 人日的两条路的风险量出来。生成插件是进阶能力，新平台首发可以不带 |
| D5 | 平台顺序 | M3 内先 L0（宿主跑通）再 Windows 桌面，Linux 桌面不排期（推荐）；Linux 先；只做 macOS | Windows 用户面更大；Linux 的 CI 已在 ubuntu，所以 L0 成本最低，用它的通过率修正后面的估算 |
| D6 | 备份去向与密钥；非 darwin 的主密钥后端 | 另一个本地目录、不含密钥，恢复后重新授权；非 darwin 先用 `aes-gcm-file` 兜底并在设置里写明（推荐）；口令加密并含密钥；云端去向 | 不含密钥最简单也最不容易泄露；把主密钥放文件意味着磁盘被拷走就能解密，要用户明确接受 |
| D7 | 私有包 | 落实 2026-10-08 的决定：先拿 Prologue 的再分发答复，再改私有 registry 或 release 附件；两个 MIT 包争取公开发布（推荐）；只做其中一半 | 没有 Prologue 的答复，公开发布任何安装包都有风险；公开两个 MIT 包能把私有的减到一个 |
| D8 | 账号与托管 | Apple 开发者账号用谁的名义、Windows 签名走哪条路、更新清单放在哪（GitHub Release 或自有域名） | 签名人名会出现在用户看到的系统提示里；清单地址写进每个已发出的安装包，换起来要发一版 |

## 9. 与其他片的接口（核对点）

| 片 | 本文用了它的什么 | 状态 | 变了要改本文哪里 |
| --- | --- | --- | --- |
| W1-16 | `docs/system/HOME-DATA.md` 第 2、3.1、6.3、7、8、10、11 节 | 已在 main | §2 F5–F8、§3.4 |
| W1-20 | SDK patch 收敛、私有包决策、pnpm 固定 | 在写，本文只引 spec §1 的 2026-10-08 行 | §3.5 B、§3.8 |
| W1-22 | 版本策略、CHANGELOG、各库版本表、`verify-release-versions` 进 CI | 在写，只引 §1 的 2026-10-08 行 | §3.2、§3.3 |
| W1-11 | ubuntu 探针 | 未做 | §3.7、S4 |
| W1-15 | 第三方插件安装方案 | 未做 | §3.9 |
| W1-09 | Rust 的 rustfmt/clippy 进 CI | 未做 | §3.7 L1 的改动面 |
| W2-05 | 两个无版本库补版本 | 未做 | §3.2 |
| W3-01 | `call_id` | 未做 | §3.5 A |
| W4-09、W4-11 | 周期任务登记、Home 存储登记 | 未做 | §3.4、§3.2 |
| W5-13、W5-16、W5-17 | 结构化 logger、`home snapshot`、目录库路径派生 | 未做 | §3.5 A、§3.4 |

## 10. 复现命令

在仓库根执行，基线 main `f8ea20b9`。

```bash
# F2 签名/公证字样为空（退出码 1 = 无匹配）
grep -rn "entitlement\|hardened\|--options runtime\|notarytool\|stapler" apps/desktop .github docs scripts package.json | grep -v node_modules

# F6 备份 API、F9 日志与崩溃
grep -rn -e '\.backup(' -e 'VACUUM INTO' apps packages horizontal modules plugins server scripts tooling --include='*.ts' --include='*.mts' --include='*.mjs' --exclude-dir=node_modules --exclude-dir=dist
grep -rn "console\.\(log\|error\|warn\|info\|debug\)" apps packages horizontal modules plugins server tooling --include='*.ts' --include='*.mts' --exclude-dir=node_modules --exclude-dir=dist | grep -v "/client/\|\.d\.ts" | wc -l   # 81
grep -rn "uncaughtException\|unhandledRejection" apps packages horizontal modules plugins server --include='*.ts' --exclude-dir=node_modules --exclude-dir=dist | wc -l   # 0

# F12 平台绑定
grep -c 'target_os = "macos"' apps/desktop/adapters/tauri/src/main.rs   # 24
grep -rn 'target_os = "macos"' apps/desktop/adapters/tauri/src | wc -l   # 40
grep -rn 'process\.platform\|"darwin"' apps packages horizontal modules plugins server --include='*.ts' --exclude-dir=node_modules --exclude-dir=dist

# F14 三处 sandbox-exec
grep -n "sandbox-exec" packages/plugin-sandbox/src/runner.ts apps/local-host/src/plugin-builder/build-checks.ts apps/local-host/src/plugin-builder/build-dependencies.ts

# F11 上游 exporter 槽不在 vendored 基线（需要本机的 Prologue 仓库）
git -C ~/code/prologue merge-base --is-ancestor 046251ec af7375c7 || echo "不在基线里"

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
