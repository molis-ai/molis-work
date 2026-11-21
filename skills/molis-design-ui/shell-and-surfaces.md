# 外壳结构、独立表面与桌面原生约束

Molis Work 只有一套空间外壳。插件、模块与设置页只往既定挂载位提供内容，不自建顶栏、第二套全局侧栏或第二个对话入口（极少数整页特例仅限于 `specs/shell-page-exceptions/spec.md`）。

---

## 1. 主工作台骨架（顶部方案 C + 连续纸页 + 底栏第十三版）

1. **顶部栏（44px 方案 C「纸上的页签」）**：
   - 左上角唯一一格 `项目 › 事项`（默认显示 `项目名 › 项目主页`；有等你决定的事项时仅在格内挂琥珀计数，无常驻留用插件、无 `⌥1..9`）。
   - 中间为页签条：当前激活页签长在下方纸面上，顶部 `2px` `--accent` 细冠；右侧紧跟 `＋` 起始页按钮打开插件/新建入口。
   - 右端只留两键：**侧边栏开关** 与 **分屏**。
   - 桌面端左侧预留 `var(--desktop-window-safe-inline-start, 88px)` 给 macOS 红绿灯，全屏态自动回缩为 `0`（**严禁硬编码 `84px` 等死像素**）。
2. **主工作区与 12 视图右侧栏**：
   - 二叉树分屏纸页，每个窗格容器 `.tab-pane-body` / `.tab-workspace-exclusive` 声明 `container: plugin-stage / inline-size`。
   - 12 个右侧栏视图（7 内置：`项目资料 / 浏览器 / 电脑 / 讨论 IM / 停靠对话 / 后台任务 / 按需帮助` + 5 插件：`Shelf / 灵光 / Issue / Pages 评论 / 风险`），打开/收起与宽度归宿主控制，插件通过 `molis:side-open` 请求切入。
   - 左下侧逐项验收栏（`320px`）由平台按需呼出；情境浮条 `mw-ctx` 与全局搜索 `⌘K` 为唯二浮动工具入口。
3. **底栏第十三版（三块等高 `74px` 浮岛，间距统一）**：
   - **左 · 账户条**：头像（同步状态是头像右下角一个点）+ 名字 + 三圆键（**通知**、**插件 → 直达插件市场**、**设置**）；通知弹层锚定在左下角通知键上方，不从屏幕正中弹出。
   - **中 · 统一输入框**：固定在窗口正中（宽度按窗口档位锁定），回车发送；收起对话时右上角显示 `办完 / 在办 / 接下来` 三个计数键与展开键；展开后向上生长为「与输入框同宽的对话栏 + 位于卡叠上方的右侧信息栏」（无旧标签栏、无 `.work-reply-peek`）。
   - **右 · 「该你」卡叠**：展示待你决定的卡片（主动作墨青实底、次动作轻按），底部写明「别的事项还有 N 件」。
   - **窄屏与触控**：`(max-width: 600px), (pointer: coarse)` 下所有可点目标 ≥ `44px`，输入框 `16px / 22px` 防 iOS 缩放；`< 480px` 输入框场景控件自动收进「更多」。

---

## 2. 独立表面与文档壳完整性清单（漏一项即算缺陷）

凡独立产出 HTML 文档的表面，**上线前必须逐项核对以下 5 条**：

| 表面 | 必须挂载的 Head 与样式 | 必须挂载的客户端脚本 | 常见踩坑 |
| --- | --- | --- | --- |
| **主工作台 / 设置覆盖层** | `appearanceHead()` + 同步 `<head>` `THEME_BOOTSTRAP_SCRIPT` + 完整工作台/设置样式（含 `INTERACTION_OPTION_STYLES`） | 全套共享脚本 | 禁止同一份样式表在 `page-assets.ts` 重复拼装两遍 |
| **独立设置页 `/settings/*`** | `appearanceHead()` + 同步主题引导 + 含 `PLUGIN_TRUST_SETTINGS_STYLES` & `KNOWLEDGE_PICKER_STYLES` | 同覆盖层 | 顶部红绿灯安全区读 `--desktop-window-safe-inline-start`，不写死 `84px` |
| **插件舞台框 `plugin-frame` / `plugin-document-shell`** | `appearanceHead()` + 同步主题引导 + 插件基础样式（与 `102-1` `<80 KB` `molis-work-plugin-base.css` 同步） | `MICRO_INTERACTION`、`CRAFT_FINISH`、`REFLOW`、`COPY_FEEDBACK`、`STATE_RING`、`SELECT_MENU`、`MEDIA_ZOOM`、`DROP_ZONE`、`OVERFLOW_FADE`、`FIELD_FIT`、`FLOATING_DETAILS`、`TIP`、`SCROLL_FOLLOW`、`SHOW_MORE`、`STREAM_TEXT` | 漏 `appearanceHead()` 会让 Folio 皮肤与字体全部失效 |
| **侧栏视图 `side-view-document` & Home 插件 `home-plugin-page`** | `appearanceHead()` + 同步主题引导 + `--r-sheet` 纸面圆角 | 补齐 `SELECT_MENU`、`STATE_RING`、`CRAFT_FINISH`、`REFLOW`、`COPY_FEEDBACK`、`SCROLL_FOLLOW` | 不能因为脚本缺失导致侧栏下拉菜单或状态环失灵 |
| **IM 讨论 `packages/im-ui`** | `appearanceHead()` + `renderSkinScope` + `renderShapeTokens` + `renderControlMetrics` + `CRAFT_FINISH_STYLES` + `THEME_BOOTSTRAP_SCRIPT` 放 `<head>`（禁止 `defer` 引起白屏闪） | `MICRO_INTERACTION`、`CRAFT_FINISH`、`REFLOW`、`COPY_FEEDBACK`、`STATE_RING`、`SCROLL_FOLLOW`、`FIELD_FIT` | 仅调 `renderShellTokens()` 会导致 `--r-tag`/`--control-h`/`--dur-*` 全部未定义 |
| **到达 / 选择 / 升级 / 账号入口** | 全部页面（含 `upgrade-opening`、`renderPersonalAccountEntry`）必挂 `appearanceHead()`；桌面态补 `data-native-desktop` | 按需引导与微交互 | `upgrade-opening` 缺 `data-native-desktop` 会让 macOS 红绿灯压住标题 |
| **组件板子 iframe（`/bar` `/navigation` `/conditions` `/assistant`）** | 必挂 `appearanceHead()` | 对应样本脚本 | 漏挂会导致切皮肤/切字体时子框纹丝不动 |
| **桌面占位页与独立导出 HTML**（`webview-placeholder`、`fillpage`、`continuity`、Markdown/Document 导出） | 使用语义变量与当前视觉基线，禁用旧 Linear `#5e6ad2` 紫色 | 无额外运行时依赖 | **`apps/desktop/webview-placeholder/` 严守无 `'unsafe-inline'` 静态 CSP（`102-2`），样式只能外链 `.css`，严禁内联 `<style>`** |

---

## 3. 到达与桌面壳体连续性规则
- 到达页与项目选择页使用同一套浅/深语义令牌与控件高度，绝不在进项目瞬间跳变字号、按钮高度或色彩温度。
- 桌面端点击「打开设置 / 模型设置」永远留在应用内覆盖层或应用内路由，**严禁调用外部浏览器链接把用户踢出桌面 App**（反例：`plugin-builder` 历史缺陷）。
- 桌面菜单栏胶囊（`capsule`）已随第 44 批删除，禁止在文档、样式或特例页中引用或复生。
