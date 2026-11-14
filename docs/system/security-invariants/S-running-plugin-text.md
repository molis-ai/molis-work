# S-running-plugin-text

| 编号 | 不变量 | 守住它的代码 | 断言拒绝本身的测试 | 只在本机跑 |
| --- | --- | --- | --- | --- |
| S-running-plugin-text | 插件正文/标题只从此刻仍在运行、且与安装记录一致的发行物读：安装记录必须 running，插件 id、安装世代、版本、发布者签名和 Manifest 摘要都与运行中的激活一致；发行物签名或安装号对不上时返回 null，调用方只显示原文或空，不读另一份安装的语言文件。 | `apps/local-host/src/running-plugin-text.ts` 的 `runningPluginText`（安装记录与激活核对）；`apps/local-host/src/composer-sources-http.ts`、`apps/local-host/src/web-capabilities.ts`、`apps/local-host/src/ui-text-provider.ts` 的读词入口都经它。 | `tests/security-invariants-running-plugin-text.test.ts`「identity 1: a matching running release returns its Manifest and reader」「identity 2: no platform, no source, and each durable identity mismatch refuse」 | — |
