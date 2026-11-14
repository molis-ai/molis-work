# BL-lsp-servers-declaration

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-lsp-servers-declaration | 第三方插件还不能在 Manifest 里声明自己的语言服务器（`lsp_servers`），只有宿主按人配置的 `language-servers.json` 提供 `coding.symbol-index`。要让装一个语言插件就能查到定义/引用，需要一个声明式的 `lsp_servers` 合同 + Plugin Runtime 装配 + 权限与来源校验。 | 第 31 批（用户 2026-11-12 定「LSP 走宿主侧」的代价）；[Coding A4-1](../coding-plugin/next-requirements.md) | 明确后续做 | 宿主侧执行器先让人配的那一份能用；声明式装配要新增 Manifest 合同（红线：改合同要按 CONTRACT-CHANGES 走）与 sandbox/来源规则 | 第 31 批合入（宿主侧第一片） | 中 | C1／合同与 SDK，E／插件（执行会话待分配） |
