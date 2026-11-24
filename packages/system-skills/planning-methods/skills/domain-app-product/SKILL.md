---
name: domain-app-product
version: 2
summary: "兼容历史 app task context 的产品完整性检查。"
description: "兼容历史 app task context 的产品完整性检查。领域；适用于：通用应用产品。要拆解这类目标、排出依赖和完成证据时使用。"
when_to_use: "要把「通用 App」这类目标拆成可独立交付、可验收的结果，并理清谁依赖谁、各自拿什么证明完成。"
applies_to: assistant
---

# 通用 App

兼容历史 app task context 的产品完整性检查。

适用于：通用应用产品。

## 规划路径

1. 定义核心功能
2. 走通端到端旅程
3. 补齐交互与信息
4. 验证质量和交付

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| core_function | 核心功能 | App 的主任务是什么？ |
| user_journey | 端到端用户旅程 | 用户如何完成主任务？ |
| interaction_ui | 交互与 UI | 界面怎样引导和反馈？ |
| content_information | 内容与信息 | 需要呈现和保存什么？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| implementation-after-product-flow | 功能实现依赖已经确认的产品目标、主路径和关键状态。 | implementation depends_on product flow |
| release-after-feature | 验证和发布依赖可运行的功能与异常恢复路径。 | validation and release depend_on working feature |

## 完成证据

- 端到端主路径

## 收口检查

- 核心功能和旅程闭环

## 常见误拆

- 只列页面
- 功能存在但用户走不通

## 怎样用这份方法

按「规划路径」把每个可独立交付、有限可验收的结果拆成一项；覆盖「必须覆盖」相关问题（缺事实列待确认）；依赖只按结果消费连边、其余并行；逐项标明「完成证据」并过「收口检查」；先给用户确认，再按要求用对应工具写入。
