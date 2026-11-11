# BL-memory-p1-contract

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-memory-p1-contract | Memory P1 开工前的短合同：① SDK 历史的保留窗口（留几版、留多久），被裁掉的版本怎样明确告诉用户不可恢复；② 记忆正文搬迁的步骤：先验证目标、再切写主人、失败不先删原件，不保留旧读取壳；③ 导出包的关系：SDK v2 作为现有 Molis 信封里的内容还是换信封，未知版本整包拒绝、不加 v1 读取兼容。由 Memory V0 收口批在收尾时产出，31 批第 2 项以它为前置 | [prologue-memory-strategy §9.1、§3.2](../prologue-memory-strategy/spec.md)；[决定 36](../post-anticorruption-roadmap/reference/decisions.md#decision-36) §8.3、§11 | 明确后续做 | 要等 P0 最终的存储形状定下来 | Memory V0 收口批（#2020） | 中 | C2／Memory |
