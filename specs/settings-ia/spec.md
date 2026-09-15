# 两层设置：工作台目录 + 用户设置

状态：功能可用。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。源码预览 4182，不要停 4173。

本文件取代 `specs/project-settings-accordion/spec.md` 里「Hub / 折叠文书作为项目设置主表面」。

## 背景目标

设置有两层，入口必须分开：

- **用户设置**：这台设备上的偏好，从底栏账号进入。
- **项目设置**：只属于当前项目，从项目名旁齿轮进入，走项目内操作路径。

现在项目说明 / 工作规则 / 工作规划被塞进用户设置的项目清单右栏，齿轮又把人带出工作台进 Hub。左边没有分类目录，右边不是一页一事。

## 当前行为与问题

- 齿轮 `href` 为 `/projects/:id/settings`，服务端渲染独立 Hub（折叠文书）。
- `/settings/projects` 右栏用同一套折叠编辑某个项目的说明、规则、规划。
- 用户设置左栏是图标 + 标题 + 副标题的后台导航。
- Goal「打开项目设置」同样离开工作台。

## 范围与非目标

### 范围

- 齿轮打开工作台独占舞台（与插件市场相同）；壳不换。
- 左边目录换成单行分类：常规、项目说明、工作规则、工作规划；不要折叠、不要副标题。
- 右边一次只显示一页；内容仍用现有编辑器与 API。
- `/projects/:id/settings`、`/settings/general|guidance|rules|planning` 在项目前缀下打开同一工作台舞台，不再渲染 Hub。`?embed=1` 仍返回该页片段。
- 规划新建 / 方法详情仍可下钻为独立设置页；返回分类时回到工作台对应页。
- 用户设置目录改为分组单行：外观、AI 与执行工具、规划方法、诊断。底栏账号仍进外观。
- `/settings/projects` 只做清单：新建、导入、改名、删除、打开项目。不再编辑说明 / 规则 / 规划。
- Goal「打开项目设置」打开工作台「工作规则」。

### 非目标

- 不重做说明 / 规则 / 规划内部编辑器。
- 不做设置搜索。
- 不把插件、首页快捷方式放进设置。
- 不改创建 / 导入 / 删除契约。

## 使用场景

1. 在项目工作台点齿轮：左边变成设置分类，右边默认「常规」；插件条还在，没有当前插件。
2. 点「工作规则」：只换右栏，壳不动。
3. 点 Goals：设置舞台关掉，标签分栏回来。
4. 刷新 `/projects/:id/settings/rules`：仍是工作台，直接打开工作规则。
5. 底栏账号：离开工作台，进入用户设置「外观」。
6. 「管理项目」：清单右栏只能改名 / 删除 / 打开，提示说明和规则在项目内齿轮。

## 方案与关键决策

- 项目设置是 `tab-workspace` 的 `exclusive` 表面 `project-settings`，目录面板 `data-directory-panel="settings"`。
- 非 embed 的项目设置 URL 在 Host 里改写为工作台首页路由，浏览器地址保持 `/settings…`；客户端按路径打开对应页并拉取 embed。
- 用户设置不再把 `?project=` 藏进全局项。
- 不把 `project-settings` exclusive 写入标签分栏的持久化；刷新以 URL 为准。

## 文件边界

- `apps/workbench/src/project-settings-stage.ts`（新）
- `apps/workbench/src/scripts/client/project-settings-stage.ts`（新）
- `apps/workbench/src/goals-page-renderer.ts`、`immersive-shell.ts`、`settings-navigation.ts`、`settings-renderer.ts`、`project-settings-pages.ts`、`scripts/project-settings.ts`、`renderer.ts`
- `apps/local-host/src/web-request.ts`、`web-goals-read.ts`
- 样式：`styles/project-settings-stage.ts`、`settings.ts`、`immersive-navigation.ts`
- 测试：accordion / deletion / navigation e2e、新的路径与渲染测试

## 验收

1. 工作台齿轮不离开沉浸式壳；左边四条单行分类，右边一次一页。
2. 可改名、可看存储、可删除（用户项目需确认）；demo 重建 / 删除仍在常规页。
3. 说明 / 规则 / 规划保存仍走原 API。
4. `/projects/:id/settings/{general,guidance,rules,planning}` 与 `/settings` 在项目上下文返回工作台 HTML（非 Hub）；`?embed=1` 仍是片段。
5. `/settings/projects` 右栏没有说明 / 规则 / 规划折叠编辑器。
6. 用户设置左栏是分组单行，项为外观 / AI 与执行工具 / 规划方法 / 诊断。
7. 定向测试通过；4182 隔离验证齿轮与底栏账号。

## 验证命令

```
node_modules/.bin/tsc -p apps/workbench/tsconfig.json --noEmitOnError false
node --import tsx --test --test-concurrency=1 \
  tests/project-settings-stage.test.ts \
  tests/project-settings-accordion.test.ts \
  tests/project-settings-deletion.test.ts \
  tests/project-settings-navigation.e2e.test.ts
```

Chrome e2e 需要非沙箱。隔离试用必须临时 `--home`。

## 假设与开放问题

- 规划方法下钻页暂时仍用设置壳；点分类会回到工作台。
- 设置搜索、把常规页做成与 Codex 完全同构的控件行，记 later。
