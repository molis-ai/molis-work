# BL-b44c-g1-exception-kinds

分组：2. 待你决定

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b44c-g1-exception-kinds | `PSD-02` 要求 G1 只剩[规格](../plugin-specials-demotion/spec.md)第 3 节的具名例外。第 44C 批立的 `tooling/gates/plugin-name-exceptions.json` 里有三种不在第 3 节：随包 Prologue 官方 coding 能力包的工具名（5 个文件）、记忆标记 v1→v2 升级步骤（1 个）、QA 演示脚本（1 个）。要你定：这三种是补进第 3 节作为具名例外，还是另排批次改掉；定之前 `PSD-02` 算部分达成 | [44C](../post-anticorruption-roadmap/reference/batches/44c.md) | 待你决定 | 是否扩大具名例外是产品与架构取舍，要你拍板 | 无 | 中 | 用户 |

### 2026-11-26 整改决定

一骏在 44C 整改会话确认保留以下六项。前五项使用 Prologue 公开工具名，最后一项读取旧版记忆数据的实际键。批准限于这些文件内的现有用途，G1 继续计数。

- `apps/local-host/src/agent-host-composition.ts`
- `horizontal/agent-host/src/adapters/prologue-node-kit.ts`
- `horizontal/agent-host/src/code-intelligence/coding-tools.ts`
- `horizontal/agent-host/src/code-intelligence/index.ts`
- `horizontal/agent-host/src/tool-catalog.ts`
- `packages/storage/src/adapters/memory-ledger.ts`

跨设备 QA 演示的七号例外单独对账。
