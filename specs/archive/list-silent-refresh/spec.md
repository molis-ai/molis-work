# 列表页增删改查后无感刷新

完成等级：**3 功能可用**。不提交、不发布。

## 背景目标

人在列表上新建、改名、删除、筛选之后，列表要自己更新成服务器上的事实。不要整页白闪，也不要人自己去刷新。

## 当前行为与问题证据

- Feed / Inbox / Schedule 在来源、Item、Inbox 状态、定时任务增删改之后走 `location.reload()`，整页重载。
- Forms / Dataset / PPT / Functions / Pages / 灵光 改完只改内存里的数组再 `replaceChildren()`，不重新 GET；返回列表时标题/状态可能还是旧的；整表重画会把滚动条打回顶部。

## 范围与非目标

做：工作台目录列表——Goals 已有 `refreshBoard` 保持；Feed、Inbox、Schedule、Pages、Forms、Dataset、PPT、Functions、灵光。增删改查成功后重新拉列表、原地换行、保住滚动和当前选中/展开。失败才允许退回整页刷新。

不做：设置页、市场「添加插件」后的重挂、Connectors OAuth 跳转、Goals 文档正文、编辑器内部题/列/页的 DOM（那些继续本地改，不重挂正在输入的表单）。

## 使用场景

1. Forms 新建一份问卷：右侧打开编辑器，返回列表能看到新行，列表滚动位置还在。
2. 删掉一篇 Pages：确认后回到列表，那一行没了，没有整页闪白。
3. Feed 添加任务或忽略一条 Item：列表更新，搜索词和筛选还在。
4. Inbox 标记已处理：这条从「待处理」进「历史」，详情和修订号跟着变。
5. Schedule 新建定时任务：列表出现新行并打开详情，对话框关掉，页面不重载。

## 方案

1. 个人插件列表：`renderList` 先记下 `.plugin-stage-list` 的 `scrollTop`，画完写回去。创建、删除、文件夹、发布、收藏、移动、从编辑器返回后 `GET` 再画；自动保存仍只 `remember`，不重挂编辑器。
2. Feed：已有 `GET /api/feed/workbench` fragment，换掉列表/工具条/详情，恢复筛选和滚动。
3. Inbox / Schedule：补 `GET /api/inbox/workbench`、`GET /api/schedule/workbench`，返回与首屏同一份舞台 HTML，客户端抽 `[data-inbox-list]` / `[data-schedule-list]` 和 workspace。
4. 这些路径上的 `location.reload()` 改成上述刷新；fragment 失败再整页刷新。

## 文件 / 模块边界

允许：`specs/archive/list-silent-refresh/`；`apps/workbench/src/scripts/client/{navigation-feed,navigation-inbox,events-primary,events-secondary}.ts`；`apps/workbench/src/plugin-workbench.ts`；`apps/workbench/src/renderer.ts`；`apps/local-host/src/{inbox,schedule}-native-plugin-http.ts`；`apps/local-host/src/web-request.ts`；`plugins/native/{inbox,schedule,pages,form,dataset,ppt,functions,lingguang}`；对应测试。

禁止：改 Goal 事件语义、SecretStore、MCP、Connector 凭据。

## 验收标准

1. Forms / Dataset / PPT / Functions / Pages / 灵光 客户端在创建、删除、从编辑器返回后调用 `loadList`；`renderList` 恢复列表 `scrollTop`。
2. Functions `loadList` 不再对当前草稿调用 `fillEditor`。
3. Feed / Inbox / Schedule 成功路径不再 `location.reload()`。
4. `GET /api/inbox/workbench` 与 `GET /api/schedule/workbench` 返回舞台 HTML。
5. 工作台客户端含 `refreshFeedStage` / `refreshInboxStage`。

## 验证命令

```
node --import tsx --test --test-concurrency=1 tests/list-silent-refresh.test.ts tests/creative-tools-plugins.test.ts tests/pages-plugin.test.ts tests/functions-plugin.test.ts tests/lingguang-plugin.test.ts tests/schedule-plugin.test.ts tests/inbox-native-plugin.test.ts tests/feed-native-plugin.test.ts
```

浏览器：4195 打开 Forms 新建再返回、Pages 删除、Feed 忽略一条，列表更新且不整页闪白。

## 假设与开放问题

来源对话框里的捕捉规则仍可能要等下次打开才看到最新 HTML；本次只保证列表页本身无感更新。
