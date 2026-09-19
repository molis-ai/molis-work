# 项目选择初始页到达面

状态：已验收。完成等级 3（功能可用）。Impeccable polish：修真实缺陷，保留 Calm Desktop，不换视觉世界。

## 背景目标

「选择一个项目」是进工作台前的到达面。当前页套了工作台 `data-desktop-shell` 样式，顶栏被藏、被挤到右上角，卡片箭头朝后，四列网格留下空列。用户无法把这一页当正常选择页用。

## 当前行为与问题证据

浏览器 1920×1080 实测（`http://127.0.0.1:4173/`）：

- `body` 被工作台 `grid-column: 2` 撑成两列（约 1377 + 543），主列只高 452px，下面一整行空白。
- `.brand` `display: none`；设置按钮孤岛在右上角白底条里。
- `arrow` 是 ArrowRight，再 `rotate(180deg)`，卡片上显示为 ←。
- 卡片强制 4 列，3 个项目留下空槽；副标题全是「Goals 与 Sessions」。
- 搜索 haystack 只有英文 `data_class`，中文「演示数据」搜不到。
- 迁移表单 `L("迁移后项目名 ")` 带尾随空格，对不上文案表。

## 范围与非目标

做：项目选择页的布局隔离、顶栏、卡片、搜索、迁移对话框、空态、动效与主题对比。

不做：重做工作台目录、Onboarding、项目设置业务、Runtime 绑定语义、换视觉世界。

## 方案

- 项目选择页样式放在 visual foundation 之后，用更高或同级后写规则盖住泄漏的工作台顶栏。
- 单列：顶栏全宽（品牌 + 系统设置），主区占满剩余高度；标题和搜索钉住，只有卡片区滚。
- 卡片 `auto-fit`，箭头向右，类型文案可扫可读；搜索包含本地化类型。
- 动效只服务悬停/焦点/对话框，尊重 `prefers-reduced-motion`。

## 验收

1. 宽屏下顶栏全宽，品牌「Molis Work」与系统设置同时可见，不出现右上角孤岛。
2. 主区占满顶栏以下视口；滚动只发生在 `.project-index-body`。
3. 3 个项目不再留下第四空列；「打开项目」箭头向右。
4. 用「演示」能搜到演示项目；迁移对话框可键盘、点遮罩关闭。
5. Light / Dark、宽屏与 390 窄屏可用；`prefers-reduced-motion` 下无位移。

## 验证

```bash
pnpm exec tsx --test --test-concurrency=1 \
  tests/project-index-arrival.test.ts \
  tests/chrome-inner-scroll.test.ts \
  tests/visual-foundation.test.ts \
  tests/i18n.test.ts
```

浏览器走：进入页、搜索、打开迁移、取消、窄屏、Dark。

验收对照（2026-09-15，`http://127.0.0.1:4180/`）：

1. 通过：顶栏 1920 全宽，品牌与系统设置同时可见。
2. 通过：主区 1028px 填满顶栏以下；卡片区 `overflow: auto`。
3. 通过：3 卡 `312px × 3`，无第四空列；箭头 `transform: none`。
4. 通过：「演示」只留下示例项目；Escape 清空；对话框可点遮罩关闭。
5. 通过：Light / Dark token 切换；390 顶栏保留「系统设置」文案，搜索与创建纵向铺满。选择块左右居中、垂直贴顶，见 `specs/project-index-center/spec.md`。
