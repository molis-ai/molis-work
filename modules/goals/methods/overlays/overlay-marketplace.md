---
method_id: overlay-marketplace
version: 1
kind: overlay
name: "双边市场"
summary: "为连接供需双方的平台叠加流动性、匹配、信任、治理和利益平衡约束。"
applies_to: ["交易平台","服务撮合","创作者或开发者市场"]
domain_tags: ["marketplace","matching","liquidity"]
source_refs: ["Molis Work multi-sided value-flow method","OECD guidance on online marketplaces"]
confidence: 0.9
---

# 双边市场

## 规划路径

1. 明确各侧角色、价值、成本和绕开平台的替代方案
2. 建立供给质量、需求意图、匹配和流动性机制
3. 设计身份、声誉、交易、争议和平台治理
4. 平衡补贴、抽成、排序与各侧长期健康
5. 按地区或品类验证密度、成功率、留存和信任

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| marketplace_sides | 市场各侧 | 每一侧贡献什么、获得什么，谁承担主要成本和风险？ |
| liquidity_matching | 流动性与匹配 | 在什么时间和范围内，合适供需如何相遇并成交？ |
| supply_quality | 供给质量 | 谁能加入，质量如何验证、排序、纠偏和退出？ |
| marketplace_trust | 信任机制 | 身份、声誉、担保、评价和争议如何减少不确定性？ |
| platform_governance | 平台治理 | 排序、抽成、补贴、处罚和申诉由谁决定并解释？ |
| side_health | 各侧健康 | 如何避免一侧增长以牺牲另一侧长期价值为代价？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| matching-after-side-contract | 匹配和排序机制消费各侧价值、供给标准、需求意图和治理边界。 | matching depends_on side and governance contract |
| expansion-after-liquidity | 扩展地区或品类消费局部市场的流动性、成功率、信任与经济性证据。 | marketplace expansion depends_on local liquidity proof |

## 完成证据

- 各侧价值流、成本和风险地图
- 局部市场中的匹配、成功和争议数据
- 排序、治理、处罚与申诉案例

## 收口检查

- 不是只优化平台总交易量而忽略单侧健康
- 声誉和排序机制有对抗操纵的边界
- 冷启动范围足够窄且有可验证密度

## 常见误拆

- 同时扩大供需范围导致处处不流动
- 用补贴制造短期交易但没有长期价值
- 只做评价分数不做争议和申诉
