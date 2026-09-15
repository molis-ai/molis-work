# Molis Work v0.1.14 发布收口需求书

## 1. 背景与目标

最近多个开发 Session 已经把 Goal 生命周期、Session 工作记录、Feed 富内容、Onboarding、Settings、Momentum 和桌面壳等能力集中写入当前工作区，但这些改动尚未形成一份统一的发布验收结论。当前代码仍有一个会阻断发布的真实故障：读取超大 Codex Session 时，Molis Work 使用 `thread/read(includeTurns: true)` 一次性接收完整历史；单行 JSON 达到约 1.31GB 后，Node 会在解析前抛出 `RangeError: Invalid string length`，并带崩 Web 服务。

本任务将当前工作区收口为 `v0.1.14`，完成等级为 **5：可发布**。目标不是增加新产品方向，而是确保已经提到和实现的前后端能力在真实安装包中可用、可恢复、视觉一致，并以可复现证据完成 commit、push、tag 和发布。

## 2. 当前行为与证据

- `pnpm typecheck` 已通过。
- 官方 `pnpm test` 已通过 418 项；额外测试中 52/55 通过，3 项失败都来自 `tests/visual-foundation.test.ts` 对旧视觉契约的断言。
- Rust 桌面测试 12/12 通过。
- `v0.1.13` 本地包可以完成隔离新装、Onboarding、创建项目与 Goal，并证明 `dist` 进入了 App；但当前工作区仍标记为 `0.1.13`，不能作为新版本发布。
- 超大 Footballnia Codex Session 的元数据读取约 933B，`thread/turns/list` 最近摘要页约 12KB；官方本机协议已经明确把全量 `thread/read` 标为 deprecated，并提供 `thread/turns/list` / `thread/items/list` 分页。
- 首轮真实浏览器验收复现了两个发布级体验缺陷：空 Feed / Inbox 在工作区载入完成后仍显示“正在打开”，标准桌面下 Session 内容标题会被搜索与筛选控件挤成逐字换行。
- 本机只有本地开发签名身份，没有可确认的 Developer ID 与 notarization 状态；公开发布流水线是否具备凭据必须由远端 workflow 结果证明。

## 3. 范围

### 3.1 后端与契约

- Codex Session 内容改为元数据读取 + 最近 Turn 分页摘要，不再请求完整历史。
- Transport 对单条 app-server 响应设置字节上限；超限时终止并重建子进程，把错误降级为可显示、可重试的内容读取失败，不能带崩 Web 服务。
- 返回“只展示最近一段历史”的显式事实，并保留 Molis Work TUI / 本地事件作为可验证 fallback。
- 修正失效的视觉测试并把当前全部测试文件纳入发布门禁，避免“官方脚本通过但补充测试失败”。

### 3.2 前端视觉与交互

沿用 `DESIGN.md` 的 Calm Desktop，不做隐性重设计。检查并在有证据时精修以下真实模块：

- 项目目录与 Onboarding；
- Goals：目录、Focus、详情分段、Runtime、Momentum、提案/决定；
- Sessions：列表、详情、内容加载、超大内容降级、新建、关系、Handoff；
- Inbox、Feed 富内容、来源；
- 工作目录；
- Project Settings、Global Settings、Diagnostics；
- Promotion 与 Visual Workspace 的诚实占位状态。

检查维度：桌面宽屏、标准桌面、760px 附近和手机窄屏；Light / Dark / System；信息层级、溢出、裁切、对比度、键盘焦点、触控尺寸、加载/空/失败/成功/禁用/长内容状态；动效一致、可中断且尊重 `prefers-reduced-motion`。只做一轮批量检查、一轮批量修复和一次确认。

### 3.3 发布

- 统一 `package.json`、lockfile、Tauri、Cargo、Feed runtime 和 Codex clientInfo 的版本为 `0.1.14`。
- 完成源码 build、全量 Node 测试、Rust 测试、版本一致性检查和 macOS arm64 打包。
- 验证 DMG、App ZIP、SHA-256、codesign、Gatekeeper / notarization 状态。
- 在隔离 Home 中验证新装、Onboarding、前后端主链路、重启；使用 `v0.1.13` 数据副本验证升级时不覆盖项目与历史。
- 审查最终 diff 后 commit、push；创建 `v0.1.14` tag 并让 GitHub Actions 生成 arm64 / x64 正式发布物。只有远端签名、公证和 Release workflow 全部成功，才宣称公开可直接安装。
- `main` 保持必须经 PR、禁止管理员绕过和对话必须解决；为单人维护将必需审批数调整为 0，同时新增 PR CI，只有类型检查、全量 Node 测试、Rust 测试和版本一致性检查通过后才能合并。

## 4. 非目标

- 不实现 Promotion、Visual Workspace 或其他尚未定义的业务实体。
- 不把浏览器打开页面变成自动绑定 Session 或自动启动 Runtime。
- 不解决 Codex 已运行 Session 热加载新 MCP 的上游限制；继续使用“连接后新开 Session / Handoff”的明确流程。
- 不伪造 GitHub、Gmail 等需要用户凭据的线上成功；无凭据时只验证本地契约、错误状态和已有测试。
- 不通过提交证书、密码或跳过 Gatekeeper 来绕过 Apple 公证。

## 5. 方案与模块边界

### 5.1 Codex 内容读取

- `CodexRuntimeSessionAdapter` 拥有 Codex 私有协议适配：`read` 先调用 `thread/read(includeTurns: false)`，再调用 `thread/turns/list({ sortDirection: "desc", itemsView: "summary", limit })`，把页面恢复为时间正序供现有 Timeline 消费。
- Adapter 返回线程元数据、有限 Turn 和分页信息；`SessionContentService` 只负责规范化为产品 Timeline，不直接依赖 Codex 分页协议。
- `CodexAppServerTransport` 拥有 JSONL 字节边界。它按 Buffer 增量找换行；单行超过上限时不再拼接，终止该 app-server，拒绝所有 pending request，并允许下一次请求启动新进程。
- 错误对外只返回稳定错误码和安全中文，不泄露 Session 内容、路径、凭据或 Runtime 原始诊断。

### 5.2 Session 前端

- API 在 `SessionContentResult` 中公开 `native_history` 分页事实（摘要模式、返回轮数、是否还有更早历史）。
- Timeline 顶部在历史非完整时显示中性提示；超限/失败时显示可重试状态，同时继续展示 Molis Work 已能证明的本地事件。
- 空 Feed / Inbox 在载入完成后显示与左侧一致的真实空状态，不继续伪装为加载中；Session 内容工具栏在标准桌面宽度改为上下排列，标题与控件都保持完整。

### 5.3 视觉与发布

- `DESIGN.md`、现有 token、共享目录行、Goal Detail paper 和响应式规则是唯一视觉基线。
- 只修复真实渲染证据中的缺陷；不把发布收口变成新的 IA 或视觉方向。
- 版本一致性由 `scripts/verify-release-versions.mjs` 负责；公开 Release 由 `.github/workflows/release-macos.yml` 负责双架构、Developer ID 签名与 notarization。

## 6. 输入、输出与依赖

输入：当前 dirty worktree、已有功能 specs、`DESIGN.md`、本机 Codex app-server v0.152.0 协议、`v0.1.13` 安装包或数据副本。

输出：

- `v0.1.14` 源码与唯一 release-hardening spec；
- 超大 Session 安全读取与回归测试；
- 更新后的视觉证据；
- macOS arm64 DMG、App ZIP 和 SHA-256；
- Git commit、远端分支/主线、`v0.1.14` tag 与 GitHub Release；
- 一份逐项通过 / 未运行 / 失败的最终验收结论。

外部依赖：本机 Codex app-server、Node 24、pnpm、Rust/Tauri、macOS；GitHub Actions 的 Intel runner 与 Apple 发布凭据。

## 7. 验收标准

1. 超大 Session 不再调用 `thread/read(includeTurns: true)`；最近历史通过分页摘要返回，时间顺序正确，并明确标记是否还有更早历史。
2. 模拟超过 Transport 单行上限时，Web 进程不崩、请求得到安全失败、下一次请求可重建 transport；对应自动化测试通过。
3. Footballnia 那条真实超大 Session 可以通过 Molis Work API / UI 打开最近摘要；服务健康检查在前后均成功。
4. `pnpm typecheck`、`pnpm test`、所有 `tests/*.test.ts`、`cargo test` 全绿；发布脚本不会遗漏仓库中的测试文件；PR CI 运行同一组门禁并成为 `main` 必需状态检查。
5. 上述模块在桌面、窄屏、Light、Dark 的主要状态无横向溢出、裁切、错误层级、不可读对比或阻塞动效；键盘焦点、触控尺寸和 reduced-motion 成立。
6. 隔离新装可完成 Onboarding → 项目 → Goal → Goals / Sessions / Feed / Settings 主路径；重启后数据仍在。
7. 从 `v0.1.13` 数据副本升级到 `v0.1.14` 后，已有项目、Goal、Session 关系和设置保留，服务能恢复。
8. 所有版本源一致为 `0.1.14`；DMG、App ZIP、SHA-256、归档完整性与 codesign 校验通过。
9. commit 和 push 成功；`v0.1.14` tag 与 GitHub Release 成功。若远端缺 Apple 凭据，workflow 必须按设计失败，最终结论标为“本地包完成、公开 Release 被签名/公证阻塞”，不得宣称 Level 5 全部通过。

## 8. 验证命令与手动证据

```bash
pnpm typecheck
pnpm test
node --import tsx --test tests/*.test.ts
cargo test --manifest-path desktop/src-tauri/Cargo.toml
node scripts/verify-release-versions.mjs
pnpm desktop:build:macos
```

补充：使用 in-app Browser 做 Web 桌面/窄屏检查，使用真实打包后的 Tauri App 做 native chrome、Onboarding、重启和升级检查；用 `hdiutil verify`、`unzip -t`、`shasum -c`、`codesign --verify --deep --strict`、`spctl --assess` 验证发布物。

## 9. 假设与开放问题

- 版本默认升为 `0.1.14`，因为 `v0.1.13` 已存在且当前工作区包含多个 Session 的新改动。
- 默认把当前工作区中所有已有 session 改动作为本次发布内容，不回退或拆除用户改动；最终 diff 审查负责排除调试残留和不相关临时文件。
- 公开发布能否完成取决于 GitHub Actions 中 Apple Secrets 是否齐全；本地无法替代远端公证证据。
- 外部 Connector 的真实账号拉取没有用户凭据时不运行，按非目标保留为已声明验证缺口。

## 10. 发布前验收记录（2026-09-01）

- 通过：`pnpm typecheck`。
- 通过：`pnpm test`，仓库全部 `tests/*.test.ts` 共 475 项，0 失败；其中包含 packed release 的新装、重启、移除与升级流程。
- 通过：`cargo test`，桌面层 12 项，0 失败。
- 通过：版本源一致性检查，全部为 `0.1.14`。
- 通过：真实 macOS arm64 包构建，输出约 65MB DMG 与 81MB App ZIP；DMG CRC、ZIP 完整性和两份 SHA-256 均通过。
- 通过：隔离空 Home 的真实 App 新装；完成四步 Onboarding，创建 Project 与根 Draft Goal，并进入原生 Goal 工作台。
- 通过：`v0.1.13` 数据副本升级到 `v0.1.14`；10 个 Project、Footballnia 的 7 条 Session 及既有关系保留。
- 通过：真实大型 Codex Session `01a05828-7558-74f0-bda8-f8c47f128a42` 返回 9 轮摘要并与 108 条 Molis Work 记录合并，Web 服务保持健康，原生 Session Timeline 无崩溃与溢出。
- 通过：桌面、760px 附近与手机窄屏，Light / Dark / System 下检查项目目录、Onboarding、Goals、Runtime、Momentum、Sessions、Inbox、Feed、Sources、Settings、Diagnostics、Promotion 与 Visual Workspace；修复了 Feed 空态残留和 Session 标题挤压，确认长内容、搜索、筛选和响应式布局正常。
- 待远端：本机包使用 `Tauri Local Development` 身份，签名元数据存在，但本机信任链与 Gatekeeper 按预期拒绝，且未 notarize；Developer ID 签名、公证、双架构包和公开 GitHub Release 只能由 tag workflow 提供最终证据。
- 未运行：GitHub / Gmail 等 Connector 的真实账号拉取；无用户凭据，不伪造线上成功，已有本地适配器、加密、游标、重试与错误状态自动化测试覆盖。
- 待远端：新增 `CI / Verify` PR 门禁；该检查首次在 PR #57 运行通过后，再把 `main` 的必需审批数从 1 调整为 0 并将该状态检查设为必须，避免形成无审批也无 CI 的保护空窗。
