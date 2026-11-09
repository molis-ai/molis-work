---
method_id: domain-market-analysis
version: 2
kind: domain
name: "市场分析"
summary: "形成市场格局、差异、选项和待验证假设，而不是堆资料。"
applies_to: ["市场研究","竞品分析","进入策略"]
domain_tags: ["market","competition","growth"]
source_refs: ["Molis Work planning-engine spec"]
confidence: 0.93
---

# 市场分析

## 规划路径

1. 定义市场边界和决策
2. 分层识别用户、替代方案和价值链
3. 比较关键差异与证据
4. 形成方向选项和验证计划

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| market_boundary | 市场边界 | 在解决什么问题的哪一层竞争？ |
| customer_moment | 用户时刻 | 谁在什么场景下选择或放弃现有方案？ |
| alternatives_competition | 替代与竞争 | 真正的替代方案和结构性差异是什么？ |
| strategic_options | 方向选项 | 对当前项目意味着哪些可选路径？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| comparison-after-boundary | 竞品和替代比较依赖已经明确的市场边界、用户时刻和比较维度。 | comparison depends_on market boundary |
| recommendation-after-landscape | 方向建议依赖市场边界、用户和替代证据。 | recommendation depends_on market evidence |

## 完成证据

- 一手或权威市场来源
- 真实用户/产品证据
- 关键假设的验证方式

## 收口检查

- 选项而非唯一武断结论
- 明确对当前项目的含义

## 常见误拆

- 竞品功能表代替市场分析
- 用没有表达需求否定创新
- 堆链接没有决策
