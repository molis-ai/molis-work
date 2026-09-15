# 安全卸载与演示数据分类

## 目标

用户可以放心卸载程序或 Runtime 接入而不丢自己的项目；演示数据是明确、可重建、可单独清理
的产品资产。

## 范围

- 项目记录增加数据分类：`user`、`migrated_user`、`regenerable_demo`；现有 created/migrated
  数据无损迁移为用户数据。
- Web/CLI 显式创建 demo；重复创建可打开现有 demo，reset/remove 都明确提示影响。
- 新 uninstall service 先生成 plan：移除 owned Runtime 接入、LaunchAgent、release、launcher、
  临时配置和可再生 demo；默认保留 catalog、用户项目 DB、备份和必要恢复清单。
- `--purge-user-data` 是独立破坏性操作，要求再次确认精确 home 与项目数量；不与普通 uninstall
  共用一个模糊的 yes。
- 强确认的 purge 同时删除 Molis Work 自己生成的 Runtime 接入备份、接入收据、日志和空安装目录；
  如果 home 中还有未知文件，只清理已知目录并保留未知内容，不能递归误删整个 home。
- 任一步失败要保留可恢复状态和收据，不留下“配置删了、数据也不知道还在不在”的结果。

## 验收

- 普通 uninstall 后所有 user/migrated_user 项目及 catalog 可重新安装恢复。
- demo 可单独创建、重置、删除，并在 UI 明确标注为演示数据。
- 未给 purge 强确认时永不删除用户项目。
- purge 完成后，在没有未知文件的正常安装中不应残留 `~/.molis-work`；只剩 Molis Work 自己生成的
  Runtime 配置备份也必须仍能生成可执行的 purge 计划。
- owned config 被用户改过时拒绝删除并报告，不扩大清理范围。

## 修改边界与验证

- project catalog migration、uninstall service、CLI/Web、demo seed 与测试。

```bash
node --import tsx --test tests/project-catalog.test.ts tests/install.test.ts tests/web.test.ts tests/e2e.test.ts
pnpm typecheck
```
