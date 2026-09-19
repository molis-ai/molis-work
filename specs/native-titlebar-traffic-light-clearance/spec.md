# 桌面红绿灯不要被标题栏盖住

状态：已核验。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

## 背景目标

macOS Overlay 窗口的关闭 / 最小化 / 缩放在标题栏左上。Web 标题栏可以把这块让出来，但不能把整条栏（含这块空位）抬到红绿灯上面。

## 当前行为与问题证据

`?desktop=1` 下 `.immersive-titlebar` 的 `padding-left` 是 88px，「上一步」大约在 `left: 90`。标题栏盒子仍从 `x: 0` 铺满，`z-index: 41`（项目菜单层叠），`data-tauri-drag-region="deep"` 把这块 padding 也收成拖动区。CDP：标题栏 `left: 0`，`paddingLeft: 88px`，`zIndex: 41`。用户点选「上一步」，指出关闭 / 最小化 / 最大化又被置顶挡住。

## 范围与非目标

做：原生桌面标题栏的**布局盒**从红绿灯安全距之后开始；普通网页不加这条空位；全屏仍用现有 `--desktop-window-safe-inline-start: 2px`。

不做：不改红绿灯坐标、不改网页无 `data-native-desktop` 的贴左边距、不改项目菜单盖住舞台、不改标签与 ← → 的层叠。

## 使用场景

1. 普通桌面窗口：红黄绿可点，不被标题栏背景或 ← → 挡住；「上一步」在灯右侧。
2. 全屏：安全距收成 2px，← → 回到左边。
3. 普通浏览器：← → 仍贴左，不空出 88px。

## 方案与关键决策

用 `margin-inline-start` 代替 `padding-left` 做红绿灯让位，让标题栏元素本身不覆盖 0–88px。`html[data-native-desktop]` 和 `body[data-native-desktop]` 都生效（bootstrap 写在 `html` 上）。标题栏继续 `z-index: 41`，只作用于让位之后的盒子。

## 输入输出与依赖

输入：现有 `data-native-desktop` 与 `--desktop-window-safe-inline-start`。输出：标题栏 `getBoundingClientRect().left` 等于安全距；红绿灯位置 `elementFromPoint` 打不中标题栏或历史按钮。

## 文件 / 模块边界

允许：`apps/workbench/src/styles/immersive-navigation.ts`、`linear-density.ts`、对应测试、`DESIGN.md` 一句。禁止：改 Tauri `trafficLightPosition`、改项目岛菜单层叠合同。

## 验收标准

1. `data-native-desktop`：`.immersive-titlebar` 左缘 ≥ 安全距（默认 88px），「上一步」左缘 ≥ 标题栏左缘。
2. 红绿灯配置点附近（约 22,16）`elementFromPoint` 不是 `.immersive-titlebar` / `.workspace-history-button`。
3. 无 `data-native-desktop`：标题栏左缘仍约 0，「上一步」仍贴左。
4. 打开项目菜单仍盖住无目录 Feed 的「添加任务」。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/chrome-inner-scroll.test.ts \
  tests/chrome-inner-scroll.e2e.test.ts
```

## 假设与开放问题

4174 吃模块缓存，改 CSS 后要 rebuild 才看得到。真实 App 红绿灯是否在 webview 之上，本切片用命中测试证明 Web 层不再盖住该区域。

## 验收对照

| # | 标准 | 结果 | 证据 |
|---|------|------|------|
| 1 | native 标题栏左缘 ≥ 88px，「上一步」在其右侧 | 通过 | CDP：titlebar.left 88，back.left 90；margin-left 88px |
| 2 | (22,16) 打不中标题栏 / 历史按钮 | 通过 | `elementFromPoint` 命中 `.immersive-workspace`；covered false |
| 3 | 去掉 native 后标题栏贴左 | 通过 | e2e `webTitlebarLeft <= 2` |
| 4 | 项目菜单仍盖住「添加任务」 | 通过 | `tests/chrome-inner-scroll.e2e.test.ts` |
