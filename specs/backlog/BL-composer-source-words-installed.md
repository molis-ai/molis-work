# BL-composer-source-words-installed

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-composer-source-words-installed | 输入框来源一半已改（2026-11-13，`fix/post-15-bugs`；[#2044](https://github.com/molis-ai/molis-work/pull/2044)）：`apps/local-host/src/composer-sources-http.ts` 的 `sourceWords` 按此刻运行的发行物取词，与插件目录同源，身份核对收在 `apps/local-host/src/running-plugin-text.ts` 的 `runningPluginText`（成果显示名同用它）。还剩两处只从内置登记取词、对用 `molis-work plugin dev` 跑或装上的插件只显示原文：能力库的标题（`apps/local-host/src/web-capabilities.ts` 的 `libraryTitles`，按 kind 与 provider_id 判断是不是内置）和任务授权里的插件名（`apps/local-host/src/ui-text-provider.ts` 的 `registeredInstallationText`，按 host 信任和 Manifest 摘要，`task-grants-settings-http.ts`、`task-grant-actions.ts` 调它）。改成同样调 `runningPluginText`，「这是不是内置登记」的判断就只剩一处 | [第 15 批评审后增量的 C 轨合审](https://github.com/molis-ai/molis-work/pull/2017#issuecomment-6842235146)；[第 15 批核账](../post-anticorruption-roadmap/reference/batches/15.md) | 明确后续做 | 今天只有内置插件带语言文件（沙箱包带 `ui.locales` 会被拒）；这两处读的是项目之外或宿主侧的数据，要先定拿哪个运行平台 | 第 16 批之后放开沙箱包的语言文件 | 中 | 平台（宿主与 SDK） |
