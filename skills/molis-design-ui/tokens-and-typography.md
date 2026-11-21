# 令牌、4 套内置皮肤与 Sans + 中文排版

所有视觉值唯一真相在 `packages/design-system/resources/`（`skins/*.json`、`fonts/*.json`、`registry.json`）。业务与壳层代码只消费语义 CSS 变量，不写字面颜色、字号或字体栈。

---

## 1. 四平面空间模型（不可破坏的明度阶梯）

| 平面 | 语义变量 | 职责 | 铁律 |
| --- | --- | --- | --- |
| **桌面（Desk）** | `--page` / `--nav-bg` | 窗口底板、顶栏底板、底栏托底 | 与纸面拉出清晰层次，不喧宾夺主 |
| **工作纸面（Paper）** | `--paper` / `--canvas` | 主舞台、表单卡片、当前页签延展面 | 全屏视觉重心；浅色干净通透，深色比桌面抬高 ≥ 7 个明度阶 |
| **轻软面（Soft）** | `--surface-soft` | 主从左栏、设置左轨、代码块底、内嵌提示块（如 `.mw-facts`/`.mw-help-tip`） | **注意：`--surface` 在默认皮肤下等同 `--paper`**，需要柔底区分时必须写 `--surface-soft` |
| **浮层（Popover）** | `--popover` + `--lift-2` / `--lift-3` | 菜单、弹层、对话框、Toast、卡叠 | 用微高光环 + 柔和多层投影建浮感，**不额外画粗描边** |

---

## 2. 4 套官方内置皮肤（默认 A，全部走同一套语义变量）

按决定 60（`91-0b` 已落地），产品提供 4 套官方皮肤（在「设置 › 界面与语言」实时切换，4 套皮肤 × 明暗 2 模 × 8 字色 × 4 平面 = **256 对组合全部通过 WCAG AA ≥ 4.5:1**）：

| 皮肤 ID | 中文名 | 气质定位 | 已落地核心色值（浅 / 深） |
| --- | --- | --- | --- |
| `soft-workbench@1`（**默认**） | **A · 净透云光** | 阳光净透雾蓝浅底 + 静谧瓷青深底 | 浅色桌面 `#f5f7fa` + 纯白纸面 `#ffffff` + 轻软面 `#f8fafc` + 墨青主按钮 `#1f3c56` + 雾蓝焦点 `#316896`；深色桌面 `#0f1318` + 纸面 `#192029` + `--muted: #95a5b5` / `--faint: #8797a6` + 主按钮 `#e4edf6`（`--action-ink: #101924`）+ `--on-accent: #0d1620` |
| `pure-studio@1` | **B · 极净原生** | Linear / macOS 高净度工具 | 浅色桌面 `#f7f7f8` + 纯白纸面 `#ffffff` + 曜石墨主动作 `#191a1e` + 钴蓝焦点 `#3358d4`；深色桌面 `#0f1012` + 纸面 `#1a1b20` + 顶部 `1px` 玻璃微高光 `--edge-highlight` |
| `warm-atelier@1` | **C · 温润纸案** | Craft / Claude 思考工作台 | 浅色暖纸桌面 `#f8f6f2` + 纯白纸面 `#ffffff` + 墨松青主动作 `#20453f` + 静湖青焦点 `#286678`；深色暖炭桌面 `#141210` + 纸面 `#201d19`，长阅读最护眼 |
| `folio@1` | **Folio 书卷** | 低饱和杏纸常青印刷感 | 浅色杏纸桌面 `#f4ede2` + `#fffdf8` + 墨绿主动作 `#245b45` + 湖绿焦点 `#196967`；深色松烟桌面 `#171f1b` + 纸面 `#202a24`，已补齐全部基线与高光令牌 |

### 色彩、暗色高光与布局版心令牌
- **顶部 `1px` 玻璃微高光 `--edge-highlight`**：深色模式卡片、纸页、设置分组与浮层用 `inset 0 1px 0 var(--edge-highlight)` 建立清脆立面，不再依赖沉重黑影。
- **深色 `--on-accent` 必须实测对比度 ≥ 4.5:1**：严禁在深色高亮浅蓝/浅绿底上沿用 `#ffffff` 导致字迹失明。
- **7 个标准布局版心与对齐令牌（`foundation.ts`）**：`--measure-reading: 700px`、`--measure-form: 760px`、`--measure-stage: 960px`、`--measure-wide: 1152px`、`--master-w: 240px`、`--master-w-wide: 280px`、`--text-start: 44px`。
- **语义色阶永不串色**：
  - `--action` / `--action-ink`：唯一主动作按钮（一屏平面最多 1 个）。
  - `--accent` / `--accent-soft`：焦点环、链接、进行中状态、搜索命中。
  - `--amber` / `--amber-soft`：**唯一暖色，严格专供「轮到你」**（审批、待答问题、需决定项、冲突待裁）。
  - `--green` / `--green-soft`：已完成 / 刚通过（常态就绪退隐中性，不刷绿）。
  - `--red` / `--red-soft`：失败 / 不可逆危险操作。
  - `--hue-cyan` / `--hue-cyan-soft`：等待外部回复 / 挂起。
  - `--hue-*` 14 色仅用于标签条插件分组标识与对象温和色标，插件本身无品牌色。

---

## 3. 圆角与阴影阶梯（禁止倒挂与越阶）

- **单调递增圆角阶梯**（`resources/skins/*.json` 别名与主令牌必须严格一致，禁止 `radius-control` 与 `r-control` 数值倒挂）：
  - `--r-tag: 6px`（状态芯片、计数微标——**禁用 `999px` 球场胶囊**）
  - `--r-control` / `--radius-control: 8px`（按钮、输入框、分段控件项）
  - `--r-row` / `--radius-item: 10px`（列表项、导航行、内部柔和子块）
  - `--r-card: 12px`（设置卡片、独立小卡、菜单浮层）
  - `--r-sheet: 14px`（连续工作纸页、对话框主体）
  - `--r-bar: 16px`（底栏第十三版三块浮岛）
- **阴影只给抬起的东西**：普通内容面板不加投影；菜单/弹层用 `--lift-2`，对话框/卡叠/Toast 用 `--lift-3`；悬浮与按下均通过色调变化与轻按压表达，**严禁卡片 `:hover { transform: translateY(-2px) }` 廉价上浮**。

---

## 4. F1 Sans + 中文三字重排版体系

按决定 60，默认字体方案升级为 **F1（Inter Variable + 思源黑体 / Noto Sans SC 真 400 / 500 / 600 分片）**，解决中文负字距挤压与非 macOS 字重塌陷：

- **字体栈**：
  - UI Sans：`"Inter Variable", "Inter", "Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", sans-serif`（`Inter Variable` 置顶管拉丁字母与数字，`Noto Sans SC` 随包提供真 `400 / 500 / 600` 常用字 + 长尾分片，配合 `font-synthesis-weight: none` 杜绝伪粗体与字重塌陷）。
  - 等宽代码：`--font-mono`（`SF Mono`, `JetBrains Mono`, `Cascadia Code`, `ui-monospace`, monospace），统一经 `--type-code-weight` / `--type-code-size` / `--type-code-line-height` 消费。
- **分语种字距与中英自动微隙**：
  - 默认（中文及混排）：正文 `letter-spacing: 0`、标题 `-0.012em`～`-0.014em`（**严禁把 `-0.011em` / `-0.03em` 套在中文上**）。
  - 纯英文（`:lang(en)`）：正文 `-0.011em`、大标题 `-0.024em`。
  - 全站开启 `text-autospace: normal`（中英文与数字间自动留微隙，不在文案里硬敲多余空格）与 `font-feature-settings: "cv02", "cv03", "cv04", "cv11"`（提升 Inter 数字与字母辨识度）。
- **八档固定字阶与呼吸行高**（不发明 `14px`、`17px`、`560` 字重等野生档位）：
  1. `30px / 600 / lh 1.25`：到达页 / 项目大标题
  2. `24px / 600 / lh 1.30`：设置页 / 独立文档标题
  3. `20px / 600 / lh 1.35`：工作面内容主标题
  4. `15px / 600 / lh 1.45`：设置节标题 / 卡片分组头 / 弹窗提问
  5. `13px / 500 / lh 1.45`：控件标签、按钮文字、列表项名、导航选中行
  6. `13px / 400 / lh 1.58`：常规正文与输入值（长阅读与 AI 回复 `14.5–15px / lh 1.72`，限宽 `68–72ch`）
  7. `12px / 400 / lh 1.58`：说明文字、元数据、次要辅助信息（`--muted`）
  8. `11px / 500 / lh 1.35`：微型分组眉标、快捷键标、极紧凑计数
- **等宽数字**：所有时间、计数、百分比、金额、代码行号与进度比一律套 `.mw-num` 或 `font-variant-numeric: tabular-nums`，会跳变的数字加 `data-num-ghost` 锁宽防横跳。
