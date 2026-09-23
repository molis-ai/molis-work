# 炼金术士完整迁入 Molis Work

## 目标与完成等级

将 `/Users/yijunwang/code/alchemist` 的完整业务能力迁入当前 native 插件。用户明确纠正：不复刻 UI；视觉、路径、操作动线必须采用 Molis Work。目标完成等级：4 内部完整。

## 当前问题与证据

现有 `src/store.ts` 的 `demoIdeaCards` 固定拼三张模板卡，原 spec 明确排除了市场脉搏、Lens、预算、Copilot、注释、Memory、导出。源项目已有 SQLite 版本对象、后台任务、两种 Lens、证据、决策、公开来源采集、上下文对话与完整 React 工作面。重新手写缩减版本不能满足完整业务迁移。

## 保留、替换、忽略

- 保留：源项目 Direction → Idea 手牌 → 全页 Brief → 保留版本 → 独立市场空间/实现成本 Lens → 同版本双报告 Decision；Pulse → 机会 → Direction；选区注释、Research Playbook、Founder Taste、Copilot、活动与 JSON/ZIP 导出。
- 替换：独立服务端/启动脚本、直接 OpenAI 调用与 Keychain 设置，用宿主 HTTP 生命周期、项目隔离与 Prologue SDK；所有生产 AI 均经 Prologue，无 demo 自动兜底。
- 忽略：原独立应用端口、独立账户/云/Relay 规划、设计原型历史；不修改源仓库，不带入源 data、密钥或 node_modules。

## 方案与边界

1. 将源 domain/shared/server 代码复制至插件内 `src/studio`，成为本仓库拥有的实现。保留业务语义与来源链路，使用已验证源代码和定向测试；不从外部绝对路径运行或导入。
2. 使用 Molis Work 原生 plugin-stage 的满宽分组列表→对象详情、窄屏返回、原生按钮/对话框/状态/主题。移除插件 iframe、React 页面、Founder Lab 顶栏、纸张衬线视觉、独立 hash 路由与浮动 Copilot。方向/已保留/市场脉搏/决策是舞台内的集合筛选；候选比较在方向详情内完成，保留后继续同一工作面研究与决策。讨论、注释在当前对象上下文中打开；模型配置进入宿主设置路径，项目研究偏好与 Memory 在原生详情中维护。
3. 保留已有项目绑定业务 API 与数据库，不迁移既有记录。前端通过宿主 route() 请求 API，用户始终在 `/projects/<id>/` 的 Molis Work 工作面中操作。旧独立页面入口只引导回宿主，不继续发布旧 UI。按可信 projectId 隔离数据库，query/body 不得覆盖宿主绑定。
4. 现演示库保留并提供只读历史入口/导出，不能升级为真实证据。新建方向不生成演示内容。
5. 插件声明业务 AI port；宿主 adapter 解析 Molis 模型配置/凭据，经 Prologue Node adapter 执行。Idea、Copilot、研究规划/收集/交叉验证/综合使用同一 port。模型不可用给明确恢复提示，不静默切 provider 或 fixture。
6. 研究外部证据经真实公开搜索/采集能力提供，保留 URL、支持/反向信号、未知和修改判断条件。无来源不得伪造 Evidence 或伪称完整研究。
7. 保留严格用户确认调用上限、检查点、重启恢复、取消后不发下一调用、固定模型语义。发出外部调用前落盘；若重启后无法确认该次调用结果，标记中断让用户重试新计划，不自动重复消费。JSON 校验失败不得保存成功对象。
8. 首次使用显示模型就绪状态和宿主设置去向；插件设置只管模型选择与预算、Memory、本地导出，不持有/读取/导出 API key。
9. 修复迁移中确认的原版问题：Copilot 实际消费对象正文、历史讨论和有效 Taste；所有已采集证据在部分报告中仍可查；同一毫秒消息保持插入顺序；重新研究时活动 run 决定运行状态，刷新后仍可停止且保留上一份报告。切换 Idea/版本/Lens 时界面独立管理运行状态，不把市场研究的进度或停止入口带到成本研究；研究计划默认沿用已保存的固定模型。决策材料显示短摘要并提供完整报告入口，避免长报告推走决策操作。已完成报告仍可重新研究，失败或取消时保留旧报告并明确显示本次状态、恢复入口。真实验收发现长句拼接查询导致主题漂移，查询应聚焦已有用户问题/实现机制，不包含虚构产品名和整段叙事；不增加隐含 AI 调用，抓取失败正文不能作为证据。
10. 真实网络验证确认本机代理将 AnySearch 解析为 198.18/15 合成地址，SEL 默认 pinned transport 因此在发请求前拒绝。仅为炼金术接入 SEL 正式公开的 port-backed host：宿主窄 transport 固定 AnySearch HTTPS endpoint，复用 agent-host 的 synthetic DNS → DoH 解析，校验全部解析地址属于公网，将实际 TLS 连接固定到已验证 IP，同时验证 hostname/SNI/peer、拒绝跳转、限制请求/响应字节并支持取消/关闭。保留原 Feed 默认 transport，不修改全局 DNS/代理、不放行私网、不使用 testing host。这个边界需真实调用及 DNS/peer/redirect/超限回归验证。

切换时以新项目库为唯一写入位置，旧演示 API 只读。回退可恢复旧插件入口读取原演示库，新库保留；不对源应用数据或旧演示数据做破坏性迁移。

## AI 的角色与干预

AI 读当前 Direction、IdeaVersion、MVP、研究计划、公开证据、显式启用的 Taste/Playbook 与当前讨论上下文，产出 Idea 卡、研究 Claims/报告、Copilot 回复。用户在保留、研究发车预算、停止、注释沉淀与决策处干预。任务失败保留方向和检查点，提供可重试入口；重启恢复未完成任务，不把失败伪装成结论。

## 文件范围与依赖

- 插件 `plugins/native/alchemist/**`：移植业务、UI、HTTP port、构建资源、测试。
- `apps/local-host/src/alchemist-*.ts`：Prologue adapter、绑定项目分发、运行时释放；相关 host wiring 仅最小接线。
- `apps/local-host/src/feed-source-runtime.ts` 仅增加可选 queryTransport 注入；`horizontal/agent-host/src/index.ts` 仅公开已有安全 DNS resolver，避免复制实现和跨包源码依赖。
- 包依赖/lock/build 清单：只增加移植所需 Hono、Zod 和已有 Prologue 宿主依赖。
- `tests/alchemist-*.test.ts`、本 spec、插件 README：验证与说明。
- 不回退当前 workspace 的其他未提交改动，不提交/发布，不改其他插件行为。

## 验收

- [x] 从宿主侧栏进入真实工作面，桌面/窄屏可操作，首次模型未配置可恢复。
- [x] 新建方向 → Prologue 炼化 → 卡片比较/弃牌/恢复 → Brief → 保留版本，刷新后数据存在。
- [x] 两 Lens 独立计划、固定模型/预算、进度、停止、失败重试/恢复；partial 不进入完整 Decision；完整同版本报告可以 Build/Hold/Drop。
- [x] Pulse 三来源启停、采集失败隔离、机会保留/转方向可用。
- [x] Copilot 消费实际对象内容，注释/Playbook/Taste 明确保存、可停用，JSON/ZIP 导出可读且不含凭据。
- [x] 两个项目通过 URL/请求不能串库；旧 demo 数据不丢且明确标识。
- [x] 离线生产路径集成测试覆盖核心状态转换、预算/取消、恢复、错误、证据来源、导出；定向类型检查/构建成功。
- [x] 浏览器完成主路径（隔离测试 home，测试 Provider 需显式标识）；可用配置下做一次真实 Prologue smoke，若受阻如实标记。

## 验证命令

插件 build/typecheck；Node/tsx 定向 `tests/alchemist-*.test.ts`；移植业务 Vitest 定向/全套离线测试；workspace packages 检查；宿主隔离端口启动 + 浏览器主路径。

## 业务迁移验证记录（2026-09-23；其中旧 UI 已被原生界面替换）

- 工程：移植业务 23 文件 / 56 tests 通过；宿主与运行时 19 tests 通过；旧数据兼容和完整宿主浏览器 5 tests 通过；Feed 默认路径定向回归 1 test 通过。contracts、agent-host、plugin、workbench、local-host 构建通过。最终 workspace 检查 66 个包、48 个契约入口，errors=[]；本任务 diff 空白检查通过。最终只读复核无 Blocker/P1。
- 实际浏览器：宿主项目侧栏→iframe，1440px / 390px；缺模型→保存方向→失败可重试；真实 MiniMax-M3 → 三张不同 Idea → Brief → 弃牌/恢复 → 保留 v1 → 服务重启后恢复；Pulse 保存/转方向；Copilot 引用当前机制；原文选区注释；固定模型和预算；Taste 新增/停用；JSON/ZIP 按钮。JSON 数据及 ZIP CRC/解包独立校验通过。
- 真实来源：观猹和 GitHub 共取得 40 条信号；Toolify 本次采集失败，报告正确标为 partial 并列出缺口。AnySearch 的本机合成 DNS 已按第 10 项修复。短查询和正文过滤后，两 Lens 经真实 Prologue + MiniMax-M3 完成；市场引用 Skimle，成本引用 MinerU 文档。来源覆盖仍有限，报告保留未知和直接证据不足，流程完成不等于商业判断已证实。最终搜索探针确认提取失败、挑战页被剔除，不增加模型调用。
- 双 Lens 实操：每条确认 3 次研究调用预算，失败后重试、独立状态和刷新恢复；同版本双报告完成后解锁 Decision。隔离样例已选择 Hold，记录理由与回看条件，进入已决策列表；服务重启后结果仍保留。Playbook 已通过报告注释、提案、方向作用域确认，并在下一份市场计划实际应用。最终 JSON/ZIP 导出重新验证通过，不含凭据字段。
- 原始结果摘要：`verification/live-minimax-m3.json`。宿主屏幕：`verification/workbench-desktop.png`、`verification/workbench-mobile.png`。验收使用独立本地 home，模型凭据仅从宿主正常 resolver 获取；未写用户已有项目业务内容。
- 一骏本人验收尚未进行；不以代理浏览器操作代表本人认可。

## 原生 UI 验证（用户纠正后）

- 已移除复制的 React 页面、iframe、独立页面路由和对应前端依赖；旧入口 302 回到宿主项目。使用宿主原生 plugin-stage，默认满宽分组列表，打开对象后分栏，窄屏详情与返回。主题、控件、对话框、侧面板和模型设置均使用 Molis Work 的现有约定。
- 全宿主浏览器回归覆盖：方向→候选弃牌/恢复→保留；双报告与来源→原文注释→方法提案/作用域→确认保存；Hold 决策及后续读取；Taste 保存/停用、默认模型和预算设置；Pulse 来源切换、机会保留/转方向；讨论缺模型时保留上下文；JSON/ZIP 下载及数据内容；新方向缺模型失败/重试/刷新恢复；390px 返回列表。
- 前端回归的模型/搜索明确为测试 fixture，通过真实业务 API 建立数据，再从完整宿主浏览器操作。没有用 fixture 代替真实 AI 结论；上一节真实 Prologue + MiniMax-M3 证据仍独立有效。
- 另在完整宿主隔离项目中载入既有真实 MiniMax 记录，实看方向、Brief、市场报告、决策与方法；原数据和模型接入不变。验收 home 不复制凭据，新增调用会提示配置。
- 1440×1000、390×844，明暗主题截图已目视检查，无横向溢出，正文独立滚动、底栏保持可用：`verification/native-desktop-light.png`、`verification/native-desktop-dark.png`、`verification/native-mobile-light.png`、`verification/native-mobile-dark.png`。旧 `workbench-*` 截图仅为历史记录，不代表当前 UI。
- 工程结果：业务 56 tests；宿主/运行时/旧数据兼容 23 tests；原生全流程浏览器 1 test，共 80 tests 通过。插件、Workbench、Local Host 构建通过；workspace 检查 66 包 / 48 契约入口 / errors=[]。没有重复运行与 UI 无关的真实付费调用。

## 交付状态

目标等级为内部完整：工程与上述实际操作范围已完成，UI 采用 Molis Work 原生实现。用户本人验收尚未进行，不把自动验证等同本人认可。业务数据与 Prologue 接入保持兼容；未执行 Git 提交、发布或重启用户原有主服务。可操作验收服务在 4190，完整宿主内包含此前真实 AI 结果。

## 假设与开放问题

`/code/alchmist` 指实际存在的 `/Users/yijunwang/code/alchemist`。目标是 Molis Work 当前插件，不是新建 Codex 插件。用户已指定真实验收使用 MiniMax-M3；凭据沿用宿主，不打印密钥；当前源码有其他在途改动，限定本任务文件范围。源代码发现实际缺陷时修复当前旅程所需部分，先更新本 spec 的对应行为。
