# T-XXX 一句话标题

<!--
写任务书的规矩（写完删掉这段注释）：
- 读的人只有这份任务书和仓库，没有统筹的上下文。凡是统筹知道、开发者猜不到的，都写进来。
- 设计决定由统筹做完写进第 5 节；不留「可以 A 也可以 B」。
- 每条路径、函数名、命令都在 main 上核过，写 `文件:行`。
- 丙档可以省掉标「乙、甲」的小节；其余小节不省，没有就写「无」。
- 改任务书时更新头部的「版本」，并在 PR 里贴【统筹答】说明改了什么。
-->

| | |
| --- | --- |
| 档 | 甲 / 乙 / 丙 |
| 派给 | 开发 A / 开发 B / Codex / 本机线 |
| 分支 | `task/TXXX-a` |
| 依赖 | T-YYY 合入后再领；或「无」 |
| 防腐项 | W5-13 / BL-810 / PG-070 … |
| 体量 | 约 N 个文件、N 行；一个 PR |
| 号 | 本任务能用的号：验收 `W5-13-16`～`18`、`RAC-1201`～`1203`；新 BACKLOG 行 `BL-820` |
| 依据 | main `<sha>` |
| 版本 | 协同分支 `<sha>` |

## 1. 背景

为什么要做，三到五句。来源写路径：spec 段落、BACKLOG 行、评审记录、风险行。

## 2. 目标

做完以后什么是真的。一到三条，每条都能检验。

## 3. 不做

容易顺手做、但这次不做的事，逐条写。每条写去向：哪个 BL 行，或「不做」。

## 4. 范围

**要改的文件**

| 文件 | 改什么 |
| --- | --- |
| `path/a.ts` | … |
| `tests/new-file.test.ts` | 新文件 |

**可能要碰、碰之前先问统筹的**：…

**不许碰的**：…（含正被别的在途任务锁定的文件）

**本任务锁定的枢纽文件**：…（在途期间不派给别的任务）

## 5. 已定的做法

统筹已经做了的决定，照做，不另选：

1. …
2. …

照着写的现有例子：`path:line`（说明照它的哪一点）。

（乙、甲）每个文件改成什么样，写到函数级：函数名、参数、返回、错误码、日志字段。

## 6. 验收

| 编号 | 条件 | 证明它的测试 |
| --- | --- | --- |
| `W5-13-16` | 给定…，当…，则… | `tests/x.test.ts`，测试名含 `W5-13-16` |

## 7. 测试

**先红后绿**：哪几条测试先写，改代码之前跑一次，要看到红；红的原因要和预期一致。

**自测命令**（照抄，按顺序）：

```bash
pnpm install --frozen-lockfile --offline
pnpm build
node scripts/run-tests.mjs --jobs 1 tests/<文件>.test.ts tests/<文件>.test.ts
node scripts/affected-tests.mjs --base origin/main --json
node scripts/check-health-gates.mjs --base origin/main
pnpm boundary:check
git fetch -q origin main && pnpm secrets:check
```

**预期**：

- affected-tests 的 `full`：预计 false 或 true，写原因；实测不同时，在【交接】里写出来。
- 浏览器用例：有或无。有的话写文件名和谁跑（有 Chrome 的开发设备，或 Codex）。
- 应该保持绿的现有用例：…

## 8. 门禁与快照

- 只许减少的数字：预计哪一项变、变多少；变小了就在本 PR 跑 `node scripts/check-health-gates.mjs --update --base origin/main`。
- 公开 API 快照（`pnpm api:update`）：要或不要。
- 动作合同快照（`pnpm build` 后 `pnpm actions:update`）：要或不要。
- 页面资源（`pnpm workspace:build` 后 `node scripts/gates/page-assets.mjs --base origin/main`）：要或不要；预计变小多少。
- 巨大单元、翻译词典、`tests/ci-product-subset.txt`：涉及就写怎么处理。

## 9. 文档

- spec：哪个文件、哪一段的状态句或进度行，改成什么。
- `specs/BACKLOG.md`：删哪一行（做完就删）；新加的行用哪个号，写什么。
- `docs/system/privileges.md` 的状态列不在本 PR 改，写在 PR 正文的「privileges.md 状态」一节。
- 其他要同步的文档：…

## 10. PR

- 标题：`<类型>(<范围>): <中文一句话>（<防腐项> · T-XXX）`，例如 `refactor(local-host): 监听者失败记进 hostLog（W5-13 · T-012）`。
- 正文前两行：
  ```text
  任务书：coordination/2026-10-28/tasks/T-XXX.md @ <协同分支 sha>
  开发：DeepSeek（设备 A）
  ```
  之后照 `.github/pull_request_template.md` 写各节，再加三节：
  - 防腐复查：逐条对 AGENTS.md 的硬约束；
  - privileges.md 状态；
  - 没验证的：哪些没跑、为什么、谁来跑。

## 11. 停下来问统筹

本任务特有的情形（通用情形在 prompt 里）：

- …

## 12. 先读

按顺序：

1. `AGENTS.md`（第一次做任务时读全文）
2. `path/README.md` 的「开发要求」
3. `path/file.ts:120-180`：…
4. …
