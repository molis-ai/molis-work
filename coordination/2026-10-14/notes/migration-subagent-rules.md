# ③ 迁移子代理共用规则（2026-10-20）

你是 ③ 迁移的子代理：把一个内置插件迁到 Plugin Runtime。③ 负责规划、裁定、开 PR、写正文；你写代码、跑构建、测试和门禁。

## 开工

1. 在你的工作树里：`git fetch origin main && git switch -c <你的分支> origin/main`（不要在别的分支上开）。
2. 装依赖：`pnpm install --frozen-lockfile --offline`。
3. 读：仓库 `AGENTS.md`；`docs/system/RUNTIME-MIGRATION.md` §2.2 你的那一行、§6 清单全部；`skills/molis-plugin-dev/SKILL.md`。
4. 样板是 PPT 的迁移 `a0ceae7e3`（#748）和 Dataset `25dfd479a`（#749）：用 `git show --stat` 看，按需看单个文件的 diff。

## 枢纽文件：只改 ③ 给定的那几行

- 枢纽文件有这几样：
  - `apps/local-host/src/project-plugins.ts`
  - `tests/builtin-plugin-assembly-gate.test.ts`
  - `specs/repository-anti-corruption/spec.md` §5.1 包清单表
  - `docs/SSOT-MATRIX.md`
  - `tooling/gates/*`
- 你只改说明里写定的行：
  - 监督器条目放在给定的位置，按字母序；
  - 门禁名单只挪动你自己插件的 id；
  - §5.1 表只换你插件那一行，用 `node scripts/gates/package-inventory.mjs --table` 生成；
  - SSOT 只改你插件那一行。
- `tooling/gates/*` 只用脚本的 `--update` 改（`pnpm actions:update`、`node scripts/gates/page-assets.mjs --update --base origin/main`、`node scripts/check-health-gates.mjs --update --base origin/main`），不手改数字。
- 需要改其他行，先停下来问 ③。

## 本机规矩

- 每个构建、测试、门禁命令都走：`/Users/creamiex/molis-ai/molis-work/.claude/coord-shared/tools/heavy.sh "③-<插件> <做什么>" -- <命令>`
  - Bash 加 `run_in_background: true`；输出写进日志文件，只读失败段（tail、grep）。
  - 健康门禁的标签里要含 `check-health-gates`。
- 构建只建改过或过期的包：`pnpm --filter <包>... run build`，或者 `pnpm build`，但只建一次。
- 测试只跑受影响的：`node scripts/run-tests.mjs --jobs 2 <文件…>`，`node scripts/affected-tests.mjs` 给建议。
  - 不跑全量，不跑浏览器用例（`*.e2e.test.ts` 里要开 Chrome 的那些）。
- zsh 的坑：
  - 没有 `timeout`；
  - 前台 `sleep` 被拦；
  - `cd` 会一直留着，所以用绝对路径或 `git -C`；
  - 没有 `npx`，用 `pnpm exec`。
- **红线**：
  - 不碰真实 Home（端口 4207 和 `~/.molis-work`）；
  - 不 push，不开 PR（由 ③ 做）；
  - 不 force；
  - 不用裸 `git stash`；
  - 停进程只按 pid。

## 质量线（防腐）

- 不写 `as unknown as`、显式 `any`、空 `catch`。
- 门禁的数字只许降。
- 不为变绿跳过、放宽或删除断言；测试失败先分清是产品回归、预期变化，还是环境与时序。
- 判断一个失败是不是你引入的：开一个干净的基线工作树跑同一个文件（`git worktree add --detach <路径> origin/main`），用完删掉。
- 新验收编号写成 `W5-01-<插件大写>-NN`，写进 spec 的验收行，测试名或注释里带编号。
- §6 第 8 项：清点写死的 `provider_id`，结果写进回报。
- 第 10 项「项目已删」步骤要有用例。
- 交给 ③ 前要跑过这些，失败照实写：
  - `pnpm boundary:check`
  - `node scripts/check-health-gates.mjs --base origin/main`
  - `pnpm actions:update`、`page-assets --update`（如果有变化）
  - `git fetch origin main && pnpm secrets:check`

## 回报（15 行以内）

- 分支名和头提交。
- 改了什么（按文件组，一行一组）。
- 测试：哪些文件、过了几条、失败的那几行。
- 门禁结果。
- `provider_id` 清点结果。
- 要 ③ 裁定的事。
- 你动过的枢纽行。

提交信息写英文，最后一行是 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。

## 动作版本（① 2026-10-20 裁定）

- 只改了权限、受众、`kind`、`scope`、`scheduling` 一类，而 schema 形状没变的动作：**不升版本，也不改 MCP 工具名**（`tooling/gates/README.md` 第 121 行「谁能调、怎么调变了」）。
  - 在回报里写一句「合同影响：已授权的要在设置页重新授权」，③ 把它写进 PR。
- 只有输入、输出这类形状真的变了才升版本。
- 升版本会改 MCP 工具名，这是对外的变化：先停下来报 ③，由 ① 决定要不要问用户。
