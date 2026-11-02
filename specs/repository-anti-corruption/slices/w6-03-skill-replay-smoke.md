# w6-03：创作台的回放与隔离 Home 冒烟（RAC-11 走查的一次执行）

状态：已有原切点的回放／真实模型 smoke、六类静态路线及六类限定动态补证，后续证据见下节；首次 `reading` 失败仍未定因，最终样板、手册适用性与 RAC-11 整体仍「未验证」。§1–6 保留 2026-10-30 设备 B 的原运行记录。

验收编号：RAC-11（W6-03 ①）。

## 后续证据接续（2026-11-02）

本文档接续基准为 `8315c6936745c992d75b4ef21f800baeffa81f8e` / tree `cc6654467265d7764fc26d0a469451773fa3a902`；不是最终共同树 F。沿用下列已核收结果，不把原运行改署到本基准，也不重复已绿步骤。

| 证据与原切点 | 已核收范围 | 适用边界 |
| --- | --- | --- |
| 协调仓库 `coordination/2026-10-28/plans/W6-03/STATIC-WALK.md`；H `b0567bf545a74b858e4fdeddd5e66432b1065b21` / tree `4d67dc1c07b06e7538463efc2afe570a1b350796` | 新 Module、横向服务、Host 装配、前端、测试、并行工作六类入口→生产消费→约束／断言已静态核对；人工协调约束与自动门禁已区分 | 只签静态路线，不是同头动态全绿；T376 的两处旧文档矛盾已关闭 |
| `/tmp/w6-03-dynamic/REPORT.md`、`SECOND.md`；E `2ca72c3372c7987b64b8978c7f0908770516977d` / tree `8fccb9303d5131a497002ffefa4e54467c38d291` | Projects 公开 Query/Command 改名、同名身份、拒绝回滚及磁盘重开；Knowledge 真实 owner 原文／版本、完整单元截取、回执与无来源 reader 权限拒绝，均有动态结果及独立窄核收 | 合成输入、无模型；不签并发改名、实际撤权交错或完整 Host 恢复 |
| 同目录 `ROUTES-3-6.md`、`ROUTES-SECOND.md`；E `a60404292a68fa9ea6f2ee83fdf28c684d53e142` / tree `56cd025133ff51e88e856a55557b18b749b096e0` | Host/Text Stats 1/1、workspace-read 4/4；真实 Chrome 客户端生命周期 12/12；同一公开 SDK 分发包 pack→sign→verify→安装→私有笔记回读／同 Home 重开 1/1；公共槽 6/6、pool 13/13 | 各完整文件通过段分属数次执行；客户端用 HTTP 内容夹具，笔记不是成果库 Artifact；不签视觉、真实业务工作台或强杀恢复 |

原件暂存在上列本机证据目录；这里只接入已有结论。Projects 首轮通过；Knowledge 首轮因临时断言混同索引 revision 与 owner revision 失败，按 owner 合同修正后仅补该项通过。路线3～6首轮整批为 2/4 文件通过：Chrome 启动受沙箱限制，workspace 的 Node 内部断言崩溃根因仍未知；后续同源码仅补未绿两文件，分别 12/12、4/4。保留首败，不合写一次总绿。

现行操作入口是[开发要求](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)、[插件 Skill](../../../skills/molis-plugin-dev/SKILL.md)、[Prologue Skill](../../../skills/molis-prologue-ai/SKILL.md)、[扩展点 §3.1](../../../docs/system/EXTENSION-POINTS.md#31-内置插件)及[并行规则 §5.1](../../../docs/system/PARALLEL-DEVELOPMENT.md#51-子代理与并发的-agent)。本基准已说明 registration／生成登记及本次 CI Full 覆盖规则，旧静态报告中的操作文字差异不再重复派修；历史成本数字不改成当前实测。

仍未核收：手册／样板对最终 F 的适用性差集、首次 `reading` 的归因、W4 真实生成 corpus 与真签包回放，以及 W6-05 的最终场景／回归。原 smoke 不能替代插件版本回放；上述无模型路线也不能关闭 RAC-11。交付汇总见[1–23 索引](w6-06-deliverable-index.md)。

## 1. 环境与方法

- 代码：本单工作树基于 main 提交 `d9bfc504f`（`task/T315-b` @ `9488eaccd`），整体 `pnpm build` 通过（0 个 TS 错）。
- 机器：设备 B（macOS），整机同一时间只跑这一个模型冒烟，没和浏览器批同时跑。
- 模型：MiniMax `MiniMax-M3`（Anthropic 兼容地址 `https://api.minimax.cn/anthropic`，`api_format=anthropic-messages`），密钥只经 `appkey exec minimax` 在同一条 shell 里注入 `MINIMAX_API_KEY`，未打印、未写入任何会提交的文件。
- 隔离 Home：`mktemp -d` 新建（`/tmp/t315-home-…`，不在 `~/.molis-work` 里、也不包含它），`MOLIS_WORK_SECRET_BACKEND=file`。模型按 `docs/platform/STUDIO-SKILL-REPLAY.md` §3.1 的等价路径配进这个 Home：用宿主自己的设置接口 `POST /api/settings/models/minimax`（body 含 `base_url`、`api_format`、`models`、`api_key`、`check_connection: true`），返回 `status=200`、`health.status=ready`、`credential_status=present`、`checked=true`——走宿主的连通性检查，密钥落在这个 Home 自己的文件密钥库。真实 Home（`~/.molis-work`、4207/4208）没有被读写。
- 临时 Home 在冒烟结束后已整个删除（删前 `ls` 核对过目录名）；本文件不记录密钥，也没有 provider 返回的整段原文。

## 2. 离线回放（`pnpm studio:replay`）

命令：`pnpm studio:replay`（不需要密钥；本机约 2.2 秒）。

```
Studio design replay: 401 answers (383 recorded by a model, 18 synthetic) through the host's design checks
# 401 是默认集：383 份 recorded（其中 380 份是按运行记录重建的历史答卷）+ 18 份 synthetic；任务书里的 380 是 recorded.json 的子集。
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
- `reading` 是唯一的失败；同一简报、同一挂载在第二次运行 detail 一次通过。归因**拿不准**，至少两条都说得通：
  - 一是**疑似模型输出波动**：证据止于两次报告与第二次运行的对照，本单没有逐项对照失败答卷与宿主校验，**不能排除产品检查或环境**；
  - 二是**模型照抄示例**：失败报错的组件 id 是 `notes`，而设计者提示词 `plugins/native/plugin-builder/src/agent-prompts.ts:58-59` 的示例里正好有一个 id 叫 `notes` 的组件、用 `selection:notes.id` 引用（宿主规则在 `packages/design-system/src/plugin-components.ts:276`）；若是这样，问题在提示词示例，**「模型能力不打补丁」不适用**。
  - 待独立排查再定因；本单只记录两次运行与原文。
- 每条的「一次接受」「修复轮数」见上面两张表；`--out` 写在临时 Home 里，已随 Home 删除，没有留存；宿主退回的原话只有 §3、§4 的摘录。

## 4. 失败与归因（逐条）

| # | 简报/阶段 | 原文片段（定位用短片段） | 归因 |
| --- | --- | --- | --- |
| 1 | 第一次 `reading` / detail（修复轮 1、2、3 同一句） | `界面合同无效：选择来源组件不存在：notes` | **归因拿不准（初步判断）**：模型波动或照抄提示词示例都说得通（`agent-prompts.ts:58-59` 的 `notes`/`selection:notes.id`）。宿主拒绝的是日志里的组件 id `notes`；同一简报、同一挂载、第二次运行一次通过。本单只读报告、没有逐项对照这份失败答卷与宿主校验，**不能排除产品检查或环境**，待独立排查；不做新增付费调用。「模型能力不打补丁」在定因前不适用；不改语料/断言。 |
| （不计失败） | 第二次 `notes` / experience（修复轮 1） | `不能丢掉已选功能：notes.add 需要一个可到达的界面部件` | **只作观察记录**（修复轮内被接受，不构成失败）；不因同样出现 `notes` 就认定与 `reading` 同因，供后续观察 `notes` 简报的设计稳定性 |

两条都只记「归因拿不准」（模型波动或提示词示例都说得通，见 §3 与 §5）：证据止于报告里的拒绝原话和第二次运行的对照，没有逐项核对失败答卷与宿主校验，**不能排除产品检查或环境**；也没有为此新增付费调用。能确认的只有模型连通性检查 `ready`、两次都真实跑完——这排除了「连不上模型」，不等于排除了其它环境因素，所以没有把任何一条写成确定的产品问题、确定的环境问题或确定的模型能力问题。

## 5. 结论与仍然缺什么

- RAC-11 的本单目标（W6-03 的隔离 Home smoke）**已执行并留有真实模型结果**：离线回放基线通过；真实模型两次冒烟 `5/6` 次设计冻结；「一次接受」按 **detail 阶段**口径 `5/6`，按 propose→experience→detail **全过程零修复**口径 **`4/6`**（第二次 `notes` 的 experience 修复 1 轮）；1 条简报（`reading`，第一次）失败，失败归因**拿不准**：疑似模型波动、或模型照抄提示词示例（`agent-prompts.ts:58-59` 的 `notes`/`selection:notes.id`）都说得通，未逐项对照答卷与校验、不能排除产品检查/环境，待独立排查。
- **RAC-11 仍保持「未验证」**：有失败（按任务书 §2.5，有失败不写已验证/部分）；本次 smoke 当时未覆盖六类路线。后续静态及限定动态补证见开头接续，最终样板／手册对 F 的适用性与整体结论仍未核收。
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
