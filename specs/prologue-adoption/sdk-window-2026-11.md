# SDK 窗口一（第 31 批交付项 1）：设计与上游清单

状态：设计稿（2026-11-12，第 31 批主会话按用户当日决定起草）。**进展（2026-11-12）**：上游三项（A 有界子代理、B Skill 自动选用、C 续跑与写后检查）已写完、单测通过、公开 API 快照与质量棘轮通过，并已打成 `window31` 换进 `vendor/prologue-sdk/`；Molis 侧已接：给子 Run 转话不再冒充 App（SAI-03）、工具目录加 `find-skills`／`read-skill`。**业务会话（助理）的子代理 Host 接线整体留给 43-1**：本批 SDK 支持 App 模式子代理，但 Molis 的业务角色检查、业务守卫与业务工具白名单都没动，本批不声称「助理能派小帮手」。**2026-11-12 第二轮**：宿主侧代码智能已实现并接进 Coding 回合（官方编码包 `coding.find-symbol` ＋ 宿主执行器 `coding.symbol-index`，单测三条）；A4／A4-1 需求已按宿主侧改写。Coding 的主阅读者与协调者角色已声明 `find-symbol`（角色版本各 +1，`tooling/versions.json` 单源；子角色 `coding-reader` 不声明它）。**偏离**：①续跑的子代理产品入口（宿主动作与界面）留给 43-1／SAI-02 的产品动线，本批交 SDK 入口与单测；②业务会话的子代理 Host 接线整体归 43-1（见上）；③第三方插件暂时不能在 Manifest 声明 `lsp_servers`，记 BL（Q5 的自动下载按用户 2026-11-12 的决定在本批实现：默认关闭，允许时装到 Home 的隔离目录、失败不留半成品）。**PR**：[#2047](https://github.com/molis-ai/molis-work/pull/2047)（2026-11-13）。**2026-11-13 官方化**：上游 PR [#114](https://github.com/molis-ai/molis-prologue/pull/114)（合并 `1c0654b7`）与其后的 PR [#115](https://github.com/molis-ai/molis-prologue/pull/115)（合并 `5cbf2601`，写后检查带 Session/Run）已合入 `main`，vendor 从自建 window31 包换成 **main 官方构建** `prologue-sdk-0.0.0-rc.1.tgz`（1,448,221 字节，SHA-256 `2715d3c9…`）；旧包记入 `patch-history.json`，provenance 的来源就是公开 main，不再需要自建分支。**验证**：金样 `--all` 四份全过（Node 24.15）；全批 336 个受影响用例全过；门禁、边界、版本、密钥通过。评审退回过的要点（业务子代理不可达、pack 身份冲突、符号链接逃逸与 `MOLIS_WORK_*` 环境、上游提交不可重建、时间线内部名、Q5 偏离未记）已在 `batch/31` 上处理。行为与验收以 [Prologue 采用](spec.md)、[子代理](../subagent-interaction/spec.md)、[Coding 下一阶段](../coding-plugin/next-requirements.md)、[Skill 策略](../prologue-strategies/skill.md)、[升级后持续可用](../upgrade-continuity/spec.md) 为准；本文只写这次换包补什么、Molis 怎么接。

## 0. 给人讲清楚

这一批换一次 AI 运行底座（Prologue SDK）的版本，把前几批查出来的四个底座缺口补上，再把我们的平台接过去、删掉旧做法，最后用升级样本把老数据验一遍。补的四项：助理这类不碰项目文件夹的 AI 也能带小帮手（有界子代理）；技能能被自动挑出来并说明为什么；小帮手停下后能接着干同一件事、还沿用原来更小的权限；子任务写文件后也跑写后检查。代码理解（LSP）这次不放底座，放我们自己的宿主侧，所以装一个语言插件就能查到定义和引用。

## 1. 范围与用户决定（2026-11-12）

| 项 | 用户决定 | 影响 |
| --- | --- | --- |
| 换包 | 「都由本会话处理」：本会话在 `molis-ai/molis-prologue` 写上游改动、建包、换 `vendor/prologue-sdk` | 同时批了红线里的「改上游」与「换 `vendor/prologue-sdk`」；不走别的会话或上游团队 |
| LSP 归属 | 放宿主侧（插件包＋执行器接缝），不进 SDK | [Coding A4／A4-1](../coding-plugin/next-requirements.md) 改写：不再要求 Manifest `lsp_servers` 与 SDK LSP 客户端；Molis 宿主侧提供官方编码包声明的执行器 |
| Memory P1 | 前置未满足（Memory P0 仍是草稿 PR #2020，短合同 BL-memory-p1-contract 未冻结） | 交付项 2 停在「待认领」，本批只做交付项 1；[决定 36](../post-anticorruption-roadmap/reference/decisions.md#decision-36) 不变 |

上游四项合成三项（LSP 移出后）：A 有界子代理（App 模式）、B Skill 自动选用、C 子代理续跑与写后检查。

## 2. 现状（2026-11-12 核对）

| 事实 | 证据 |
| --- | --- |
| 上游 main `770a2e27`（#113）没有这四项 | `packages/sdk/src/composition/core/agent-run-admission.ts:105-111` 的 App 模式直接拒 `subagents`；`skill/core/definition.ts` 没有 `description`/`when_to_use`/`when_not_to_use`/`applies_to`；`tool/core/system.ts` 的闭集没有 `find-skills`；`runtime.subagents` 只有 `list`/`get`/`cancel` |
| 已采用包 `prologue-sdk-0.0.0-rc.1-memory-p0.tgz`（上游 `1cc80b05`）有官方编码包与执行器缝 | `dist/scenario-pack/plugin/official.js`：`coding.find-symbol` → `coding.symbol-index`、`coding.format-after-write` → `coding.formatter`、`coding.diagnose-after-write` → `coding.diagnostics`；缺执行器时工具留在目录里报不可用 |
| Molis 已用「包＋执行器」接法 | `horizontal/agent-host/src/adapters/prologue-action-tools.ts:43-83`（每次 Run 一个 `ScenarioPack`）、`prologue-run.ts:601-604`（`sessions.open(..., { pack, executors })`） |
| Molis 业务会话（助理）现在拒绝子代理 | `horizontal/agent-host/src/adapters/prologue-run.ts` 的 `assertWorkspace`（`business` 分支拒 `subagents`/`subagent_workspaces`）；`apps/local-host/src/assistant/assistant-agent.ts:75-76` 助理 `host_tools` 只有 `BUSINESS_HOST_TOOLS` |
| Molis 给子 Run 转话记成 `app` | `prologue-run.ts:362`（`steer({ text, source: "app" })`） |
| 子 Run 没有写后检查 | `prologue-run.ts:154-162` 只在本轮算 `roundChecks`；`:600-604` 执行器只绑本轮会话 |
| 没有「继续这个子代理」入口 | `packages/contracts/src/services/agent-host-ports.ts:105-106` 只有 `list`/`cancel`；`plugins/native/coding/src/browser/subagents.ts:146-159` 只有收、改、停 |
| 技能自动选用现在等于「auto 全列」 | `apps/local-host/src/assistant/assistant-round-materials.ts:149`；`plugins/native/coding/src/skill-choices.ts:41` |

## 3. 上游改动 A：App 模式的有界子代理

目标：`workspace: "app"`（Molis 的业务会话）能派出有界子代理，子会话拿到同一条业务工具，仍然没有任何文件或命令权限。

| 改哪里 | 改什么 | 拒绝什么 |
| --- | --- | --- |
| `composition/core/agent-run-admission.ts` | App 模式允许 `subagents`（含 `onStarted`、`maxDepth`/`maxConcurrent` 沿用 `orchestration.subagent`） | 仍拒 `grants`/`rootRef`/`runTool`/`skills`/`MCP`/`mount`/`workingDirectory`；App 模式带 `workspaces`/`requireWorkspace` 一律拒 |
| `composition/core/agent-run-collaborators.ts` | App 模式的本轮也建派发器（现在 `rootRef === undefined` 直接抛 `TOOL_UNAVAILABLE`） | App 模式的子任务不能选目录 |
| `composition/core/subagent-dispatch.ts` | `rootRef` 变成可选；没有根时子 Run 用 `workspace: "app"` 起，`request.workspace` 被拒 | 子 Run 的文件/命令工具名照旧按求交结果拒绝——App 模式的工具闭集本来就没有它们 |
| 子会话的业务工具 | 派发前把父会话的包绑定复制到子会话（`sessionPacks`），包和执器同一份；缺执行器时整包仍不可用 | 包绑定只复制，不新增包、不改父会话绑定 |
| 权限求交 | 沿用 `intersectPermissions`：子 = 父冻住 ∩ 请求 ∩ Host ∩ 策略 | 任何比父宽的工具名在派出时失败 |

验收：SAI-01、SAI-08（派出侧）、SAI-09、PA-21 的 App 模式部分；SKL-04 的权限岛不受影响。

## 4. 上游改动 B：首批 Skill 自动选用

| 项 | 改什么 | 验收 |
| --- | --- | --- |
| 清单字段 | `SkillManifest` 增 `description`、`whenToUse`、`whenNotToUse`、`appliesTo`；`SkillCatalogEntry` 同步投影（不含正文） | SKL-03 |
| 只返回元数据的查找 | 系统工具闭集加 `find-skills`：按任务文字/工具面返回元数据（id、版本、标签、描述、适用条件、`autoSelectable`），不返回正文；未装配、无权限、仅手动的不进自动候选 | SKL-03 |
| 选择器 | `SkillRegistry.router({ task, capabilities, maxSelected, tools })`：只选 ≤ `maxSelected` 份，每份给理由与命中条件（哪条 `whenToUse`/`appliesTo` 命中），不选也说明为什么 | SKL-02 |
| 按需读取 | `runtime.skills.read({ ref, part })` 读正文/参考/脚本，路径要落在该 Skill 的登记根内，越界、跨版本引用、缺失文件都拒 | SKL-05 |
| 回执 | `invoke-skill` 的回执带 `selectionReason`、`source`（person/model/derived）、`version`、`status`、用量，不带正文 | SKL-07 |
| 工具可见 | 选中 Skill 的工具并进本轮工具面（`selectedToolNames`），模型找得到、调得动 | SKL-15 |

## 5. 上游改动 C：续跑同一子代理与子 Run 的写后检查

| 项 | 改什么 | 拒绝什么 |
| --- | --- | --- |
| 续跑入口 | `runtime.subagents.continue({ child, instruction })`：沿原父子关系在**子会话**上开一跑，父 Run 记成同一子任务的新尝试（`taskboard-attempts`），旧结果保留 | 已结束且未明确继续的不自动重做；父已终态、子被取消、旧代次对象一律拒 |
| 权限求交 | 续跑的 `toolNames` = 原子代理收窄后的权限 ∩ 本次请求；宽于原权限的直接拒（不是静默收窄） | SAI-05、SAI-08 |
| 写后检查 | 派发时把父轮冻住的写后检查配置（检查器集合与执行器）随子 Run 传下去；子目录的检查器按子 Run 自己的目录复核 | K-1、BL-302 |

## 6. Molis 接线

| 位置 | 改什么 | 不做 |
| --- | --- | --- |
| `horizontal/agent-host` | 子 Run 转话来源透传（人→不带 `source`）；子会话沿用父会话的包（所以写后检查与 App 模式子代理可用） | 业务会话的子代理接线归 43-1（本批不动三道门）；不另建第二套子代理注册表 |
| `packages/contracts` | 本批不改；工具目录加 `find-skills`／`read-skill`／`find-symbol`（工具目录在 agent-host） | 续跑动作与技能回执投影归 43-1／Skill 消费者片；不复制 SDK 类型 |
| `apps/local-host` | `language-servers.json` 的读取与下载开关（Q5）；助理活动条先不展示子代理三步（界面归 43-1） | 不改安装与信任；助理角色不给子代理工具 |
| 退出旧路径 | 删掉 `watchChild` 里一律 `source: "app"` 的那条；删掉本批被取代的写后检查临时接法；其余候选只记 BL | 不凭猜测删 |

## 7. LSP 放宿主侧（用户 2026-11-12 定）

| 项 | 做在哪 | 验收 |
| --- | --- | --- |
| 语言服务器客户端 | 放在 `horizontal/agent-host/src/code-intelligence/`（它是给 Agent 工具提供执行器的运行时件，不是独立动作服务）：按文件类型按需起停、JSON-RPC、只读查询（定义、引用、文件顶层符号）；回合结束关闭 | A4-1 |
| 执行器 | Agent Host 只接 `coding.symbol-index`（`coding.find-symbol`）；`coding.formatter`、`coding.diagnostics` 留给后续片 | A4-1 的「查到定义与引用」 |
| 配置与获取 | 人写在 Home 的 `language-servers.json`（示例见下）；允许时缺的工具装进 `<Home>/tools/language-servers`，配置里 `command` 指向的本机可执行文件（复用已装版本）；**装完才认** | A4-1、Q5 |
| 需求改写 | `next-requirements.md` A4／A4-1 改成宿主侧执行器写法，删掉「Manifest `lsp_servers`」与「SDK 加 LSP 客户端」 | 文档一致性 |

`downloads` 不写就是 `"deny"`：先找配置里 `command` 指向的本机可执行文件（绝对路径或 PATH 上的名字），缺了报「没有服务器、下载关着」，不联网；写 `"allow"` 时还必须写 `registry`。

配置示例（人写在 `<Home>/language-servers.json`）：

```json
{
  "downloads": "allow",
  "registry": "https://registry.npmjs.org",
  "servers": [
    { "extensions": [".ts", ".tsx"], "command": "typescript-language-server", "args": ["--stdio"], "languageId": "typescript",
      "install": { "package": "typescript-language-server", "version": "4.3.4", "bin": "typescript-language-server" } }
  ]
}
```

## 8. 顺序

1. 上游 A → B → C（一个上游分支，各自一组提交，带单测）；建包（两份独立构建比对）。
2. Molis：换 `vendor/` → 合同（`packages/contracts`）→ Agent Host 接线 → LSP 宿主侧 → 退出旧路径。
3. 金样回放全过，统一构建与相关用例，开 PR。

## 9. 开工前检查（开发流程第 4 节）

| # | 回答 |
| --- | --- |
| 1 事实主人 | 子代理、技能、Run 的事实仍归 Prologue SDK（AI 运行时）；Molis 只存投影与会话索引。代码智能的服务器登记归平台（`agent-host` 的 code-intelligence），不归 Coding 插件；Coding 插件只声明要用哪几样 |
| 2 插件同等待遇 | 官方编码包的声明式执行器是 SDK 的公共机制，第三方插件同样能用；不给 Coding 开宿主私路。App 模式子代理也走同一条 `startAgentRun` |
| 3 能力注册 | 本批不新增动作；续跑的宿主动作与端口归 43-1（SDK 入口已可用） |
| 4 合同 | 本批不改 `packages/contracts`；续跑动作与端口、技能回执投影归 43-1／Skill 消费者片；本批一个 PR |
| 5 放在哪个包 | 代码智能是给 Agent 工具提供执行器的运行时件，放 `horizontal/agent-host/src/code-intelligence/`；SDK 仍只在 `horizontal/agent-host` 一处依赖 |
| 6 表与存储 | 不新增表；续跑沿用 `taskboard-attempts` 的尝试记录；代码智能不落库（只在内存里按需起停） |
| 7 兼容与迁移 | 不加兼容读取或迁移逻辑；换包后旧数据由金样回放证明可读 |
| 8 安全边界 | 代码智能只读本轮目录（符号链接两侧 `realpath`）、只跑人登记的服务器、`MOLIS_WORK_*` 不进子进程；下载默认关闭、只在 Home 的隔离目录里 `--ignore-scripts` 安装；新增 `S-code-intelligence` 不变量与拒绝用例 |
| 9 调用次数 | 一个回合只读一次 `language-servers.json`；语言服务器按命令起一次、文本不变不重复 `didOpen`（变了走 `didChange`）；打开的文档有上限；同一个 `package@version` 同时只装一次；不按文件轮询 |
| 10 升级与数据 | 换包后跑全部金样回放；库结构不变 |
| 11 成果与过程项 | 不涉及（本批不新增成果类型） |
| 12 页面与外壳 | 无新增界面、不新增 DOM 事件、不涨页面资源；Coding 时间线给新工具补了词（`coding.call.find-symbol`），不露内部名 |
| 13 错误 | 新错误码用 SDK 的 `createPrologueError` 与 Molis 的 `defineErrorCodes`；不写 Error 子类 |
| 14 冲突面 | `vendor/`、`horizontal/agent-host`、`packages/contracts`、`apps/local-host` 助理；CPU 与快照 `tooling/gates/api/` 按轨道规则 1 排队 |
| 15 全局最优 | 比过「LSP 进 SDK」与「宿主侧执行器」：后者少一个最大上游项、Coding 更快可用，代价是第三方插件暂不能声明语言服务器（记 BL，等窗口二）；比过「三项上游都留给上游团队」与「本会话做」：后者能本批收口 |
