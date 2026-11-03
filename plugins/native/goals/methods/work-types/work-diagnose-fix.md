---
method_id: work-diagnose-fix
version: 2
kind: work_type
name: "诊断与修复"
summary: "先复现和定位根因，再修复、回归并恢复可信状态。"
applies_to: ["故障诊断","缺陷修复","质量问题"]
domain_tags: ["diagnose","fix"]
source_refs: ["Molis Work planning-engine spec"]
confidence: 0.94
---

# 诊断与修复

## 规划路径

1. 固定症状与复现条件
2. 缩小影响面并提出可证伪根因
3. 实施最小完整修复
4. 回归原场景和相邻边界

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| symptom | 症状 | 什么输入、环境和动作稳定产生问题？ |
| root_cause | 根因 | 哪个契约或状态转移导致症状？ |
| regression | 回归 | 如何证明修复且没有破坏相邻路径？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| fix-after-cause | 修复依赖已验证的根因，不依赖未经证实的猜测。 | fix depends_on root-cause evidence |
| regression-after-fix | 回归验证消费已经完成的修复产物和原始失败基线。 | regression depends_on fix and failure baseline |

## 完成证据

- 修复前失败证据
- 修复后通过证据
- 相邻路径回归

## 收口检查

- 根因能解释全部关键症状
- 修复没有靠补丁互相补偿

## 常见误拆

- 看到报错就加条件
- 只消除表面症状
- 缺少修复前后对照
