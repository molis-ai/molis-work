# 统一现有 AI 能力至 Prologue

2026-09-26，用户明确「AI 能力都使用 Prologue」。目标为现有生产 AI 路径完整迁移且保持原产品行为，达到内部完整，不只约束新增功能。

## 已核实证据

`apps/local-host/src/host-complete-text.ts` 的 `completeTextRequest` 直接 fetch 文字模型；`assistant-http.ts` 等生产入口使用它。`plugins/native/images/src/providers.ts` 的 `generateProviderImages` 直接请求 OpenAI Images/Gemini。原审查任务报告 Form、Dataset、Pages、灵光、Jelly、Workflow 等消费前者，需逐一核对当前装配；Cognia/Onboarding/Alchemist/Coding/Builder 有 Prologue 基础，需复用。

## 行为与范围

- 列出所有现有生产推理/生成路径与实际调用链，区分第三方资料/业务 API 与模型推理。所有 AI 经真实 Prologue 执行端口，Provider 网络访问留在 Prologue 所属能力中。
- 迁移通用文字生成与图片生成，再核对其他入口是否仍绕过。不能只在旧直连外包一个名叫 Prologue 的函数，也不能用 Agent 工具调用旧直连来伪装迁移。
- 保持当前显式模型选择、凭据引用、撤权/配置变化处理、取消/超时、材料保留、错误展示及输出保存。图片 MIME、大小、远程结果下载等既有有效边界不得回退。
- 凭据、模型设置及 Character 不复制；不造第二份 Agent Host/Session/工具目录。若当前 SDK 缺图片等所需能力，列出具体必要补充，与原 Agent Host owner 串行交接；继续完成独立部分，禁止静默退回直连。
- 不重做插件 UI、动作体系、模型设置产品、Connector 业务读取或新助理；只做达成本项要求必要的调用路径迁移。

## 并行边界

独立工作树、原 checkout 只读。原动作任务 `01a0d468-fe5c-7410-8ae8-63a608d76f6d` 已在2026-09-26明确移交整条共享推理实现给本任务：除文字/图片/TypeSafe调用端，还包括inference类型/适配/resolver、既有Runtime装配返回/close、composition inference代理、system-agent-service凭据绑定，以及SDK image/TypeSafe/本地调度必要扩展。先接收并保留主树F1/F3的actor/owner/budget/trusted caller/lazy-init修复，再实现可运行整体；不能用旧工作树覆盖这些修复或单独合入不能编译的调用端。

原动作owner仍拥有Action权限、Character、Workflow及业务接入；project-host生命周期必要最小diff由本任务提交给它串行落地。涉及同一源文件时，移交窗口只由本任务落笔，原owner的必要改动以最小diff交接，不能按代码片段默契并写。允许Home到既有inference端口引用的bind/unbind查询，禁止新Runtime。SDK/锁依赖与原owner及Builder当前依赖窗口串行交接。
独立工作树、原 checkout 只读。专属修改是 `host-complete-text.ts`、图片生成调用端/适配及相关回归和文档；先核对原 owner 正在修改的文件，再精确确认边界。原动作任务 `01a0d468-fe5c-7410-8ae8-63a608d76f6d` 唯一维护共享 Agent Host/Prologue 接线/Character/Action 核心；本任务提交最小接口需求，不与其同改 SDK/运行时。SDK 依赖变化由双方串行落实，不影响当前其他工作。

depends_on：现有 Prologue/Agent Host 与当前模型配置/Secret 协议；新增助理消费迁移后的共用接口，不等待它实现。

## 验收

真实 Prologue 执行证据覆盖文字和图片：生产装配确实进入 Prologue，返回内容能进入原业务持久化和后续编辑。注入测试验证取消、权限/配置变化、无模型、错误响应、低质量/空输出、失败材料保留和重试；不得只查字符串/导入名称判断迁移成功。

核对消费者、跑受影响包 build/typecheck 和有效回归，使用隔离数据及已配置服务做真实模型实操；缺可用图片服务时准确记录未验证项并继续其他路径。保留已有正确能力，不以关闭功能或模型直连兜底换取测试通过。精确命令和验证结果由实施任务补充。

## 实施合同（2026-09-26）

实施任务 `01a0dbaa-54dd-7b60-be5a-fc07ce030e8d`，独立工作树 `/Users/yijunwang/.codex/worktrees/2f9d/goalboard`，分支 `feature/prologue-convergence`。启动快照包含既有未提交修改，仅交付本项相对启动快照的改动。原 checkout 只读。

文字调用端继续拥有输入验证、固定选择、配置/凭据可用性重检和业务错误；共享 Prologue owner 提供有界正文执行端口，保留 5000 输出 tokens、120 秒超时、取消、prompt cache 与协议/端点。图片任务继续拥有持久化、幂等、取消/重启恢复和真实文件验证；Host 注入共享 Prologue 图片执行端口，插件不得自行进行模型网络请求。现有 SDK 已有 ImageSurface，但缺少已核实的完整 Gemini、signal 与远程图片结果兼容能力，补充由共享 owner 串行处理。

额外已核实 `modules/functions/src/provider.ts` 的 TypeSafe SystemOne 也是生产模型直连。必须保留 choice/noul/score、questions/state、概率与 usage 语义；归属与共享 owner 协商，不能替换成普通文本 prompt 或遗漏。原生 OCR/Whisper 是本地素材提取，单独记录为范围事实。

验证先以真实 Prologue SDK + 隔离本地模型协议服务覆盖生产装配、协议、取消、拒绝晚到结果、原材料保留、图片字节保存与重开读取，再使用无隐私材料和当前已配置服务验证真实模型。模型配置重检的证据不能替代共享 Action owner 的提交前权限复核。

### 生产能力清单与当前进展

| 能力 | 当前实际链路 | 迁移责任与验证 |
| --- | --- | --- |
| 通用文字 | Form、Dataset、Pages/Inbox、灵光、Jelly、Workflow AI 交接、信息助手 → hostCompleteText | 调用端改为异步 resolvePrologueInference(home).completeText；同步 discovery 保留，不解密凭据。共享端口待接线实操。 |
| 图片 | Action → ImagesHostService → ImagesService → generateProviderImages | 插件只验证真实 bytes/MIME/体积并保存；Host 调共享 generateImages，SDK 必须保留 OpenAI/Gemini、URL 下载、无 key 本地服务与网络边界。 |
| TypeSafe | Functions/Feed/Inbox/Home、Builder Jev 选择、实验台 Jev → createTypeSafeProvider | 原生 model/state/questions 与 choice/noul/score/probabilities/usage 不变；Host 调 evaluateTypeSafe，禁止普通提示词模拟。 |
| 已有 Prologue | Cognia、Context Onboarding、Alchemist、Coding、Builder 主生成、模型连接测试 | 保留现有生产能力，共享 owner 统一生命周期/收尾。 |
| 本地 OCR / Whisper | Jelly 原生 helper 的 Apple Vision / WhisperKit | 真实本地模型推理；通过共享 Prologue 的本地能力调度接入，保留进度、取消、时间戳、模型下载选择与原文件。SDK/Host 端口待 owner。 |
| 实验台 Laya / Grok | experiments-executor → Python JsonWorker / Grok CLI | 真实推理，不是连接测试；需共享执行端口保留固定模型、隔离核验与结构化实验输出。 |
| 外部 Agent 会话 | Agent Host 的 Claude Code CLI、Work 的 Codex app-server | 属于现有外部运行时集成；已报共享 owner，不能擅自删除或视为已走 Prologue。 |
| 确定性解析 / 业务读取 | UTF-8/HTML提取、PDF原生文字层、OAuth、Connector 资料下载 | 无模型推理，不迁移成文字大模型。 |

图片补充验收：固定模型、协议、端点、凭据在排队后与保存前再次核对；凭据解析时再次检查，拒绝异步初始化期间撤权。失败保留 prompt/任务和显式重试入口，不自动重跑。

已执行：图片输出边界与持久化/取消/重启/配置变化回归 24/24 通过；TypeSafe 原生协议/取消/脱敏 3/3 通过。这是注入端口验证，不能代替 Prologue SDK 或真实模型实操。

环境事实：启动快照 pnpm-lock.yaml 缺 im-ui workspace 项；冻结安装失败，采用不读写 lockfile 的本地安装。依赖构建遇到既有 `packages/design-system/src/plugin-components.ts:133` unknown payload 错误，尚未修改共享文件。

### 本地识别与外部执行的精确接线需求

- Jelly 调用方是用户上传/已保存材料读取。UTF-8/HTML 为确定性解析；PDF 原生文字层同样无需模型；图片与无字 PDF 使用 `jelly-material extract <保存副本>` 的 Apple Vision。输入先校验文件名、25 MB、内容寻址存储，拒绝任意路径；输出 text/pages/coverage，页面 confidence 可空。120 秒、20 MB stdout，取消后保留原始上传副本。Prologue 正式本地能力需接收已授权副本引用、可执行组件身份、signal，返回原结构，不能恢复任意 shell 或把原材料送云端。
- 音视频使用 `jelly-whisper extract <副本> <模型目录> <临时目录> [--allow-model-download]`。WhisperKit 真实推理加最多五帧 Vision；输出 text、带时间戳 segments/frames、duration、coverage；stderr JSON progress，30 分钟、20 MB stdout。默认离线，模型/tokenizer 缺失只有用户显式 `allow_model_download` 才下载，约 626 MB。取消/失败保留原副本、清理本次临时目录。现有 Helper 附带 Apple Foundation Models summarize 命令，但无 TS 生产调用，不能当作已启用功能。
- 实验台 Laya 输入 `{task:{instructions,criteria},input}`，固定 `multilingual` checkpoint 路径包含用户配置 revision；Python JSONL worker，`HF_HUB_OFFLINE=1`、`TRANSFORMERS_OFFLINE=1`，返回 choice/model/probabilities/confidence/token统计/设备/耗时。180 秒、1 MB stdout、取消杀进程组，无自动重试，服务关闭结束 worker。Prologue 调度须保留 worker 生命周期与请求隔离，不能把概率判断换为文字生成。
- 实验台 Grok 同一结构输入，经已配置 CLI 执行。临时 GROK_HOME，现有原生登录路径只由 CLI 使用；启动前 inspect/plugin list 禁用工具、扩展、Memory、外部指令；固定 grok-4.6/xhigh、单轮、choice JSON Schema；完成后验证实际模型/effort/session审计。返回 choice、usage、估算费用、runtime version和isolation；180秒、2 MB stdout、取消杀进程组、finally删除临时目录。接入必须保留模型选择与隔离核验，不能仅把旧spawn改名为Prologue。
- Claude Code 是 Agent Host 的 CLI adapter；Codex app-server 是 Work Session RuntimeHost adapter，含既有会话继续/消息/交接。这些是用户选择的外部 Runtime 集成，不能为收敛删除。由共享 owner 给出正式调度桥或经统筹明确范围；本项不改 AgentHost/RuntimeHost 核心。

这些能力的 Prologue 调度端口尚未落地，当前不宣称“所有 AI 已收敛”。

### 验证记录与当前交接点

- `pnpm --filter @molis-ai/molis-work-plugin-images... --filter @molis-ai/molis-work-module-functions... run build`：通过。共享 design-system 的既有收窄错误已由 Builder owner 修复，本工作树只同步其两行修复，不放入本任务补丁。
- `pnpm --filter @molis-ai/molis-work-module-functions run typecheck`：通过。
- `node --import tsx --test tests/images-providers.test.ts tests/images-service.test.ts`：原 24 项通过；随后新增延迟凭据解析撤权场景通过。全量依赖构建并发期间，既有跨进程用例一次触发 10 秒启动超时；构建压力下降后定向重跑通过，未放宽超时或生产语义。
- `node --import tsx --test tests/typesafe-inference-port.test.ts`：3/3 通过，choice/noul/score 原协议、概率与 usage、取消及错误脱敏。
- 已准备 `tests/host-inference-completion.test.ts`（真实调用端的注入端口测试）与 `tests/host-configured-text.test.ts` 的 SSE 协议服务：等待共享 resolver 实际模块落地后执行，未以占位 Runtime 或虚构成功补齐。
- 共享生命周期模块 `apps/local-host/src/prologue-inference-host.ts`、SDK 图片/TypeSafe 正式执行、真实生产装配和真实模型实操仍未完成；本地识别及外部 Runtime 正式调度仍待共享合同。整个目标仍为实施中，不能宣称内部完整。

可供串行集成的阶段补丁：`outputs/prologue-convergence/callsite-migration.patch`，由启动基线生成，`git apply --check` 通过；不包含原 checkout 既有修改、共享核心或其他 owner 的依赖修复。Builder owner 正在重写 surface，应只接 `createPrologueTypeSafeProvider(homeDirectory)` 那两处，不全文件覆盖。

最新验证：`node --import tsx --test tests/images-plugin.test.ts tests/images-providers.test.ts tests/images-service.test.ts tests/typesafe-inference-port.test.ts` 全部 30/30 通过；Images 包 typecheck 通过，覆盖插件 Manifest、路由项目隔离、图片下载与本地真实保存。共享 resolver 尚未落地，阶段补丁不可单独作为可运行整包合入。

## 共享推理实施权交接（2026-09-26）

协调任务与原 Action owner 已将 prologue-node、agent-host-composition、system-agent-service 整文件及新增 inference/types/resolver、SDK、vendor 接线移交本任务唯一写入；原树仍只读。本地已同步 F1/F3 身份、预算和 lazy init 当前基线。index.ts 只给新增导出 diff，project-host.ts 生命周期给原 owner 串行整合。SDK 在现有 prologue-action-loopback 工作树延续，不开第二 Runtime。

同一 Runtime 中，纯文本用 ephemeral Session/Run，图片走 runtime.images，TypeSafe 保留结构化协议执行。Home registry 只引用已装配服务、不创建运行时。每次调用有独立凭据解析、信号与上限；关闭取消在途执行。Builder 接入同 Runtime 的受限 host seam，并保留实际模型和用量回执。SDK扩展合同在 docs/slices/bounded-inference.md。

### SDK 原生推理阶段验证

同Runtime的文字/图片/TypeSafe端口已落源码。SDK现有 image-generation+model-loopback 23项通过；新增真实 Node Host bounded-inference 8项通过，验证Gemini auth、OpenAI/URL、本地auth-none、公网none拒绝、跨本地origin/重定向拒绝、40MB/20MB可配置边界、MIME、取消/关闭、native TypeSafe与safe status、最终Host撤权guard；生命周期定向2项通过（prepare期间取消与关闭、响应后关闭不发布）。model-stream-shape/module-config/host-network现有50项通过。测试身份appVersion初次填错导致新增8项未进入业务，已修为1.0.0后8项全通过。当前仍未打新包、消费者尚未完成build，不声称内部完整；Builder session-scoped allow、workspace:none与native本地执行仍需完成。

### 共享装配阶段与本地 transport 接线

SDK workspace:none 与 per-run grants 及效果隔离共70项定向通过，最终build通过。GoalBoard无目录模式持久化到原SessionIndex，旧缺省仍required；none跳过root/tool/MCP/子任务准备，仍使用同SDK Character/材料/ledger。共享inference通过同AsyncLocalStorage将业务beforeDispatch与实时凭据/配置检查送到Host最后fetch前；取消后的迟到resolver不再写凭据，空key本地图片保留。TypeSafe调用方现在提供实时credential getter与连接版本snapshot。

当前AgentHost、LocalHost、Desktop均编译通过；consumer36项通过。个人助理owner在新SDK/dist联验27项通过，9种prepare/credential/final dispatch撤权交错均fetch=0、无建议写入；这是受控协议的真实SDK执行，不代表商业模型质量。阶段集成包 /tmp/prologue-convergence-integration-v1 已交Action owner，SDK源码补丁可逆检查与callerpatch基线apply-check通过，原树未写入。Builder真实模型另由其owner联验。

本地模型采用SDK正式localInference prepare/invoke/close与NodeHost冻结程序handle。一次性OCR/Whisper/Grok及JSONL Laya同一生命周期；Host实际spawn、限制bytes/timeout、取消进程树，SDK持有handles/资源/回执并在shutdown收尾。可信App冻结程序和环境，invoke仅给有界输入，不开放任意executor函数或旧spawn回调。产品已有解析器保留confidence/coverage/timestamps/choice/usage与Grok审计；确定性UTF8/HTML仍原实现。详细可验证合同已写SDK docs/slices/bounded-inference.md；不是仅重命名旧进程调用。外部Claude/Codex的持续会话桥仍需按原能力接入，目标范围未缩减。
