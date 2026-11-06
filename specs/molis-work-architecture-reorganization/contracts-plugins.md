# 架构重组基线：插件与适配器合同

状态：架构重组时的设计与合同记录（2026-09，含正文注明的后续补充），2026-11-03 从需求书分出，保留原章节编号。这里的“已确认”“未实现”、目录与接口示例属于当时基线，不是当前包/API 清单；实际层次、成熟度和依赖以[SSOT](../../docs/SSOT-MATRIX.md)与[现行架构](../../docs/system/ARCHITECTURE.md)为准。原 §20.12/§20.14 两个模块及其他已删除机制的说明见[总需求书开头](spec.md)。

[总需求书与验收](spec.md) · [§19 基础包](contracts-foundation.md) · [§20 模块](contracts-modules.md) · [§21 服务](contracts-services.md) · [§22 插件](contracts-plugins.md) · [§23 应用与工具](contracts-apps.md)

## 22. Plugin 与 Adapter Contract

### 22.1 Integration Plugin 内聚 Provider Adapter（已确认）

Provider-specific protocol、字段转换、授权流程、配置 UI 与 Capability 组合跟随同一个 Integration Plugin，由统一的 Plugin ID、Version 和发布者签名管理。

```text
plugins/official-integrations/<provider>/
├── manifest
├── local-entry
├── server-entry              optional
├── settings-ui
├── connector-adapter
├── listener-adapter
└── signal-adapter
```

**Integration Plugin 负责：**

- 声明 Provider capability、所需 grant、Local / Server entrypoint、UI Contribution 和 Contract version。
- 实现 Connector Driver、Listener / Signal Adapter，以及 External Action 需要的 typed operation driver。
- 将 Provider payload 翻译成公开 Contract，或将获准的 External Action 翻译成 Provider 调用。
- Provider-specific configuration、错误提示、兼容迁移和必要的 Artifact producer / consumer。

**平台级 Adapter 负责：**

- SQLite、Filesystem、Keychain、Blob Store、Tauri、Terminal / PTY、HTTP / WebSocket、Codex app-server 等平台技术 port。
- 它们不携带 GitHub、Gmail、Slack、IM 等产品身份，不提供一级 UI，也不单独形成可安装生态条目。
- Adapter 是实现角色，不默认形成顶层目录或独立 package；实现跟随它服务的 Storage、Horizontal Host 或 App 放置。

**边界：**

- Host 通过 Connector / Listener / Runtime / Plugin Contract 调用 Adapter，不导入 Provider implementation。
- Provider Adapter 不能直接写 Sources、Signals、Feed、Actions、Goals 或 Artifacts Store；正式写入经过对应 Module API。
- Listener / Signal Adapter 只做协议与字段翻译，不能决定是否进入 Feed、Attention、Goal 或 Automation。
- Plugin signature 变化即为新 Plugin；它携带的 Adapter 不继承旧 Plugin 的 grant、Store 或 Provider Binding。
- 多个 Plugin 真实复用同一 Driver 且出现独立版本压力时，可以抽成内部 Driver Library；没有证据前不创建额外 package。

**当前迁移与验收：**

- `src/feed/connectors/github.ts`、`gmail.ts`、Source intelligence adapter 与 Relay Provider integration 是迁移来源。
- 第一批官方 Integration Plugin 迁移时必须证明 Host 不再包含 Provider 条件分支，Plugin 卸载后相关 Driver / UI / binding 一起停止，但历史 Signal / Artifact reference 仍可安全显示。
- Contract test 使用同一 Host Harness 验证 GitHub / Gmail 等不同 Adapter 的连接、监听、Signal Draft、权限拒绝、错误归一和 External Action Receipt。

### 22.2 Native Plugin 与 Module 分离（已确认）

Native Plugin 是用户看到和操作的一级产品能力，Module 是该能力依赖的事实账本与业务规则。两者可以同名，但必须保持独立 package：Native Plugin 组合 Module API，不吸收 Module implementation。

```text
plugins/native/<capability>/
├── manifest
├── application-entry
├── ui/
├── composition/
├── embeds/
├── tests/
└── README.md
```

**Native Plugin 负责：**

- 一级导航、页面、Command、Inspector、开放 Slot 和嵌入视图等 UI Contribution。
- 把用户操作转换为强类型 Module Command，并通过 Capability Router 调用 Module API。
- 组合多个 Module Query 形成页面级 read model，例如 Goals 页面组合 Goal、Execution、Evidence、Governance 与 Attention 信息。
- 页面临时状态、交互流程、错误展示与加载恢复；这些状态不自动成为正式业务事实。

**Native Plugin 不负责：**

- 不拥有 Goal、Artifact、Feed Item、Action、Session、Run 等正式对象，也不复制对应 Store 或状态机。
- 不直接访问 Module Store、跨 Module SQL、其他 Plugin 私有 Store 或 Provider implementation。
- 不把页面需要的组合字段反写成新的中央事实；只有确有独立业务语义时，才由对应 Module Contract 接收写入。
- 不实现 Workbench Shell、Plugin 生命周期、权限、隔离或 Provider Binding；这些属于 Platform。

**运行与依赖：**

- Native Plugin Manifest 声明所需 Module / Horizontal Service Capability；Local Host 组合并提供正式 implementation，Workbench 通过 UI Host 装载 Native Plugin UI。
- Server 不为 Native Plugin 复制完整页面或本地业务实现；只有明确声明的 Server entrypoint 才在 Team Plugin Host 运行。
- `Goals` 与 `Artifacts` 使用官方保护的 Plugin ID 与签名，但其 UI / 应用组合层仍不能绕过各自 Module API。
- 一级产品能力是 Native Plugin，不等于每个细粒度 Module 都需要一个一级入口；Sources、Signals、Evidence、Governance 等继续作为被组合的 Module。

**创建与迁移：**

- 六个 Native Plugin package 全部按统一 package 标准建立；尚无真实 UI / application implementation 的 package 标记为 `contract-only`，不向 UI Host 注册不可用入口。
- 第一份样板是 `plugins/native/feed`：迁入 Feed 页面与应用组合，同时保留 Sources、Signals、Feed、Attention 的独立 Module 边界。
- 后续按 Goals Query、Goals Write、Execution / Evidence / Governance、Work、Projects / Shell 的切片顺序迁移；每次同时更新 package README、架构文档与 Contract test。
- 验收时 Native Plugin 可以在 fake Module Capability 下独立渲染和驱动用户意图；Module 也可以在没有 Workbench UI 的情况下独立验证业务规则。

### 22.3 Plugin 依赖 Contract，不依赖 Plugin（已确认）

Plugin 之间不建立直接 implementation 或安装依赖。可保存、同步和重放的内容通过 Goal / Artifact Contract 交换；即时查询或操作通过官方 Module / Horizontal Capability 完成。

```text
ArtifactRef
├── artifact_id
└── artifact_version

ArtifactTypeRef
├── artifact_type_id
└── schema_version

ProducerProvenance
├── producer_plugin_id
└── producer_plugin_version
```

- `artifact_id + artifact_version` 指向一份具体结果及其版本。
- `artifact_type_id + schema_version` 决定消费方是否理解该 Payload；Type ID 使用全局唯一命名空间，例如 `io.molis.work.report.document`。
- `producer_plugin_id + producer_plugin_version` 只记录来源和审计信息，不自动形成安装依赖或消费限制。
- Artifact Type Contract 与生产者身份分离；任何 Plugin 都可以声明生产该类型，只要本地 Host 能按对应 Schema 验证其输出。
- Plugin Manifest 声明 `produces`、`consumes` 的 Artifact Type Contract，以及需要的 Module / Horizontal Capability；不提供任意 `depends_on_plugin_id`。
- 接收端没有兼容 consumer 时，Artifact 仍可被 Exchange 存储、同步和保留；安装兼容 Plugin 后再解释和消费。
- Server 只识别 Envelope 路由字段和 opaque Payload，不需要安装 consumer 或执行自定义业务 Schema。
- 某个 consumer 可以基于来源实现自己的业务接受规则，但这属于消费逻辑，不改变平台的 Contract 路由模型。

**不使用 Artifact 的场景：**

- 查询或更新当前 Goal 使用 Goals Module API，不用临时 Artifact 模拟 RPC。
- 发起外部操作使用 Actions / Connector Capability，操作结果需要长期交换时再发布 Artifact。
- UI 嵌入使用 UI Contribution Contract，不把页面描述伪装成业务 Artifact。
- Provider listener 先产生 Signal Draft；只有形成需要长期保存或共享的业务结果后才发布 Artifact。
