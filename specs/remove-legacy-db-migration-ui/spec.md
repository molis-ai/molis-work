# 拆除旧 Molis Work DB 迁移

## 背景目标

产品只按项目目录工作。8 月中项目化之前「拿一份散落 `.db` 迁进项目目录」的过渡能力不再保留：网页入口已经拆掉，catalog `migrateLegacyDatabase()`、`migrated_user` 分类和「已迁移」展示一并去掉。

完成等级 **3：功能可用**。不发布、不改用户真实库以外的自动分类改写（打开旧 catalog 时把已有 `migrated_user` 记成 `user`）。

## 当前行为与问题证据

- 网页已无迁移入口；`POST /api/projects/migrate` 不再迁库。
- Catalog 仍提供 `migrateLegacyDatabase()`，测试和 browser fixture 还在调用。
- 项目记录仍有 `data_class: migrated_user`、`source: migrated`、`migrated_from_path`；目录和设置把这类项目标成「已迁移」。

## 范围与非目标

做：

- 删除 `migrateLegacyDatabase()`、迁移输入类型、`catalog.legacy_missing` / `catalog.legacy_conflict`。
- 公开项目分类只剩 `user` 与 `regenerable_demo`。已有 `migrated_user` 在 catalog schema 升级时改成 `user`；卸载只读检查也按用户项目计数，不改文件。
- 删除「已迁移」文案与相关 i18n。测试 fixture 改为 `createProject` + 写入种子数据，不再假迁库。
- 安装说明不再写 `migrated_user`。

不做：

- 不删除 SQLite schema 迁移、Home 目录改名（`~/.goalboard` → `~/.molis-work`）、Session `migrateLegacy`。
- 不重写历史规划文档。
- 不从 catalog 表物理删除 `source` / `migrated_from_path` 列（避免重建带外键的表）；公开类型和写入不再使用它们表达迁库。

## 使用场景

1. 打开项目目录 / 项目管理：用户项目只显示「本地项目」，没有「已迁移」。
2. 代码与测试不能再调用迁库 API。
3. 已有被标成 `migrated_user` 的项目仍可打开，升级后与普通用户项目相同。
4. 卸载预览仍把旧 schema 里 `source=migrated` 的行算作用户数据，且不改那份 catalog 文件。

## 方案与关键决策

迁库整条删除。已迁入的项目就是用户项目。`board_id` 仍可与 `project_id` 不同，那是 V1 数据库身份，不是迁库入口。

## 验收

1. 无 `migrateLegacyDatabase`、`MigrateProjectInput`、`project-index-migration`、`data-project-migration-dialog`。
2. 公开 `data_class` 无 `migrated_user`；UI 无「已迁移」。
3. 项目目录搜索、新建项目、demo、卸载预览仍可用。
4. 定向测试通过。

## 验证

```bash
pnpm exec tsx --test --test-concurrency=1 \
  tests/project-index-arrival.test.ts \
  tests/project-settings-navigation.e2e.test.ts \
  tests/web.test.ts \
  tests/i18n.test.ts \
  tests/project-settings-stage.test.ts \
  tests/project-settings-accordion.test.ts \
  tests/projects-module.test.ts \
  tests/project-catalog.test.ts \
  tests/uninstall-catalog.test.ts
```
