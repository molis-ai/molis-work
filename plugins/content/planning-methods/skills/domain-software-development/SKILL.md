---
name: domain-software-development
version: 2
summary: "先用项目与模块 SSOT 固定边界，再按横纵模块、实现、集成和交付组织软件工作。"
description: "先用项目与模块 SSOT 固定边界，再按横纵模块、实现、集成和交付组织软件工作。领域；适用于：应用开发、服务开发、工程改造。要拆解这类目标、排出依赖和完成证据时使用。"
when_to_use: "要把「软件开发」这类目标拆成可独立交付、可验收的结果，并理清谁依赖谁、各自拿什么证明完成。"
applies_to: assistant
---

# 软件开发

先用项目与模块 SSOT 固定边界，再按横纵模块、实现、集成和交付组织软件工作。

适用于：应用开发、服务开发、工程改造。

## 规划路径

1. 先确认产品目标、用户行为、完成标准和不做什么
2. 建立或核对项目级 SSOT，明确全局不变量、权威状态与决策位置、模块索引和跨模块契约
3. 用纵向端到端结果和横向共享能力划分模块，解决状态、契约、决策与写入面的重叠
4. 在模块地图稳定后并行撰写模块 SSOT，固定各自所有权、输入输出、消费者、异常恢复和 Impact surfaces
5. 从模块 SSOT 派生实现 Goal；实现只等待自己消费的契约，能用 test double、fixture 或兼容层独立验证时让提供者与消费者并行
6. 让集成、端到端验收、迁移、发布和恢复消费全部相关模块的可运行产物

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| core_function | 核心功能 | 哪条真实用户或调用路径必须工作？ |
| user_journey | 端到端用户旅程 | 用户如何进入、完成并从异常中恢复？ |
| interaction_ui | 交互与 UI | 人如何观察和控制系统？ |
| content_information | 内容与信息 | 系统需要呈现和保存哪些信息？ |
| project_ssot | 项目级 SSOT | 哪个仓库文档唯一说明项目结果、非目标、全局不变量、权威状态、模块索引、跨模块契约和验证来源；现有文档是否可信且仍然有效？ |
| module_architecture | 横纵模块地图 | 哪些纵向模块各自拥有端到端结果，哪些横向模块向多个消费者提供共享能力；每个重要状态、数据、契约和决策由谁唯一拥有？ |
| module_ssot_contracts | 模块级 SSOT | 每个模块的 SSOT 在哪里，是否明确职责与非职责、输入输出、公共契约、消费者、异常恢复和验收？ |
| parallel_impact_boundaries | 并发写入边界 | 计划并行的 Goal 分别读取、写入、决定或独占哪些 Impact surfaces；是否存在未解决的重叠？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| project-ssot-after-product-plan | 项目级 SSOT 消费已经确认的产品目标、用户行为、完成标准和非目标；产品计划不反向依赖技术实现。 | project SSOT depends_on confirmed product plan |
| module-ssot-after-project-ssot | 模块 SSOT 消费项目级全局不变量、模块地图和跨模块契约；各模块文档在地图稳定后可以并行撰写。 | module SSOT depends_on project SSOT and module map |
| implementation-after-module-ssot | 模块实现依赖自己已经稳定且可验证的模块 SSOT，以及它真实消费的提供者公共契约。 | module implementation depends_on its module SSOT and consumed provider contract |
| provider-consumer-implementations-parallel | 提供者与消费者只通过稳定契约交互，且消费者能用 test double、fixture 或兼容层独立验证时，两边实现保持并行，不互设 depends_on。 | keep provider and consumer implementations parallel after contract |
| integration-after-module-implementations | 集成、端到端验收、发布和恢复验证消费提供者与消费者双方的可运行产物。 | integration and release depend_on provider and consumer implementations |
| contract-before-consumer | 消费者实现依赖稳定且可验证的提供者契约。 | consumer depends_on provider contract |

## 完成证据

- 项目级 SSOT 与模块索引的可读取引用
- 每个模块 SSOT 与公共契约的可读取引用
- 模块唯一所有权和 Impact 读写面核对
- 定向测试、构建或类型检查与真实主路径

## 收口检查

- 项目级事实与模块事实没有重复权威位置
- 每个状态、数据、公共契约和决策面只有一个所有者
- 计划并行的 Goal 没有冲突的 write、decide 或 exclusive surface
- 提供者与消费者的依赖落在契约或真实运行产物上，而不是组织顺序
- 输入输出、错误路径、发布与恢复可执行

## 常见误拆

- 按 UI、API、数据库、前后端文件夹或团队分工机械拆模块
- 把根 SSOT 写成复制全部模块细节的巨型文档
- 两个模块共同维护同一状态或公共契约
- 把所有共享代码塞进没有真实消费者边界的横向模块
- 让消费者实现无条件等待提供者实现，而不是先稳定契约并评估并行
- 单元测试通过就宣称产品可用
- 无异常和迁移路径

## 怎样用这份方法

按「规划路径」把每个可独立交付、有限可验收的结果拆成一项；覆盖「必须覆盖」相关问题（缺事实列待确认）；依赖只按结果消费连边、其余并行；逐项标明「完成证据」并过「收口检查」；先给用户确认，再按要求用对应工具写入。
