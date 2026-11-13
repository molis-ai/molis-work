# BL-composer-source-words-installed

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-composer-source-words-installed | 输入框来源的名称（`composer_source.title_text`）和插件名，`apps/local-host/src/composer-sources-http.ts` 的 `sourceWords` 只从内置登记取词：用 `molis-work plugin dev` 跑、带 `ui.locales` 的插件声明能过 SDK 校验，界面却只显示原文；插件目录（`plugin-directory.ts` 的 `runningPluginDirectory`）按运行实例取词，两边不同源。改成和插件目录同源取词。同时把「这是不是内置登记」的判断收成一个函数：现在有三种写法（这里按提供方、声明逐字相等和插件名，`ui-text-provider.ts` 的 `registeredInstallationText` 按 host 信任和 Manifest 摘要，`web-capabilities.ts` 按 kind 和 provider_id） | [第 15 批评审后增量的 C 轨合审](https://github.com/molis-ai/molis-work/pull/2017#issuecomment-6842235146)；[第 15 批核账](../post-anticorruption-roadmap/reference/batches/15.md) | 明确后续做 | 今天只有内置插件带语言文件（沙箱包带 `ui.locales` 会被拒），第 15 批只修内置插件英文页显示中文的回归 | 第 16 批之后放开沙箱包的语言文件 | 中 | 平台（宿主与 SDK） |
