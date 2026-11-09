# BL-secret-entry-storage-code

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-secret-entry-storage-code | 密钥文件里某个条目坏了（解不开、形状不对）时，拒绝的错误码不是 `storage.*`，和库、带版本文件坏了时的说法不一致；MCP 那一路的原话也要跟着一致。白话化「结构版本是 0」见 BL-versioned-file-refusal-words | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批收尾 | 已知缺口 | 本批集成时发现，不挡升级链 | U1-e | 低 | C1（执行会话待分配） |
