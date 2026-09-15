# 项目设置铺平为分区展开

状态：**已作废**，由 `specs/settings-ia/spec.md` 取代。Hub / 折叠文书不再是项目设置主表面。

## 背景目标

`/settings/projects` 右栏把「基本信息 / 项目说明 / 工作规则 / 工作规划」做成跳转链接，进了项目之后顶栏齿轮又落到另一套四页左栏。同一组项目设置被拆成两次导航。目标是：右栏铺满、分区展开；齿轮打开同一套分区。

## 当前行为与问题

- 右栏 `article.project-manager-detail` 最大宽 720px，四条 `<a>` 跳到 `/projects/:id/settings/{general,guidance,rules,planning}`。
- 齿轮 `a.navigator-project-settings` 默认进 `/settings/guidance`，左侧仍是四条文档导航。
- 改名和存储已经在右栏，删除仍只在独立「基本信息」页。

## 范围与非目标

### 范围

- 右栏是一份左对齐的项目文书，不是四条后台导航。身份（改名、存储）常开；项目说明 / 工作规则 / 工作规划用章节标题展开；允许多开。
- 删除和 demo 重建沉在章节之后，不跟身份抢第一屏。
- 「项目说明 / 工作规则 / 工作规划」在右栏首次展开时拉取已有文档片段，不把每个项目的完整编辑器都 SSR 进清单页。
- 齿轮与旧四条 URL 进入同一 Hub：`/projects/:id/settings`，无四条文档左栏；旧路径打开对应分区。
- 规划方法库/新建/编辑仍是 Hub 里「工作规划」的下钻页。

### 非目标

- 不重做 guidance / rules / planning 内部编辑器。
- 不把全局设置嵌进项目设置。
- 不在工作台用浮层代替齿轮跳转。
- 不改创建/导入/demo 确认契约。

## 使用场景

1. 打开 `/settings/projects`，选中项目：右栏是项目名、改名和存储；点「项目说明」就地展开编辑器。
2. 进入 Goal Tree，点项目名旁齿轮：同一份文书，默认看到身份，三个文档章节可展开。
3. 旧书签 `/settings/guidance` 仍可用，进入 Hub 且「项目说明」展开。
4. 用户项目删除仍在基本信息里，需勾选确认；清单页第一屏不把删除当主操作。

## 方案与关键决策

- 共用 `project-settings-folds` 渲染分区。
- Hub 对当前项目 SSR 四段；清单页只 SSR 基本信息，其余 `?embed=1` 懒加载。
- `/settings/planning` 作为 Hub 的规划分区；`/settings/planning/new` 与方法详情仍走规划路由。

## 文件边界

- `apps/workbench/src/project-settings-folds.ts`（新）
- `apps/workbench/src/project-settings-pages.ts`、`settings-renderer.ts`、`settings-navigation.ts`、`renderer.ts`
- `apps/workbench/src/styles/settings.ts`、`scripts/project-settings.ts`、`scripts/settings.ts`、`i18n/en.ts`
- `apps/local-host/src/web-goals-read.ts`
- `plugins/native/goals/src/project-policy-client.ts`、`planning-client.ts`
- 测试：`tests/project-settings-navigation.e2e.test.ts`、`tests/project-settings-deletion.test.ts`、新建 accordion 渲染测试

## 验收

1. `/settings/projects` 右栏没有跳转到四份设置页的链接列表；身份常开；三个文档章节是标题式 `<details>`，没有图标+双行说明的导航行。
2. 可改名、可看存储；用户项目可打开删除确认框；demo 仍走重建/删除；删除不作为第一屏主按钮。
3. 展开项目说明/工作规则/工作规划后，原编辑器可操作（保存仍走原 API）。
4. 齿轮 href 为 `/projects/:id/settings`，页面与右栏同一套分区，无 `.project-settings-navigation` 四条文档链。
5. `/settings/general|guidance|rules|planning` 仍 200，并打开对应分区。
6. 定向测试通过；隔离浏览器验证清单页与齿轮入口。

## 验证命令

```
node_modules/.bin/tsc -p apps/workbench/tsconfig.json
node_modules/.bin/tsc -p plugins/native/goals/tsconfig.json
node --import tsx --test --test-concurrency=1 \
  tests/project-settings-accordion.test.ts \
  tests/project-settings-deletion.test.ts \
  tests/chrome-inner-scroll.test.ts \
  tests/project-settings-navigation.e2e.test.ts
```

Chrome e2e 需要非沙箱。隔离试用必须临时 `--home`，禁止打默认 home。源码预览用 4182，不要停 4173。

## 假设与开放问题

- 清单页切换项目时卸载已加载的重文档，避免多个 guidance 编辑器抢全局选择器。
- 规划下钻页暂时仍可保留左侧四条链，链到 Hub 对应分区。
