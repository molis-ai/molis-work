# BL-composer-source-refresh

分组：4. 搜索、放置与工作流 / 统一输入

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-composer-source-refresh | 输入框的 `+` 菜单来源与 `/` 命令目录都只在组件挂载后读一次，之后没有按变化失效：`packages/design-system/src/browser/composer-menus.ts` 的 `openAdd()` 只在 `c.sources` 还是 `undefined` 时请求 `/api/composer/sources`，读到的列表一直用到重挂载；助理的 `/` 目录在 `apps/workbench/src/scripts/client/assistant-composer.ts` 里用 `catalog \|\|=` 只读一次 `/capabilities` 与 `/methods`。插件停用、卸载、撤权或能力目录变化后，菜单里仍列着旧来源，直到重挂载。取用不受影响：每次 `pick` 都现读 `/api/composer/pick`，由宿主按当时的声明、身份与种类重新核对，安全用例已过，所以这是菜单陈旧，不是越权或错误取数。要做的：来源与目录能按声明变化失效（或每次打开菜单重读一次，带上进行中的占位、菜单不闪），并补一条「停用后菜单不再列出该来源」的浏览器用例 | [第 10 批](../post-anticorruption-roadmap/reference/batches/10.md#batch-10-progress) 合后审计（2026-11-09） | 已知缺口 | 第 10 批 K2／K3 按「打开时读一次」落，需求没要求按变化失效；第一个真实来源在 K5，等它接入、有变化可看再定失效方式，免得现在为猜测造抽象 | 无（第 11 批 K5 接入第一个真实来源时一起看） | 低 | A 统一输入／第 11 批 |
