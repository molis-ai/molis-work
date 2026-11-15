---
name: domain-app-product
version: 1
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

- 先按「规划路径」把事情想完整，再把每个能独立交付、独立验收的结果列成一项；一项里不混入几个主要结果。
- 「必须覆盖」里与当前任务有关的每个问题都要有答案；答不上来的关键问题列为待确认，不用含糊的条目盖过去。
- 依赖只表示结果消费：乙开始或完成时必须用到甲的可验收产出，乙才依赖甲。讨论顺序、时间先后、同一个人负责、改同一份文件都不算依赖；没有结果消费关系的保持并行。逐条判断「依赖规则」，不适用的要说得出缺了哪一种产出消费。
- 每一项写明完成时拿什么证明（见「完成证据」），收尾前过一遍「收口检查」。
- 只描述有限、能完成的改变；持续运行的事不写成永远做不完的一项。
- 和别的规划方法一起用时，把各自的关键结果放在一起看谁消费谁，缺了提供方的再补上相应的方法。
- 拆出来的结果先给用户看。用户要落到某个工具里（例如已装的 Goals 插件）时，用那个工具自己的动作写入，由用户确认。
