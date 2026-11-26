# BL-catalog-locale-split

分组：1. 待你验收

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-catalog-locale-split | 组件板词包已拆出。请看设置的技能范围提示和组件板的对应标本，确认三处中文是否清楚。 | [#2038 评审补记](https://github.com/molis-ai/molis-work/pull/2038#issuecomment-6828843484) | 待你验收 | 491 个纯标本键移到组件板，64 个共享键归回业务。严格文案检查发现三处「本地 Agent」，其中一处也出现在设置页。请确认改写后的文字。 | 打开技能设置与开发模式的组件板即可核对。 | 中 | 一骏（验收），Codex（实施） |

D-1 验收：三份工作台主词包均不含 `workbench.catalog.*` 或 `workbench.catalog-*` 标本词。普通页面也使用的键由对应业务命名空间持有，组件板继续复用。仅开发模式的组件板及其子页读取已有组件板词包，首次显示与中 → 英 → 日 → 中切换都要正确。验证见 `ui-resources`、`ui-text-locale-files` 和 `workbench-language.e2e`，翻译及文案检查沿用现行标准。
