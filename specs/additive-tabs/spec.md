# 标签只添加、不替代

状态：功能可用。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不发布、不安装新 App。

本文件是这次标签打开规则的唯一需求书。它取代 `specs/chrome-tabs-preview-groups/spec.md` 里「单击预览、双击钉住、每栏一张预览」；手动分组、分栏几何仍以该文件和 `specs/workbench-tab-workspace/spec.md` 为准。

## 背景目标

打开标签时不要改已有标签的身份：点 Goal 不能把「画布」变成那张 Goal。同一栏里已经打开过的那张，再点一次只激活，不要再叠一张。分屏后每一栏自己算：另一栏可以再开一份同样的。

## 当前行为与问题证据

上一轮为了去掉 VS Code 预览顶替，打开一律 `insertNew`，同一张画布、同一个 Goal 再点也会再加一张。用户要的是：不一样的才新增；一样的不要新开；分屏允许重复。

## 范围与非目标

### 做

- 打开插件母页或 item：只看**焦点栏**。栏里已有同身份（同一母页，或同一 plugin+item）就激活那张，不新增、不改别的标签身份。
- 焦点栏没有这张身份：在焦点栏插入一张新的普通标签并激活。已有首页、画布、别的 Goal 都留着。
- 分屏、拖到另一栏、复制到另一栏：即使目标栏已有同身份，也允许两栏各有一份，不把另一栏那张吞掉。
- 同一目标的第二次 click（`detail > 1`，即双击）不另加标签。

### 不做

- 不恢复斜体预览、不把一张标签改成另一种身份。
- 不改手动分组、固定、分屏几何、空栏、刷新恢复、市场/设置独占。
- 不让同一栏里两张同插件标签拥有两份独立 DOM；单栏仍共用插件表面，切标签只恢复该标签记住的 item。
- 不提交、不发布、不改用户真实库。

## 使用场景

1. 进项目只有首页。点 Goals：多一张「画布」，首页还在。
2. 再点某个 Goal：多一张 Goal 标签，「画布」还在。
3. 再点同一个 Goal：还是那一张，不叠第二张。
4. 再点另一个 Goal：再多一张，画布和前一个 Goal 都在。
5. 再点 Goals：切回已有「画布」，不新开第二张画布，Goal 标签还在。
6. 点 Sessions：多一张 Sessions，Goals 那些还在。再点 Sessions 只激活。
7. 向右分屏后，在另一栏再点 Goals：那一栏可以再有一张画布，左边那张还在。

## 方案与关键决策

- `openPlugin` / `openItem` 在焦点栏按 `tabKey` 查找：有则激活，无则 `insertNew`。忽略 preview/commit 模式。
- `tabKey`：母页是 `plugin:mother`（首页是 `home:home`），item 是 `plugin:item:itemId`。画布和某个 Goal 不是同一身份。
- 查找范围只限焦点栏，不跳到另一栏去激活。
- 拖拽 / 分屏复制不走这条打开规则，允许栏间重复。

## 文件 / 模块边界

允许改：`tab-workspace-ops.ts`、`tab-workspace.ts` 客户端、目录打开路径、`specs/workbench-tab-workspace/spec.md` 里指向本规则的句子、本 spec 指向的测试。

不改：Goal / Session / Feed 领域写入、MCP、项目选择页。

## 验收

1. 点 Goals 后条上同时有首页和画布；画布不是斜体预览。
2. 再点一个 Goal：条上同时有画布和该 Goal。
3. 再点同一个 Goal：Goal 标签还是一张。
4. 再点 Goals：画布仍是一张并被激活，已有 Goal 还在。
5. 点另一个 Goal：两张 Goal 都在。
6. 分屏后两栏可以同时有同一 Goal 或同一张画布；空栏、刷新恢复仍可用。

## 验证

```bash
node --import tsx --test --test-concurrency=1 \
  tests/tab-workspace-ops.test.ts \
  tests/workbench-tab-workspace.e2e.test.ts \
  tests/compact-icon-tabs.e2e.test.ts
```

浏览器：进项目 → 点 Goals → 点一个 Goal → 再点同一个 Goal → 再点 Goals → 点 Sessions。条上应留下首页、一张画布、那张 Goal、一张 Sessions，再点已打开的不会变多。

## 假设

- 「一样」= 焦点栏里同一身份，不是「同一类插件只能一张」。
- 画布节点「打开 Frame」仍走 `openItem`；该 Goal 已在焦点栏则只激活。
