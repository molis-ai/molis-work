# BL-config-files-unversioned

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-config-files-unversioned | `config/web-service.json`、`config/uninstall.json` 读写时不看版本：没有 `schema_version`，程序变了结构也认不出来，读到旧形状只会按当前形状猜。要么像别的带版本文件一样带版本、进 `tooling/versions.json` 与升级链，要么在 `tooling/gates/version-exceptions.json` 写明为什么不需要 | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批收尾 | 已知缺口 | 本批只处理库和已带版本的文件；这两份目前只有宿主自己写、自己读 | U1 | 低 | C1（执行会话待分配） |
