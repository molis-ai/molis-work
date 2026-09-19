状态：部分被 `specs/feed-directory-drop-all/spec.md` 覆盖（去掉「全部」、来源行恢复行首图标、不再 nested）。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

# Feed 目录对齐 Goal 列表

## 背景与目标

工作台第二栏 Feed 目录现在是 36px 双行 `mw-dir-row--meta`：行首图标、计数、彩色健康标、上次拉取、行尾配置挤在一起，和 Goal 列表的 28px 单行语法对不上。用户要求参考 Goal 目录列表。

完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

## 当前行为与问题

- 「全部」是带图标和副标题的双行选中块。
- 「拉取任务」是独立分组标题，和 Goal「当前」集合行不是同一套语法。
- 来源行重复 refresh 图标、条目计数、状态标和上次拉取。

## 范围与非目标

范围：Feed directory HTML 密度与信息层次；`mw-dir-row--nested` 缩进；去掉目录里多余的分组标题和 36px 添加按钮覆盖；DESIGN / 目录原语文档中 Feed 行的描述；相关单测。

非目标：Goal 树、Inbox/Artifacts 的 meta 行、Feed 主区 Item 流水、任务配置对话框、领域写入。

## 方案

1. Feed 目录改用 compact 28px 单行，去掉行首图标和副标题。
2. 「全部」承担 Goal「当前」那种集合行职责；具体 fold 交互与样式见 `specs/feed-directory-all-fold/spec.md`。
3. 去掉「拉取任务」h2；来源任务作为子项缩进，行尾只留健康标和配置。
4. 上次拉取只留在任务配置里。
5. 「添加任务」回到 28px 全宽添加控件，不再覆盖成 36px。
6. 选中只画在 `mw-dir-row-wrap` 一层 `--nav-active` 底上，里层 row 保持透明，避免两条灰条。

## 验收

1. Feed directory 行是 `mw-dir-row--compact`，没有 `mw-dir-row--meta`、没有 `mw-dir-row__icon`、没有 directory-heading。
2. 「全部」有 caret / 计数；来源行带 `mw-dir-row--nested` 和状态标，点行/配置合同不变。fold 细节见 `specs/feed-directory-all-fold/spec.md`。
3. 浏览器：Feed 目录行高约 28px，来源相对「全部」缩进；选中只有一条灰底，没有里外两层。

## 验证

```
node --import tsx --test --test-concurrency=1 tests/primitives.test.ts tests/feed-native-plugin.test.ts
```

隔离预览 `127.0.0.1:4180 --home /Users/didi/.molis-work`。
