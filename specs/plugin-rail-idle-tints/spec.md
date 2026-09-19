# 插件栏闲置图标用身份色

状态：已实现。完成等级 **3：功能可用**。不改用户库、不提交。

## 背景目标

左栏插件入口现在只有当前项带着身份色，其余图标都是同一档淡灰，扫过去分不清是哪个插件。一骏给了参考：闲置图标也要各自有色，当前项继续用抬起底把「我在哪」说清楚。

## 当前行为与问题证据

- `interaction-texture.ts` 把 `.plugin-rail .immersive-plugin-link svg` 设成 `var(--faint)`，只有 `[aria-current]` 才用 `--plugin-tint`。
- `immersive-navigation.ts` 还把 hover / 当前图标涂成 `--ink`，和身份色抢。
- 插件色表已经有：Home 灰、Goals 蓝、Feed 棕、Sessions 紫、Inbox 薄荷、Artifacts 粉、Shelf 雾蓝、Settings 钢灰。标签图标已经在用。

## 范围与非目标

做：

- 工作插件闲置图标用该插件的 `--plugin-tint`（色相 text 档）。
- hover 仍停在身份色上，可加一层很淡的同色洗底；当前项继续用现有洗底 + 身份色。
- 没有身份色的入口（插件市场 `+`）保持淡灰。
- 不改色相表：Goals 仍是蓝，不按参考图改成紫。

不做：不改插件启用、点按、市场锚点、目录行配色、标签色。

## 使用场景

1. 在首页：Home 有当前洗底，Goals / Feed / Sessions / Inbox 等闲置图标各是自己的色。
2. 切到 Goals：Goals 洗底加强，Home 回到灰色图标，其它插件色不变。
3. hover 某闲置插件：图标仍是该插件色，不是变成墨色。
4. 市场 `+` 仍是淡灰，不冒充工作插件。

## 方案与关键决策

身份色已经在 `--plugin-*` / `--plugin-tint`。把闲置轨图标从 `--faint` 改成 `var(--plugin-tint, var(--faint))`。导航结构层不再给轨图标写 `--ink`。hover 洗底用身份色约 8%，弱于当前项 12%，避免和选中抢。

## 输入输出与依赖

输入：既有 `data-plugin-id` 与 `renderPluginTintBindings()`。输出：轨图标颜色。无新 DOM。

## 文件 / 模块边界

允许改：`packages/design-system/src/styles/interaction-texture.ts`、`apps/workbench/src/styles/immersive-navigation.ts`、`DESIGN.md`、相关测试、本 spec。

## 验收标准

1. 闲置工作插件轨图标 `color` 是 `var(--plugin-tint, var(--faint))`，不是单独的 `--faint`。
2. 当前插件仍有洗底，图标仍是 `--plugin-tint`。
3. hover 不把工作插件图标改成 `--ink` / `--ink-soft`。
4. 市场入口没有 `--plugin-tint` 时仍走 `--faint`。
5. 色相表不变：`--plugin-goals: var(--hue-blue)`。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-design-system --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/primitives.test.ts \
  tests/chrome-inner-scroll.test.ts \
  tests/immersive-workbench.e2e.test.ts
```

## 验收结果

- 通过：`pnpm --filter @molis-ai/molis-work-design-system --filter @molis-ai/molis-work-app-workbench build`
- 通过：`tests/primitives.test.ts`、`tests/chrome-inner-scroll.test.ts`
- 通过：`tests/immersive-workbench.e2e.test.ts` 前两条（首页轨多色、用户项目闲置 Goals ≠ 市场淡灰）。第三条「刷新保 Goal 工作区」在 `/goals/:id` 展开超时，与本切片无关，未改该路径。
- 通过：4174 深色首页实屏，闲置 Goals 蓝 / Sessions 紫 / Inbox 薄荷 / Feed 棕 / Shelf 雾蓝 / Artifacts 粉，Home 当前洗底，市场 `+` 仍淡灰。色相表未改。

## 假设与开放问题

- 参考图里的色相（Goals 偏紫）只作「闲置也要有色」的处理，不改产品色表。
