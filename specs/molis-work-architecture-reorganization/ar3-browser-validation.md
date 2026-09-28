# AR3 浏览入口阶段验证（未关闭 AR3）

## 当前结果与边界

正式 Artifact 的列表、精确版本详情、本地 JSON 导出已经接入真实 Web HTTP 和项目目录。Native Artifact 提供 application / UI contribution，Workbench 挂载和组合文档，root 绑定项目公开 Query；没有跨 owner Store、没有根据 producer 绑定 consumer，也没有增加安装或 Team 同步协议。

这是 AR3 的可用切片，不是整体重组或完整 AR3 完成结论。现有 private Work、Evidence 判定和 Goal 生命周期没有被吸收为 Artifact。

## 代码与调用链

- `plugins/native/artifacts/src/browser.ts`：按 Project 精确查版本；版本号必须是正整数，404 不替换成 latest；本地只读导出。
- `plugins/native/artifacts/src/browser-ui.ts`：目录、详情和可挂载的 embed；内容按 opaque JSON 展示，不作业务解释。`en.ts` 拥有英文说明。
- `apps/workbench/src/artifact-ui.ts` / `index.ts`：UI Host 的公开 contribution 挂载、既有主题、单目录/详情和窄屏分步显示。
- `src/web/artifact-native-plugin-http.ts`：绑定项目 Query、locale、图标与 HTTP headers，不持有 Repository。
- `src/web/server.ts` / `render.ts`：实际路由和一级目录入口。项目级路径保持 `/projects/:projectId` 前缀。

### 旧引用调用者核对

`render.ts` 中的输入绑定、风险解决依据、Impact 输入快照、依赖依据、Proposal source refs 继续调用薄 `renderReference`。EX4 的 Run / Evidence / Review renderer 通过注入的同一函数调用 Artifact reference contribution。外链仍为外链，项目文件仍经过精确 Evidence locator、verified 状态、原 workspace 和安全 reader，不透明引用仍是复制控件。

这些旧字段只是字符串 locator，没有 producer 提供的 Artifact version；迁移展示/读取职责，不捏造版本，不批量改写历史。不把私人 Session/Handoff 内容自动发布到 Artifact。

本核对尚未代替全量 legacy caller 审计；正式 Artifact embed 已有公开挂载与测试，产品中的实际嵌入消费链路仍需收口。

## 自动检查

通过：

- Artifact Plugin、Workbench build 和根 TypeScript 检查。
- `tests/artifact-browser.test.ts` 4 项真实 HTTP：多版本原始内容/导出逐字段对账、HTML 转义、中英文、未知/跨项目/非法版本、空列表、不可用与归档、UI Host embed、类型/schema 兼容判定、真实项目目录前缀。
- 浏览和导出前后比较 Artifact 记录，以及非空 demo 的 Goal、Evidence、Run、Review 原始状态，不以页面返回 200 代替无写入证明。
- `tests/artifact-project-reference.test.ts`、`tests/artifact-reference-ui.test.ts`、`tests/workbench-ui-platform.test.ts` 11 项通过；与最初 3 项 browser 测试同轮为 14/14，补充项目目录场景后 browser 单独为 4/4。
- 完整 `tests/web.test.ts` 59/59；包括原 workspace/worktree、文件缺失/恢复、越界/符号链接、文本/大小限制和既有 Goal/Evidence 路径。
- 包边界零错误，`git diff --check` 通过。Detector 对两份新 UI 源码执行一次返回 `[]`。

这些证据只覆盖上述切片；不推导整个应用功能无损或可发布。

## 真实浏览器操作

使用单独的合成项目、真实生产 Module / Workbench / HTTP，不操作用户项目数据。

1. Chrome 中从列表选择 v1（列表同时有 v2），展开原始 JSON，显示 v1 内容。
2. 点击“导出这个版本”收到浏览器 download 事件。HTTP 测试已核对对应版本的完整 JSON；未另外读取浏览器实际下载文件的字节。
3. 390×844 下返回列表，显示完整版本选择；详情独立展示，DOM 宽度与 scrollWidth 均为 390，无横向溢出。
4. 从原 Goal 的“记录 → 执行与检查”打开 `project://result.txt`，Chrome 新页实际显示 fixture 原始中文内容，补齐前次内置浏览器文件新页阻断留下的缺口。
5. 复制不透明引用显示“引用已复制”；浏览器剪贴板返回空，系统剪贴板与预期固定 fixture 值比较也未匹配。因此实际复制仍为未验证，不能记通过。没有修改复制语义或伪造剪贴板内容。

内置浏览器在 DPR=2.5 时截取画面出现比例异常，不能作为有效截图。本次有效截图由 Chrome 的 1024×768 / 390×844 视口生成并打开确认：

- `.impeccable/review/ar3-browser/desktop.png`
- `.impeccable/review/ar3-browser/mobile.png`
- `.impeccable/review/ar3-browser/mobile-list.png`

## 独立界面审查

`impeccable_finish_reviewer` 首次给出 `fix`：不能用当前不可执行的“安装兼容插件”充当恢复路径。已修改中英文，根据 inline/reference 类型只说明现在可用的查看、原始内容/引用和本地导出；没有新增安装功能。

重建、定向测试和同尺寸截图复核后，reviewer verdict 为该项 `resolved` / `ship`。这是对该修复项的结论，不是全 AR3 或全产品验收。沿用既有 DESIGN，未重做视觉系统。

## 接续项

- 收口正式 Artifact 的实际嵌入消费 caller 及全量旧结果引用对账；不能只用测试调用证明产品中的消费链路。
- 解释并验证实际复制行为，区分浏览器测试环境问题与产品失败；当前不继续盲试同一剪贴板路径。
- AR3 完成前按 accepted Contract 逐项审计并提交证据/复核；本文件不提前关闭 Goal。
- 整体开发后仍需更新运行中的安装版本、验证 Session Registry schema=5 的列表/恢复链路，再做全产品模拟用户 E2E、代码清理和第二轮 E2E/架构审计。
