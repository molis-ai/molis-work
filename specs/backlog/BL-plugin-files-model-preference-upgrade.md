# BL-plugin-files-model-preference-upgrade

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-plugin-files-model-preference-upgrade | 已装沙箱插件的模型偏好写在 `<Home>/plugin-files/<install_id>/.model-settings/preference.json`（`apps/local-host/src/sandbox-model-settings.ts:17-20`），读写都经 `MODEL_PREFERENCE_FILE`（`apps/local-host/src/model-configuration.ts:20-29,74`），但升级过程不枚举它：`apps/local-host/src/platform-upgrade-stores.ts` 的 `platformFiles()` 只展开内置插件的 `platformModelPreferences()`（`apps/local-host/src/home-stores.ts:44-48`）。今天 `format.model.preference` 还是 1，没有影响；升到 2 时这些文件不会被升级，读写会被 `assertVersionedFileWritable` 一直拒绝。发布检查单第 3 节也如实写着「装进来的插件那份不在升级过程里」 | 第 05 批复核（2026-11-11 代码质量复审）；[U1 设计](../upgrade-continuity/upgrade-chain-design.md) §2.6 | 已知缺口 | 要枚举就得从安装台账或目录校验 install id 后列出文件，并在升级扫描里接受它；或者定「这份偏好随安装重建、不迁移」，但那样要同时改 CHECKLIST 第 3 节与读写的拒绝语义，不是这一轮能顺手定的 | 第一次升 `format.model.preference`；U4 打开已装插件升级段前后 | 低 | 存储维护人（执行会话待分配） |
