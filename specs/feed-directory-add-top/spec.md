# Feed 目录「添加任务」放到顶部

状态：已实现。完成等级目标 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件覆盖 `specs/directory-list-primitive/spec.md` 里「Feed 添加是 panel 底部槽」对 Feed 的位置约定。Sessions 新建上移见 `specs/session-directory-runtime-folds/spec.md`。点「添加任务」仍走现有 `data-feed-add-toggle`。

## 背景与问题

Feed 左边目录把「添加任务」放在 GitHub / Gmail / RSS 下面。Goal 列表的创建入口在列表上方。扫任务时，添加入口要滚到最底才看见。

## 范围与非目标

范围：Feed 目录 `renderDirectoryPanel` 把添加控件放到任务列表之前；顶部间距。

非目标：不改添加对话框、主区空态里的「添加任务」、来源任务行。Sessions 新建位置改由 `specs/session-directory-runtime-folds/spec.md` 覆盖。

## 方案

`DirectoryPanelOptions.addPlacement: "start" | "end"`，默认 `end`。Feed 用 `start`。DOM：添加按钮在 `mw-dir__body` 之前，来源任务在下面。目录不再有「全部」行，见 `specs/feed-directory-drop-all/spec.md`。

## 验收

1. Feed 目录 HTML 里 `data-feed-add-toggle` 出现在第一个 `data-feed-task` 之前。
2. 打开 Feed：左边先看到「添加任务」，下面才是来源任务；点它仍打开现有添加流程。
3. Sessions 新建位置不再由本 spec 约束。
