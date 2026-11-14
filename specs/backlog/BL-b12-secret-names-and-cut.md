# BL-b12-secret-names-and-cut

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b12-secret-names-and-cut | 两条薄弱的钉子：① 引导与项目说明文件跳过的密钥文件名单（contracts `services/materials` 的 `contextFileSkip`）偏少，补齐不以点开头的常见密钥文件（`*.pem`、`id_*`、`.env*` 已拦，其余以点开头的隐藏文件除名单内的都不读；还缺 `credentials*.json`、`service-account*.json`、`secrets.*`、`*.tfstate` 一类），桌面 Rust 那份由 `file_rule_matches_the_hosts` 一起跟上；② 说明文件过长时 vendored Prologue SDK 截断用的那句话，本仓库没有断言钉住，SDK 换包后措辞变了不会被发现，加一条断言 | 第 12 批评审台 S9（[#2061](https://github.com/molis-ai/molis-work/pull/2061)） | 已知缺口 | 不挡合并；名单变严会让引导少读文件，要在 PR 里写清；截断句的断言要等下一次换 SDK 包时一起看 | 无 | 中 | 下一个碰引导或 agent-host 的批次主会话（待分配） |
