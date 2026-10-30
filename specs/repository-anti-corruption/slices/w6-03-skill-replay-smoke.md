# w6-03：创作台的回放与隔离 Home 冒烟（RAC-11 走查的一次执行）

状态：已跑（2026-10-31，设备 B）；离线回放通过基线，隔离 Home 的真实模型冒烟两次里第一次有 1 条简报失败——失败只记录，不修。W6-03 剩下的场景走查与手册末一遍仍未做，RAC-11 保持「未验证」。

验收编号：RAC-11（W6-03 ①）。

## 1. 环境与方法

- 代码：本单工作树基于 main 提交 `d9bfc504f`（`task/T315-b` @ `9488eaccd`），整体 `pnpm build` 通过（0 个 TS 错）。
- 机器：设备 B（macOS），整机同一时间只跑这一个模型冒烟，没和浏览器批同时跑。
- 模型：MiniMax `MiniMax-M3`（Anthropic 兼容地址 `https://api.minimax.cn/anthropic`，`api_format=anthropic-messages`），密钥只经 `appkey exec minimax` 在同一条 shell 里注入 `MINIMAX_API_KEY`，未打印、未写入任何会提交的文件。
- 隔离 Home：`mktemp -d` 新建（`/tmp/t315-home-…`，不在 `~/.molis-work` 里、也不包含它），`MOLIS_WORK_SECRET_BACKEND=file`。模型按 `docs/platform/STUDIO-SKILL-REPLAY.md` §3.1 的等价路径配进这个 Home：用宿主自己的设置接口 `POST /api/settings/models/minimax`（body 含 `base_url`、`api_format`、`models`、`api_key`、`check_connection: true`），返回 `status=200`、`health.status=ready`、`credential_status=present`、`checked=true`——走宿主的连通性检查，密钥落在这个 Home 自己的文件密钥库。真实 Home（`~/.molis-work`、4207/4208）没有被读写。
- 临时 Home 在冒烟结束后已整个删除（删前 `ls` 核对过目录名）；本文件不记录密钥，也没有 provider 返回的整段原文。

## 2. 离线回放（`pnpm studio:replay`）

命令：`pnpm studio:replay`（不需要密钥；机房约 2.2 秒）。

```
Studio design replay: 401 answers (383 recorded by a model, 18 synthetic) through the host's design checks
sources: built-in prompt example, tests/fixtures/studio-replay/corpus.json, tests/fixtures/studio-replay/recorded.json,
         tests/fixtures/builder-designer/minimax-notes-v1.json

First answers accepted without a repair round (attempt 0)
  recorded detail       42/80   53%
  recorded propose      71/99   72%
  recorded revise       32/48   67%   (1 of the 16 refused name an action the run record does not show; if the host accepted those, at most 69%)
  synthetic detail       7/12   58%
  synthetic propose      2/4    50%
  synthetic revise       1/2    50%
  answers to repair requests: 99/156 accepted

Baseline tests/fixtures/studio-replay/baseline.json: every recorded result still holds
```

结论：`401` 份答案全部跑完，**基线逐条保持**（`every recorded result still holds`），没有回归，也不需要改语料或放宽 `--min-pass`。报告同时列出「挂载的 Skill/提示词相对基线变了」（design 16144→18786 字、experience/review 3598→5772 字、ui 5155→7329 字、code 8928→9396 字，`ui-review/2.0.0→2.1.0`、`designer/3.7.0→3.8.0`）——回放喂固定答卷，说明不了这变化对真实模型的影响，所以下一节是真实模型冒烟。

## 3. 隔离 Home 的真实模型冒烟（`pnpm studio:replay smoke`）

命令（两次，同一批简报 `tests/fixtures/studio-replay/smoke-briefs.json`，各一份 `--out`）：

```
MOLIS_WORK_HOME=<临时目录> MOLIS_WORK_SECRET_BACKEND=file pnpm studio:replay smoke --out <临时目录>/smoke-1.json
MOLIS_WORK_HOME=<临时目录> MOLIS_WORK_SECRET_BACKEND=file pnpm studio:replay smoke --out <临时目录>/smoke-2.json
```

两次都用了真实模型（报告里 `model: "MiniMax-M3"`、`standIn: false`），不是 `--stand-in`。

### 第一次（2026-10-30T17:27:50Z）

```
Generation smoke: 2/3 briefs reached a frozen design with MiniMax-M3; 2 full designs accepted on the first answer; 3 repair rounds in all
  notes            designed     25s  propose first try, experience first try, detail first try  [3 operations, 4 parts, 4 acceptance cases]
  reading          failed       70s  propose first try, experience first try, detail 3 repairs  界面合同无效：选择来源组件不存在：notes
  expenses         designed     62s  propose first try, experience first try, detail first try  [4 operations, 4 parts, 6 acceptance cases]
```

| 简报 | 一次接受（propose / experience / detail） | 修复轮数 | 结果 |
| --- | --- | --- | --- |
| `notes` | 是 / 是 / 是 | 0 | 设计冻结 |
| `reading` | 是 / 是 / **否** | 3（全在 detail） | **失败**（未到冻结设计） |
| `expenses` | 是 / 是 / 是 | 0 | 设计冻结 |

### 第二次（2026-10-30T17:30:29Z）

```
Generation smoke: 3/3 briefs reached a frozen design with MiniMax-M3; 3 full designs accepted on the first answer; 1 repair rounds in all
  notes            designed     27s  propose first try, experience 1 repairs, detail first try  [3 operations, 4 parts, 5 acceptance cases]
      repair experience: 不能丢掉已选功能：notes.add 需要一个可到达的界面部件
  reading          designed     36s  propose first try, experience first try, detail first try  [3 operations, 5 parts, 4 acceptance cases]
  expenses         designed     93s  propose first try, experience first try, detail first try  [4 operations, 5 parts, 3 acceptance cases]
```

| 简报 | 一次接受（propose / experience / detail） | 修复轮数 | 结果 |
| --- | --- | --- | --- |
| `notes` | 是 / **否** / 是 | 1（experience） | 设计冻结（第 1 轮修复后） |
| `reading` | 是 / 是 / 是 | 0 | 设计冻结 |
| `expenses` | 是 / 是 / 是 | 0 | 设计冻结 |

### 两次对比

- 设计冻结：第一次 `2/3`，第二次 `3/3`。
- 「一次接受」按 `scripts/studio-replay/smoke.mts:107` 的 `summary.detailFirstTry` 口径是 **detail 阶段一次接受**：第一次 `2/3`（`reading` 的 detail 3 轮后仍未过），第二次 `3/3`。若按 propose→experience→detail 全过程零修复统计，第一次 `2/3`、第二次 `2/3`（第二次 `notes` 的 experience 实际修了 1 轮），合计 **`4/6`**。两种口径都写在这里，下面的每阶段表保留 propose/experience/detail 各自的一次接受与修复轮数。
- 修复轮数合计：第一次 `3`，第二次 `1`。
- `reading` 是唯一的失败；同一简报、同一挂载在第二次运行 detail 一次通过。这两次输入的差异指向**疑似模型输出波动（初步判断，见 §4）**：本单只读了两次报告、没有逐项对照失败答卷与宿主校验，**不能排除产品检查或环境**，待独立排查。
- 每条的「一次接受」「修复轮数」见上面两张表；报告的 `repairs` 字段保留了宿主退回的原话（§4）。

## 4. 失败与归因（逐条）

| # | 简报/阶段 | 原文片段（定位用短片段） | 归因 |
| --- | --- | --- | --- |
| 1 | 第一次 `reading` / detail（修复轮 1、2、3 同一句） | `界面合同无效：选择来源组件不存在：notes` | **疑似模型能力/输出波动（初步判断）**：宿主拒绝的是模型自己写出的、不存在的来源组件 `notes`；同一简报、同一挂载、第二次运行一次通过，指向模型这一轮输出的差异。但本单只读报告、没有逐项对照这份失败答卷与宿主校验，**不能排除产品检查或环境**，待独立排查；不做新增付费调用。按用户 2026-10-16 定不打补丁、不改语料/断言。 |
| （不计失败） | 第二次 `notes` / experience（修复轮 1） | `不能丢掉已选功能：notes.add 需要一个可到达的界面部件` | **疑似模型能力（初步判断）**（修复轮内被接受，不构成失败；记录在此，供后续观察 `notes` 简报的设计稳定性） |

两条都只记「疑似模型能力（初步判断）」：证据止于报告里的拒绝原话和第二次运行的对照，没有逐项核对失败答卷与宿主校验，**不能排除产品检查或环境**；也没有为此新增付费调用。能确认的只有模型连通性检查 `ready`、两次都真实跑完——这排除了「连不上模型」，不等于排除了其它环境因素，所以没有把任何一条写成确定的产品问题或确定的环境问题。

## 5. 结论与仍然缺什么

- RAC-11 的本单目标（W6-03 的隔离 Home smoke）**已执行并留有真实模型结果**：离线回放基线通过；真实模型两次冒烟 `5/6` 次设计冻结；「一次接受」按 **detail 阶段**口径 `5/6`，按 propose→experience→detail **全过程零修复**口径 **`4/6`**（第二次 `notes` 的 experience 修复 1 轮）；1 条简报（`reading`，第一次）失败，失败归因只到「疑似模型输出波动」的初步判断（未逐项对照答卷与校验，不能排除产品检查/环境）。
- **RAC-11 仍保持「未验证」**：有失败（按任务书 §2.5，有失败不写已验证/部分）；且 W6-03 的「场景走查」其余部分与手册末一遍仍未做、最终样板和手册没齐。
- 未做、也不在本单做：不改 Skill 章节、`agent-prompts.ts`、校验代码、语料或回放脚本；不为变绿改基线或放宽 `--min-pass`。

## 6. 复现

```bash
pnpm build
pnpm studio:replay                                  # 离线：基线必须保持
home=$(mktemp -d)                                   # 隔离 Home，不能是 ~/.molis-work 或在它里面
MOLIS_WORK_HOME=$home MOLIS_WORK_SECRET_BACKEND=file pnpm web --port <空闲端口>   # 设置 → 模型设置，加一个 MiniMax 供应商与密钥
MOLIS_WORK_HOME=$home MOLIS_WORK_SECRET_BACKEND=file pnpm studio:replay smoke --out "$home/smoke.json"
rm -rf "$home"                                       # 先 ls 核对再删
```

模型配置的等价接口：`POST /api/settings/models/<id>`（带 `x-molis-work-control-token`，body 含 `base_url`、`api_format`、`models`、`api_key`、`check_connection: true`）——本单就是这样配进临时 Home 的，和设置页保存走同一条宿主逻辑。

— DeepSeek（设备 B）
