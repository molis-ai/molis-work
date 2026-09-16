# Linear 工作台默认密度

状态：待验收。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是这次默认密度变更的唯一需求书。它补在 v12 专业信息密度之上：v12 只收了多余空档，默认仍按偏松的消费级节奏排；本次把桌面默认收到 Linear 工具级密度。

## 背景与目标

用户对照 Linear 判断当前页面信息密度过低，产品看起来不像专业工作台。v12 仍保留：目录头 96px、侧栏 280px、插件/Goal 行 36px、Feed 主列表 88px、标签栏 44px、控件 32px、阅读标题 18–22px。这些是空、松、low 的来源。

目标：桌面默认就是 Linear 这一档。不另做“紧凑模式”才像样。窄屏/触控继续 44px。

## 当前行为与问题证据

- 目录头两行：搜索/拖动 44px + 项目名 52px = 96px。Linear 工作区名、搜索在同一条约 36px 行。
- 目录 Goal/Session 36px，插件入口 36px；Linear 侧栏约 28px。
- Feed 主列表 `min-height: 88px`，还有 14px 标题和两行摘要。Linear issue 行约 32–40px，关闭态不铺摘要。
- 标签条 44px、标签 34×172。Linear 页头/筛选条约 32px。
- Frame 标题 20px、Inbox/Artifact 20–22px、Goal 记录 21–22px。工具页标题应 14–16px。
- 共享控件 32px；Linear 约 28px。
- 项目首页诗意留白是有意的情绪页，不是这次要收的对象。

## 范围与非目标

### 范围

桌面细指针（>760px 且非 coarse）默认：

| 元素 | 现在 | 目标 |
|---|---|---|
| 目录头 | 96px 两行 | 单行 36px：收起、项目名、拖动区、搜索、项目设置 |
| 默认侧栏 | 280px；≤1050px 256px | 240px；≤1050px 220px |
| 插件入口 / Goal / Session 单行 | 36px | 28px，13px 标题不换行 |
| Inbox / 来源等两行 | 44px | 36px |
| 标签条 / 标签 | 44 / 34 | 32 / 26；等宽和固定图标规则不变 |
| 共享控件 | 32px | 28px |
| Feed 关闭行 | 88px + 两行摘要 | 40px；来源+标题；摘要只在展开后出现 |
| Feed 工具条 | 52px | 32px |
| Frame / Inbox / Artifact / Session / 设置页标题 | 18–22px | 14–16px |
| 设置行 / 导航项 | 14px 内边距、36px 导航 | 8px 内边距、28px 导航 |
| UI 行高 | 1.55 | 1.35；长正文仍可读 |

窄屏 ≤760px 或 coarse pointer：触控目标 44px、移动输入 16px 保留。首页诗意构图、画布节点坐标/卡片尺寸、终端字体、领域契约不改。

密度仍是默认布局，不为这次再加开关。现有设置里的标准/紧凑只继续服务旧 Goal 导航，不作为工作台主密度。

### 非目标

- 不改 Goal / Feed / Session / Inbox 领域行为、持久化、焦点/失败恢复。
- 不重做首页诗意页、插件市场信息架构、分屏合同。
- 不把字收到 11px 以下；中文标题不低于 13px。
- 不把空状态强行填满；空页可以有呼吸，chrome 和有内容的列表必须密。

## 使用场景

1. 1440 打开项目：侧栏约 240px；目录头一行；Goals 树一眼比现在多约三成行。
2. 打开 Feed：关闭行是来源和标题，不是卡片摘要墙；点开才读正文。
3. 打开 Goal Frame：标题和动作是工具条，不是营销页头。
4. 项目/全局设置：标题和行距跟 Linear Preferences 同类，不是大留白文档。
5. 390 或触控：按钮/标签仍 ≥44px。

## 方案与关键决策

1. **默认就是这一档。** 不靠用户去开紧凑。
2. **先收结构，再收字。** chrome 高度、行高、padding 优先；标题从 20px+ 收到 14–16px；列表标题保持 13px。
3. **列表像表，不像卡片。** Feed 关闭态单列事实；展开后才是阅读。
4. **用工作台末尾密度层覆盖共享控件。** Coss `--control-h` 在桌面 immersive/settings 收到 28px；窄屏/coarse 仍按现有 44px 作用域。
5. **目录头合并一行，不删入口。** 收起、项目切换、搜索、项目设置都还在；原生窗口红绿灯仍用左侧安全距。

## 文件边界

- `apps/workbench/src/styles/linear-density.ts`（新建，stylesheet 末尾）
- `apps/workbench/src/styles/immersive-navigation.ts`、`immersive-directory.ts`、`tab-workspace.ts`、`goal-canvas.ts`、`detail-reading.ts`、`project-settings-page.ts`、`surface-language.ts`
- `apps/workbench/src/settings-navigation.ts`、`scripts/client/events-primary.ts`、`scripts/client/documents-state.ts`、`goals-page-renderer.ts`、`renderer.ts`
- `packages/design-system/src/styles/coss-controls.ts`（仅桌面 immersive/settings 的 `--control-h`）
- `plugins/native/goals/src/event-document-styles.ts`（记录页标题/时间线行）
- `DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md`、`specs/product-interaction-redesign/spec.md` v15 记录
- 测试：`tests/immersive-directory.e2e.test.ts`、stylesheet 契约

## 验收

1. 1440 浅色/深色：目录头单行 ≤36px；Goal/Session 行 28px；插件入口 28px；Feed 关闭行 ≤40px 且摘要未展开时不占行。
2. 双击分隔条：宽屏恢复 240px，≤1050px 恢复 220px。
3. 390 与 coarse：Frame 选择器、Home 新动作、标签关闭/分屏仍 ≥44px。
4. 首页日期/引语/月历构图不变。
5. 定向测试通过；工作台构建通过。

## 验证

```
pnpm --filter @molis-ai/molis-work-design-system --filter @molis-ai/molis-work-plugin-goals --filter @molis-ai/molis-work-app-workbench build
pnpm build:pty-client
node --import tsx --test --test-concurrency=1 \
  tests/chrome-inner-scroll.test.ts \
  tests/desktop-tui.test.ts \
  tests/immersive-directory.e2e.test.ts \
  tests/attention-journey.e2e.test.ts
```

Chrome e2e 需要非沙箱。隔离试用必须临时 `--home`。

## 假设

- Linear 是密度和专业感参照，不是像素临摹；不引入 Linear 品牌色或组件。
- 已保存的目录宽度继续有效；只改无保存值时的默认。
