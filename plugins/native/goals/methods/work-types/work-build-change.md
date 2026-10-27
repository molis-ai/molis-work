---
method_id: work-build-change
version: 2
kind: work_type
name: "构建与改变"
summary: "从可观察结果反推能力、基础和交付闭环。"
applies_to: ["开发产品","建立能力","改变现有系统"]
domain_tags: ["build","change"]
source_refs: ["Molis Work universal result chain"]
confidence: 0.95
---

# 构建与改变

## 规划路径

1. 定义最终结果和使用流程
2. 分离核心能力与支撑基础
3. 按独立交付和验收划分 Goal
4. 补齐验证、发布与恢复

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| final_outcome | 最终结果 | 最终交付什么、由谁使用、成功后发生什么变化？ |
| operating_flow | 实际流程 | 结果如何被产生、使用、维护，关键角色怎样协作？ |
| core_capabilities | 核心能力 | 完成主任务必须具备哪些业务或专业能力？ |
| foundation_infrastructure | 基础能力与基建 | 核心能力消费哪些数据、资产、工具、权限或环境？ |
| quality_continuous_delivery | 质量与持续交付 | 如何验证、交付、监控、恢复并持续改进？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| capability-after-foundation | 核心能力只有在真实消费基础设施、数据、权限或契约时才依赖对应基础 Goal。 | capability depends_on consumed foundation |
| delivery-after-capability | 交付、发布和验收依赖可运行的核心能力及其验证证据。 | delivery depends_on validated capability |

## 完成证据

- 可运行或可使用的产物
- 完成条件对应的检查证据

## 收口检查

- 用户结果可观察
- 每条叶子只有一个主要验收结果
- 基础结果被核心能力真实消费

## 常见误拆

- 按文件或技术层机械拆分
- 只列功能不列运行和交付
- 把讨论顺序当执行顺序
