# 插件创作工作台：技术接缝与实现计划

状态：2026-09-23 首轮正式接缝已实现，实际结构与验证见 [执行需求](work-items/prologue-runtime/spec.md)。本文的通用组件树、多页面与任意功能扩展仍属后续设计；`ui/` 已按用户批准的 [视觉基准图](ui/design/approved-comp.png) 实现 V3 浏览器本地高保真演示，不代表下述 Agent / Host / 插件运行时集成或最终用户验收已完成。产品范围、阶段与验收以 [spec.md](spec.md) 为准。

V3 左侧保留对话、设计依据、三张方案小样和共享主线，右侧始终呈现实际插件预览。默认首次打开停在第 8 步，可从空画布重播 13 步。页面装配与行为接通分别推进，通过真实元素锚点定位两只具名鼠标，逐个加入素材卡片并原位更新连接标记；生成图片仅用作封面，文字与控件均由 DOM 呈现。输入节点保持稳定，指针层不拦截用户事件，操作控件不触发组件检查，试用时收起检查面板。

演示复用现有素材预览控制器和本地状态，没有新增调度服务或通用画布框架。模型解析、Jev 选择与 Agent 调度为 Mock，保存、筛选和 CSV 导出由实际本地代码执行，该演示未接通正式运行时；V3 使用独立的草稿、使用版本和素材存储键。当前浏览器实操证据、存储键与待验证项统一记录在 [演示说明](ui/README.md)。

## 1. 现有边界与新增落点

| 位置 | 当前依据 / 拟议变化 |
| --- | --- |
| `packages/design-system/src/primitives/index.ts`、`catalog.ts` | 复用现有 renderer 与 Catalog；为首批组件新增结构化描述适配，不更换 HTML UI 技术栈 |
| `modules/functions/src/provider.ts` | 复用公开 `createHttpTypeSafeProvider`；由 Host 封装动态候选选择，不在浏览器直接调用 Provider |
| `modules/functions/src/service.ts`、`store.ts` | 现有用户函数生命周期保留；其中 1–8000 字输入、Choice 2–32 项是当前产品校验，不当作上游所有能力的保证 |
| `horizontal/agent-host/src/index.ts` | 复用 AgentHost / Prologue Run 端口处理澄清、方案与功能实现；新增领域编排，不新造模型会话系统 |
| `plugins/native/plugin-builder/`（新增） | 创作产品入口、草稿与修订、Build Workflow、画布、候选与绑定编辑、生成插件工厂 |
| `packages/contracts/src/modules/plugin-builder.ts`（按公共消费者需要新增） | 只放 Host 与插件共同需要的类型；内部构建细节留在插件包 |
| `apps/local-host/src/` | 插件 HTTP 装配、Provider/Agent 注入、生成插件的持久注册与启动、操作调用桥接 |
| `apps/workbench/src/plugin-catalog.ts` 及现有注册接缝 | 增加创作入口；生成实例的导航需要动态来源，不能为每个新插件编辑静态 Catalog |
| `packages/plugin-runtime/`、`packages/plugin-sdk/`、`packages/ui-host/` | 复用 manifest、生命周期、权限与 UI contribution；仅在已证明的缺口增加最小公开接缝 |

2026-09-23 核对：`coding-surface.ts` 已采用 `SqlitePluginPrivateStorage`，原先“空实现”的判断已过时。创作与生成插件均复用该公开存储边界，按真实安装身份隔离，不在 Host 保存业务记录。

先在一个创作插件包中组织领域逻辑与 UI，沿用现有 Native 插件形态。只有真实第二消费者出现才拆通用 package。元插件自身的 Native 注册与生成插件的运行时身份是两个不同问题。

## 2. 最小状态结构

建议用一份 `BuildDocument` 存主线与双方设计，单一 service 是写入方。持久化沿用项目现有 SQLite 工具；正文作为版本化 JSON 保存，构建步骤只留必要调用引用与结果。初期无需通用事件溯源或协同编辑系统。

下面是拟议合同的关键形状，用于说明边界；不是已实现 API。

```ts
interface BuildDocument {
  id: string;
  projectId: string;
  revision: number;
  brief: ProductBrief;
  ui: UiSpec;
  behavior: BehaviorSpec;
  bindings: Binding[];
}

interface UiNode {
  id: string;
  componentId: string;
  componentVersion: number;
  props: Record<string, unknown>;
  slots: Record<string, string[]>;
}

interface Binding {
  id: string;
  nodeId: string;
  target: string; // 组件声明的属性或事件
  kind: "read" | "event";
  sourceId: string; // query、state 或 operation 的稳定标识
  mapping: Record<string, ValueRef>; // 受限字段映射，不执行任意表达式
}

interface BuildChange {
  buildId: string;
  baseRevision: number;
  stepId: string;
  changes: BuildEdit[]; // 明确的 add/update/move/bind 等命令
}
```

`ProductBrief` 保存旅程与成功标准；`UiSpec` 保存页面、节点与布局；`BehaviorSpec` 保存数据结构、查询、操作合同及实现引用。业务数据不存进设计文档。画布选中态、缩放等不参与业务合同修订。

一次合法修改先校验、再原子保存新 revision，最后通知渲染端。并发结果若基于旧 revision，检查后重新计算；首版不做自动冲突合并。`stepId` 防止重连后重复应用同一步。

撤销产生一个新修订，不删除调用证据。UI/设计撤销不逆转已发生的正式业务写入。预览业务数据隔离，正式试用前展示其使用的数据范围。

## 3. UI 零件描述与画布

每个 `ComponentDescriptor` 至少包含：稳定 id/版本、用途说明、属性 schema、具名 slots 及嵌套限制、输入数据与事件、状态与变体、renderer、示例。元信息可由现有类型辅助产生，但不能声称 TypeScript 类型本身已具备运行时校验。

首批覆盖首个旅程所需的容器、文本、输入框、文本区、选择框、复选框、按钮、列表/表格/卡片、空状态、进度与错误反馈。覆盖数量由完整旅程决定，不先铺满 Catalog。

画布使用真实 HTML 组件渲染：规格树 → 受控 renderer → DOM。初版不引入 React、节点编排库或任意 HTML/code 执行。schema 字段按文本转义；不允许模型通过 props 注入脚本、事件属性或未登记 URL 协议。

编辑模式有组件选择与属性面板；试用模式将事件交给绑定层。保留独立的“布局已完成 / 使用示例数据 / 功能待连接 / 可试用”信息，避免把外观就绪当作功能完成。

增量以稳定 node id 定位，只替换必要区域。对输入型控件保留活动输入、焦点、选区与滚动；模型更新同一字段时提示冲突而非覆盖用户正在输入的内容。结构变更后保留可恢复焦点位置。P1 必须测这些交互，不能只测 HTML 字符串。

## 4. 选择模型接缝

```ts
interface ComponentSelectionRequest {
  buildId: string;
  baseRevision: number;
  purpose: string;
  placement: { pageId: string; parentId: string; slot: string };
  contextSummary: string;
  candidates: Array<{ id: string; description: string }>;
}

type ComponentSelectionResult =
  | { outcome: "selected"; candidateId: string; model: string }
  | { outcome: "needs_review"; reason: string; model?: string };
```

选择流程在 Host 端进行：

1. 本地规则筛选兼容组件，并明确候选为空、单候选、超上限的处理。
2. 上下文只包含当前设计约束、局部树、当前需求及相关绑定摘要；过长时显式压缩并保留原引用，不静默截断关键约束。
3. 调用现有 Provider。适配层构造瞬时 Choice 请求记录，不写入用户 Functions 列表，也不调用“发布”来绕过动态候选问题。
4. 校验返回 id 确实属于本轮集合；概率或 confidence 仅是参考，不当作已经校准的正确率。
5. 记录实际模型、候选、输入摘要、耗时与结果，返回给 Build Workflow。没有调用的候选不能补造模型选择记录。

凭据由既有 Host 密钥机制解析，通过注入的选择端口使用；生成插件和浏览器都不接触密钥。P0 核对当前密钥归属和可复用授权范围；必要时增加配置入口，不复制秘密到构建文档。

动态调用与用户已发布函数调用不同：复用 Provider 传输和解析，不改变原有发布不可变、权限和 `needs_review` 语义。不静默替换模型；缺凭据或 Provider 不可用时 UI 可允许人工装配，但必须标明模型构建未验证。

## 5. Build Workflow、功能线与合流

编排步骤：澄清 → 候选 → 当前主线 → 分发 UI/功能工作 → 合流检查 → 试用 → 生成版本。步骤可回到前一步，不用一次性长提示生成整个应用。

每项工作有依赖、目标设计 revision、运行引用与结果。复用 AgentHost 中 Run 的执行事实；构建服务只保存领域进度。先用 Host 内有限任务调度，不新增分布式队列。

UI 与功能工作可以同时计算，落板通过同一入口顺序提交。提交之前核对依赖与变更范围；用户改变主线时取消不再适用的工作，晚到结果只能成为待重算候选。

功能线分两步验证：

- **P2 受控功能**：使用显式查询/操作与现有 Host 能力构建真实数据读写、过滤、导出。操作由后端合同检查，业务数据按生成插件实例隔离。UI 控件不是数据库或工具调用入口。
- **P3 自定义功能**：通过现有 Coding/AgentHost 能力，在专属输出目录生成代码及测试，构建成具名、版本化实现。校验通过后由 Host 的明确加载路径使用。受信任本地开发执行不等于沙箱；任意外来代码自动运行仍需另行解决执行隔离，不能借本方案打开。

P3 前必须确定自定义操作模块的运行边界和权限如何实际兑现；若需要越过当前进程内能力，单独提出必要调整。此缺口不阻塞 P1 的 UI 机制验证，但会阻止宣称任意功能生成可用。

绑定校验覆盖节点属性、事件 payload、操作输入/输出、加载/成功/空/错误状态。函数实现存在但没有对应交互反馈，或界面事件没有实际 handler，均不能进入完整版本。

## 6. 从设计变成可运行插件

拟议首条路线：**结构化定义 + 共享解释执行器 + 每个产物独立的插件身份**。相比每次重新生成全部 UI 源码，这条路线能直接复用画布渲染，并使修改和运行采用同一份定义。它是需新增的运行接缝，不是当前已有安装能力。

1. 固定主线/UI/功能/绑定修订，生成 manifest 与版本化定义，列出所需权限和功能实现引用。
2. 用工厂将定义适配为现有 `PluginDefinition` / UI contribution，复用 PluginRuntime 启停与实际 private storage。
3. Host 保存生成插件目录，Workbench 从该目录投影独立入口；与静态内置目录合并，不修改每个生成插件对应的源码。
4. UI 事件经具名操作桥接，由 Host 注入安装和项目身份，检查权限后分发。HTML contribution 本身不自动提供此桥接，必须补齐。
5. 正式数据绑定安装身份，UI 版本变化不创建新的空数据空间。重启时重载定义与运行状态。

P2 的交付物必须能脱离创作页面打开。JSON 导出、编辑器里的预览和 CLI 成功退出都不足以替代此项。

后续如需源码工程/可分发包，可从同一修订导出，但涉及打包依赖、可信发布者和安装路线时需单独实证。版本回退只切换定义与实现；数据迁移必须有显式兼容策略，不能用退回旧 JS 文件替代。

## 7. 验证与记录

本轮仅文档，检查新增文件、内部相对链接、`git diff --check` 与工作树范围，不运行应用构建来充当方案验收。

后续实现按阶段增加有实际失败价值的测试：

- 规格/组件单测：非法树、属性、绑定、不兼容组件替换。
- 构建服务集成：旧 revision、晚到响应、暂停恢复、撤销、保存失败。
- Provider 接缝：无效返回、超时、动态候选；真实 Jev 单独保留运行证据，不混入 fixture 通过结果。
- 运行链路：定义注册 → 独立打开 → 真实操作 → 保存 → 关闭与重启 → 数据仍在。
- 回归：原有 Functions 发布/调用、现有插件导航和能力权限不变。
- 浏览器实操：代表内容、逐步渲染、焦点/输入、两线变更、失败恢复、实际导出结果。

新增包后依据实际 package 名运行定向构建和类型检查，再执行相关新增测试。仓库现有命令可复用 `pnpm boundary:check`、`pnpm workspace:check`；涉及完整 Host/Workbench 装配时执行 `pnpm build` 并实际启动观察。不在方案阶段声称这些命令已通过。

每阶段记录基线、实际配置、产物版本、已运行检查与未验证项。产品验证和用户验收按主规格分开报告。
