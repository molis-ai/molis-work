---
method_id: domain-game-design
version: 2
kind: domain
name: "游戏设计"
summary: "围绕核心循环、系统内容、玩家旅程和反馈建立可玩闭环。"
applies_to: ["游戏设计","玩法系统","游戏内容"]
domain_tags: ["game","design"]
source_refs: ["Molis Work planning-engine spec"]
confidence: 0.94
---

# 游戏设计

## 规划路径

1. 定义幻想、玩家动机和核心循环
2. 建立系统规则与内容供给
3. 设计玩家旅程和反馈
4. 制作可玩切片并测试节奏与平衡

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| core_gameplay | 核心玩法 | 玩家反复做什么，为什么愿意继续？ |
| game_systems_content | 游戏系统与内容 | 规则、资源和内容怎样支持循环？ |
| player_journey | 玩家旅程 | 学习、成长、挑战和长期目标怎样展开？ |
| interaction_ui | 交互与 UI | 输入、反馈和信息怎样保护可玩性？ |
| audiovisual | 视听表现 | 视听怎样传达状态并强化情绪？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| systems-after-loop-intent | 系统规则和内容供给依赖已经明确的玩家动机与核心循环假设。 | systems depend_on core loop intent |
| production-after-loop | 大规模内容和视听生产依赖已验证的核心可玩循环。 | production depends_on playable loop |

## 完成证据

- 可玩切片
- 玩家行为观察
- 规则和数值检查

## 收口检查

- 核心循环实际可玩
- 内容与系统服务同一体验

## 常见误拆

- 堆设定不做循环
- 先生产大量内容
- 只拆技术层不拆体验结果
