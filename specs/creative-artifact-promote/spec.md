# 创作插件：存成 Artifact

## 背景与目标

Pages、问卷、Dataset、PPT 的编辑稿留在私人库。人明确发出的那一版才是 Artifact。Pages 已有这条路径，但按钮藏在文档「更多」里，文案是 Promote。问卷、数据表、演示稿还不能发出。

这一次让人在看着某一份资产时能把它存成 Artifact，并在打开后的顶栏再放同一个动作。

## 范围

- Pages：列表行和顶栏都能存成 Artifact。菜单里的原动作保留，文案改成同一句。
- 问卷：发出当前问卷（标题、说明、状态、题目）。答卷不进这一版。
- Dataset：发出当前表的列和行。本机「存一版 / 回滚」仍是编辑历史，不是 Artifact。
- PPT：发出当前演示稿的页和配色。
- 同一份再次发出，Artifact 版本加一。私人库记下 `artifact_id` 和 `artifact_version`。
- 列表上，已经发出过的显示「再存一版」。
- HTTP `POST /api/<plugin>/:id/promote`，并登记同名 MCP `promote`。

## 非目标

- 不把每次自动保存变成 Artifact。
- 不把答卷汇总、Dataset 回滚点单独做成第二种 Artifact。
- 不改 Feed「升格 Goal」。
- 不在产品里做端口连线页。

## 验收

- 四个插件的列表行和打开后的顶栏都有「存成 Artifact」。
- 点下去会登记一版 Artifact；再点一次版本变为 2。私人库记录还在，并能继续编辑。
- 问卷的「发布」、数据表的「存一版」仍是原来的动作。
