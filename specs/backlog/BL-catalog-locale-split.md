# BL-catalog-locale-split

分组：9. 平台小项与工程流程 / 设计系统与界面收口

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-catalog-locale-split | 组件板标本文字（工作台词包里 `workbench.catalog-board*` 等约 485 个键）从每页首次加载的工作台主词包拆出，只在访问 `/__ui/catalog` 时加载 | [#2038 评审补记](https://github.com/molis-ai/molis-work/pull/2038#issuecomment-6828843484) | 明确后续做 | 需改词包打包与页面翻译门禁对组件板键的归属规则，属 D 轨独立收口项 | 无 | 中 | D 轨（执行会话待分配） |

D-1 验收：三份工作台主词包均不含 `workbench.catalog.*` 或 `workbench.catalog-*` 标本词。普通页面也使用的键由对应业务命名空间持有，组件板继续复用。仅开发模式的组件板及其子页读取已有组件板词包，首次显示与中 → 英 → 日 → 中切换都要正确。验证见 `ui-resources`、`ui-text-locale-files` 和 `workbench-language.e2e`，翻译及文案检查沿用现行标准。
