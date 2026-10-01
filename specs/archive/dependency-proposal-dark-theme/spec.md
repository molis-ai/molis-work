# Dependency Proposal Dark Theme Fix

> 归档（2026-10-01，合入后梳理）：判定为**已被取代**。src/web/render.ts 已删除。没有剩余事项。

## 背景与目标

Goal 详情中的“依赖提案记录”在深色主题下仍显示白色卡片。截图证据显示卡片背景与分隔线没有跟随主题，正文却已经使用深色主题的文字变量，形成白底浅字，内容几乎不可读。

根因是 `src/web/render.ts` 中依赖提案卡片仍硬编码 `#fff` 背景和 `#edf0f3` 分隔线，没有消费项目已有的 `--paper`、`--ink` 与 `--line` 语义色。

本修复让这块记录在浅色和深色主题下都使用同一套语义色，并保持现有信息结构、状态含义和交互不变。

## 范围

- 将依赖提案卡片的背景、文字与内部分隔线改为现有主题变量。
- 增加 Web CSS 回归断言，防止这块组件重新写回固定浅色值。
- 在深色桌面页面中验证背景、正文、状态色和证据引用的可读性。

## 非目标

- 不调整依赖提案的数据、权限或确认流程。
- 不重做卡片布局、间距、文案或状态色体系。
- 不借此清理其他组件仍存在的固定颜色。

## 文件边界

- `src/web/render.ts`：依赖提案卡片的主题语义色。
- `tests/visual-foundation.test.ts`：CSS 回归断言。

## 验收标准

- 深色主题下依赖提案记录不再出现白色卡片，背景与 Goal 文档的暗色表面一致。
- 标题、正文、辅助文字、分隔线、依赖方向、证据引用和“已应用”等状态均清晰可读。
- 浅色主题保持现有白色纸面观感。
- Web 定向测试、类型检查和 diff 检查通过。

## 验证

```bash
pnpm exec tsc --noEmit -p tsconfig.json
node --import tsx --test --test-name-pattern="dependency proposal records" tests/visual-foundation.test.ts
git diff --check
```

另在实际深色桌面页面中检查一条同时包含“解除依赖”和“新增依赖”的历史记录。

## 假设与开放问题

- 项目现有 `--paper`、`--ink`、`--muted`、`--line`、`--blue-dark`、`--green` 与 `--red` 已分别为浅色和深色主题定义，不新增颜色原值。
- 当前无阻塞开放问题。
