# Feed 添加任务：去掉营销选类型页

状态：已落地。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

## 背景与问题

点「添加任务」打开的 sheet 是六张描边卡片：大段口号（「网站与博客」「持续收集新文章」）、chevron、浏览器默认按钮边框。Goal 新建是直接填表。用户指出这页内容不像产品里的工作台。

## 范围与非目标

范围：选择来源这一步的文案、行语法、描边；目录为空时不展示「目录订阅」；setup 标题跟新名称走。

非目标：不改注册 API、GitHub/Gmail 授权、任务配置表单字段、捕捉规则合同。

## 方案

1. 选择步改成 32px 单行：图标、名称、右侧一句短提示；无卡片描边、无 chevron、无营销段落。
2. 名称说人会加什么：RSS / Atom、目录订阅、网页搜索、YouTube、GitHub、Gmail。
3. 标题改「添加任务」，副文案「选一种来源。」
4. `source_catalog` 为空时不渲染目录订阅。

## 验收

1. overlays 没有「网站与博客」「持续收集新文章」「chevron-right」在 choice 行上。
2. choice 是 `feed-source-choice`，有 `data-feed-choose-kind`；空目录没有 `data-feed-choose-kind="rss"`。
3. 4180：选择步是密行列表；点 RSS 仍进入原来的填写步。

## 验证

```
node --import tsx --test --test-concurrency=1 tests/feed-native-plugin.test.ts
```
