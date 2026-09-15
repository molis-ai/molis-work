---
method_id: domain-app-product
version: 2
kind: domain
name: "通用 App"
summary: "兼容历史 app task context 的产品完整性检查。"
applies_to: ["通用应用产品"]
domain_tags: ["app"]
source_refs: ["Molis Work legacy app context"]
confidence: 0.96
---

# 通用 App

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
