---
name: work-migrate-refactor
version: 2
summary: "先建立兼容和回退边界，再分段替换并验证。"
description: "先建立兼容和回退边界，再分段替换并验证。工作类型；适用于：数据迁移、架构重构、系统替换。要拆解这类目标、排出依赖和完成证据时使用。"
when_to_use: "要把「迁移与重构」这类目标拆成可独立交付、可验收的结果，并理清谁依赖谁、各自拿什么证明完成。"
applies_to: assistant
---

# 迁移与重构

先建立兼容和回退边界，再分段替换并验证。

适用于：数据迁移、架构重构、系统替换。

## 规划路径

1. 盘点现状和兼容契约
2. 定义目标状态与迁移批次
3. 准备回退和双向验证
4. 分段切换并清理旧路径

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| baseline_contract | 现有契约 | 哪些行为和数据必须保留？ |
| migration_path | 迁移路径 | 每一批如何进入、验证和退出？ |
| rollback | 回退 | 失败时怎样恢复到可信状态？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| cutover-after-proof | 切换依赖迁移验证和可用回退。 | cutover depends_on validation and rollback |
| cleanup-after-cutover | 旧路径清理依赖新路径已经切换、观察并确认可回退边界。 | legacy cleanup depends_on proven cutover |

## 完成证据

- 迁移前后对账
- 回退演练或可复现步骤

## 收口检查

- 旧路径明确退出
- 没有静默丢失兼容行为

## 常见误拆

- 边改边迁没有基线
- 只迁成功路径
- 旧逻辑永久并存

## 怎样用这份方法

按「规划路径」把每个可独立交付、有限可验收的结果拆成一项；覆盖「必须覆盖」相关问题（缺事实列待确认）；依赖只按结果消费连边、其余并行；逐项标明「完成证据」并过「收口检查」；先给用户确认，再按要求用对应工具写入。
