---
method_id: work-migrate-refactor
version: 2
kind: work_type
name: "迁移与重构"
summary: "先建立兼容和回退边界，再分段替换并验证。"
applies_to: ["数据迁移","架构重构","系统替换"]
domain_tags: ["migration","refactor"]
source_refs: ["Molis Work planning-engine spec"]
confidence: 0.94
---

# 迁移与重构

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
