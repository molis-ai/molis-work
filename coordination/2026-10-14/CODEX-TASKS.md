# 交给 Codex 的独立开发片

> **2026-10-23（洛杉矶）接续入口：** 本表仍是交给 Codex 的迭代队列；本地「统筹｜Work 全线进度 · Codex」（chat `01a12a80-ede2-7b81-93ea-521a5abcc35c`）统一接收交接、安排合并和专职评审/测试/修复。现有四个专职会话的入口见 [CODEX-SESSION-ROLES.md](CODEX-SESSION-ROLES.md)。已经派出的开发与技术裁定保留；后续开发片排在本表规定的修复、评审、测试之后，另按原授权与依赖派发，不让专职修复会话自动承担新功能开发。旧 Draft 与角色文字以最新用户要求为准。

状态：2026-10-23 起生效。用户 10-23 定：独立的开发任务可以派给 Codex，不必都在 Claude 子会话里做。统筹（本机 Claude）在这里派片、排序；Codex 做完一片在本表写 PR 号，再接下一片。

读法：

```bash
git fetch origin coordination/handoff-2026-10-14 && git show origin/coordination/handoff-2026-10-14:coordination/2026-10-14/CODEX-TASKS.md
```

## 0. 接手合并 Agent（10-24 03:40 起，先于 §2 的开发片）

用户 10-24 停了合并 Agent，它的活由 Codex 接：照 `MERGE-QUEUE.md` §1 的条件入队（第 8 条：入队前留「合并认领」，取出时写原因）、机械同步、修 CI 红、起集成批、合入后把行挪到 §3。统筹照旧排顺序、做评审、也会直接入队，两边靠 PR 上的认领避免重复。现在接手时在途的：

| PR | 要做的 | 说明 |
| --- | --- | --- |
| #1147 | batch-18 只红 `onboarding-goals-actions.test.ts`，合并 Agent 已改测试（`36f137eaa`） | 等 `ac-review` 核「有没有人直接以插件角色起轮的产品路径」，可合后入队 |
| #1120 | 机械同步 main | 二轮可合、batch-16 绿；同步后 Verify 绿即入队 |
| #1126、#1127 | 机械同步 main | 统筹一轮可合；#1127 改了安全不变量，解完核 S-47 行仍点名本 PR 的用例、S 号连续 |
| #1150 | 机械同步 main（Codex 自己的 PR） | 二轮可合；同步后入队 |
| #1151 | `serve` 第一行留在 stdout（统筹裁定） | 改完统筹看一眼即入队 |
| #1137 | 合并 Agent 02:18 手动取出、没写原因 | 现在又在队里；若再被取出要在 PR 上写原因 |
| batch-1024-19 | 统筹起的（#1130、#1157、#1148），run 40054696653 | 结果对 `known-red-main.md`；绿后按 #1130 → #1157（第 5 条改投 main 后合一次）→ #1148 合 |
| #1098、#1107、#1112 | 作者合 main 后进下一批 | batch-19 试合时 W5-06 链与 main 冲突 3 个文件 |
| `known-red-main.md` | 补一条：`tests/agent-studio.e2e.test.ts` 的「upgrade consent saves the new secret…」在 main 上也红（`ac-sc3` 10-24 在含 #1136 的 main 树上核过） | 创作台本轮不删、可绕过；记进已知红，带 owner 与原因 |

## 1. 规矩

- 照 `SLICE-RULES.md`（同目录）做：一片一个 PR、从最新 `origin/main` 开分支、规格写在 `specs/repository-anti-corruption/slices/<片名>.md`、不改 `privileges.md` 的状态列（PR 正文写「privileges.md 状态」一节）、号段只用下面分给本片的、推送前只跑构建 + `node scripts/check-health-gates.mjs --base origin/main` + `pnpm boundary:check` + `pnpm secrets:check` + 直接相关的几个测试、不跑全量。
- 分支名用 `anticorr/codex-<片名>`（统筹的监视按 `anticorr/` 前缀找新 PR）。
- 一次只做一片，排在 Codex 现有的修复、二轮评审与测试之后；机器槽位（#518）照常排队，不起浏览器批次。
- 评审：一轮由统筹的评审会话 `ac-review` 做；修评审意见由 Codex 自己做（它是作者）；二轮由 `ac-review` 复看，结论「可合」后进 `MERGE-QUEUE.md`。Codex 不给自己的 PR 写「二轮：可合」。
- 遇到 `SLICE-RULES.md` §2 里要停下来问的（兼容或迁移逻辑、改门禁本身、信任边界、页面资源 >10 KB 或新增、真实 Home），在本表那一行写问题，或在 PR 上评论，等统筹定。统筹按用户 10-23 的授权定：优先不留隐患、功能友好可用；真实 Home、发版、凭据、取消 CI 仍问用户。
- 真实 Home 与真实数据不碰，测试只用一次性 Home、用完即删；钥匙串里的 Home 主密钥条目不删。

## 2. 派给 Codex 的片（按顺序做）

| 序 | 片 | 号段 | 现状 |
| --- | --- | --- | --- |
| C0 | **main 的 macOS 红（先于 C1）**：自 #1079（S-56）起 `SandboxSdk.interaction` 写成 `import('./plugin-interaction.js')` 的相对导入，发给生成项目的 `developer/sdk.d.ts` 解析不了，`tests/agent-built-plugins-checks.test.ts`（创作台 G2）与 `tests/agent-built-plugins-workflow.test.ts` 的 W2-18-BUILDER-LATE-01 在 macOS 上失败、Linux CI 不跑（根在 `apps/local-host/src/plugin-builder/build-project.ts` 的 `sdkDeclaration()` 只拷 plugin-sandbox 一份声明，#1147 作者 10-23 核过）。修法：让发出去的 SDK 声明自包含（内联该类型或在生成时一并带上），断言不放宽；创作台本轮不删只绕过，但 main 的红要修。写进 `known-red-main.md` 直到修好 | — | **已完成**：#1136 合入 main（`15b656648`，10-23）。`known-red-main.md` 里这条由 Codex 移除 |
| C1 | W5-13 收尾：宿主日志与吞掉的错误 | RAC-110～119，BL-445～449 | 进行中：server+cli 首片 [#1151](https://github.com/molis-ai/molis-work/pull/1151) 已转非 Draft，最终补修 head `11f0d67dbc090b3fc51ca3343441545ddc75c0c3`；产品公开入口经 writeOutput 恢复 stdout，保留 EPIPE 与第二信号强退。作者交接 6378791977；本轮独立评审快看通过，本机 16 项及旧有效证据由测试专职核实，最终头 CI 待完成。原作者 chat 已改为专职修复 2，由本地全线统筹直接派单。desktop、local-host 后续片尚未开始，C1 整体未完成；日志 `/tmp/molis-verify-2026-10-23/pr1151-entry-guide/handoff.md` |
| C2 | W5-16：`molis-work home snapshot` 与恢复 | RAC-100～109，BL-440～444 | 待开工 |
| C3 | W5-10 的一部分：官方集成与横向服务的巨大单元 | RAC-120～129 里的 RAC-124～129，BL-452～454 | 待开工 |

### C1 W5-13 收尾

按区域修吞掉的错误；宿主里的 `console.*` 换成最小的结构化日志。W5-13 第一片和补片已在 main 上：先读 spec 里 W5-13 的各节，沿用已定的日志接口，不另起一套。

- 现状：`console` 还剩 28 处（`pnpm health:check` 的 console calls）。范围：`apps/server/src/main.ts`、`apps/cli/**`、`apps/local-host/src/assistant/assistant-http.ts`、`apps/desktop/**`，以及 `pnpm lint` 列出的空 `catch`、没处理的 promise（只改 TypeScript）。命令行程序与脚本里 `biome.jsonc` 本来允许的 `console` 不动。
- 不碰：工作台浏览器脚本模板字符串里的空 catch（等 W5-04 的打包）；在途 PR 改的文件（开工前 `gh pr list --state open` + `gh pr diff <n> --name-only` 查，尤其 `apps/local-host/src/{index,web-request,project-plugins}.ts`、`apps/workbench/src/scripts/client/*`）。
- 修法：带上下文记日志，或按错误模型（`defineErrorCodes`、`<主人>.<原因>`）向上抛；不能只换成 `void`。成功路径的行为不变。
- 按区域拆成两三个 PR（如 server+cli、desktop、local-host）。这些计数只许减少，改完跑 `node scripts/check-health-gates.mjs --update --base origin/main` 把降下来的数写进本地快查。

### C2 W5-16 Home 快照与恢复

`molis-work home snapshot --to <dir>` 与对应的恢复。

- 路线图原文：经常驻宿主让写入停下（quiesce），每个 SQLite 库用 backup API 备份，非 SQLite 的状态也带上，清单写版本、完整性检查结果与摘要；恢复时版本不符就拒绝。测试覆盖每一个登记的库（W4-11 的登记表）。备份口径用户已定，见 `specs/repository-anti-corruption/spec.md` §1 里「备份」那一行（决定 #20，搜 backup / 备份）。
- 主要在 `packages/storage/src/**`（新增快照模块，读 W4-11 的库登记表）、`apps/cli/src/**`、`docs/system/HOME-DATA.md`、`docs/releases/{CHECKLIST,POLICY}.md` 与新测试。
- 让常驻宿主静默如果要新入口，走现有的动作或常驻宿主转发，不改 `apps/local-host/src/web-request.ts`、`index.ts`（枢纽文件）；绕不开先问统筹。
- 秘密：快照里不能带出 Home 主密钥或任何密钥原文（密钥只给引用）；写进验收并测拒绝。只在一次性 Home 里跑。
- 先写 `specs/repository-anti-corruption/slices/w5-16-home-snapshot.md`（设计与验收），再实现。体量大可拆两个 PR（快照、恢复）。

### C3 W5-10：官方集成与横向服务的巨大单元

把下面两个区域的巨大单元拆到阈值以下，纯移动、不改行为，每个区域一个 PR。`packages/design-system` 那一份留给 Claude 的 `ac-giants`，这里不碰。

1. `plugins/official-integrations/**`（约 6 个）。只拆不搬；OAuth 搬迁是 W5-11 的另一片。
2. `horizontal/{placement,search,listener-host}` 与 `packages/im-ui`。不含 `horizontal/memory`（等记忆那条链合完再拆）和 `horizontal/scheduler`（归另一条线）。PlacementService、SearchService 在包内拆（spec §1 N-03 决定：不搬包）。

做法：`node scripts/check-health-gates.mjs --report --top 60` 看逐单元数字；拆法照 `docs/system/HUGE-CLASS-MIGRATION.md` 对每个单元的判定（单一职责的文案表、样式表、静态数据可以登记例外，但登记不放行新增，见 `AGENTS.md`）。公开 API 不变（`pnpm api:update` 后快照无差异，有差异就是拆错了）。拆完跑 `node scripts/check-health-gates.mjs --update --base origin/main`。只跑被拆文件直接相关的少量测试。

## 3. 交回

每片开完 PR：在 §2 那一行写 PR 号与头提交，PR 正文按 `SLICE-RULES.md` §4 写（防腐复查、privileges.md 状态、本机延后验证含 `affected-tests` 的 `full`）。统筹看到新 PR 后交 `ac-review` 一轮评审、插进 `MERGE-QUEUE.md`。
