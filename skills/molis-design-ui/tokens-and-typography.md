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

> **阶段说明**：当前 `HEAD` 实装皮肤为 `soft-workbench@1`（浅色现役桌面 `#eef3f7`、纸面 `#fcfdfe`、主动作 `#2d4f6c`、焦点 `#3c6e98`）与 `folio@1`；下表 4 套完整皮肤与亮底/暗色对比度升级按 [决定 60](../../specs/post-anticorruption-roadmap/reference/decisions.md#decision-60) 于 **`[91-0b 落定]`**。

| 皮肤 ID | 中文名 | 阶段 | 气质定位 | 关键特征 |
| --- | --- | --- | --- | --- |
| `soft-workbench@1`（**默认**） | **A · 净透云光** | 现役（`91-0b` 升级亮底） | 保留雾蓝血统、洗去灰闷 | `91-0b` 目标：晴朗亮底 + 纯白纸面 + 深海墨青主按钮 + 清澈钴蓝焦点；深色凝瓷纸面比桌面抬高 ≥ 7 阶 |
| `pure-studio@1` | **B · 极净原生** | `[91-0b 落定]` | Linear / macOS 高净度工具 | 零蓝底雾，纯中性白灰桌面 + 曜石墨主动作，色彩全部留给真实状态 |
| `warm-atelier@1` | **C · 温润纸案** | `[91-0b 落定]` | Craft / Claude 思考工作台 | 暖雾羊皮桌面 + 象牙纸面 + 墨松青主动作，长阅读最护眼 |
| `folio@1` | **Folio 书卷** | 现役（`91-0b` 补齐令牌） | 低饱和书页印刷感 | `91-0b` 补齐 `nav-raised`、`radius-*`、`r-tag`、`shadow*`、`status-interruption` 等全量令牌，不得缺键回落 |

### 色彩与对比度硬红线
- **深色 `--on-accent` 必须按浅底/深底实测对比度 ≥ 4.5:1**：严禁在深色高亮浅蓝/浅绿底上沿用 `#ffffff` 导致字迹失明。
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

- **单调递增圆角阶梯**（对齐 `packages/design-system/resources/ui-spec.json` 与 `DESIGN.md`；`soft-workbench.json` 现役别名 `--radius-control` / `--radius-item` 历史倒挂将于 `[91-0b 落定]` 统一修正，业务代码一律优先引用 `--r-*`）：
  - `--r-tag: 6px`（状态芯片、计数微标——**禁用 `999px` 球场胶囊**）
  - `--r-control: 8px`（按钮、输入框、分段控件项）
  - `--r-row: 10px`（列表项、导航行、内部柔和子块）
  - `--r-card: 12px`（设置卡片、独立小卡、菜单浮层）
  - `--r-sheet: 14px`（连续工作纸页、对话框内面）
  - `--r-composer: 15px`（输入胶囊与浮岛）
  - `--r-dialog: 16px`（对话框主体与边缘抽屉开口侧）
- **阴影只给抬起的东西**：普通内容面板不加投影；菜单/弹层用 `--lift-2`，对话框/卡叠/Toast 用 `--lift-3`；悬浮与按下均通过色调变化与轻按压表达，**严禁卡片 `:hover { transform: translateY(-2px) }` 廉价上浮**。

---

## 4. F1 Sans + 中文三字重排版体系

> **阶段说明**：当前 `HEAD` 默认走系统无衬线 `FONT_STACK`（`Inter Variable` 与 `Noto Sans SC` Regular 为离线回退，正文 `13px / 1.5`）；以下 F1 三字重与中英分语种字距升级按决定 60 于 **`[91-0b 落定]`**。

- **字体栈 `[91-0b 落定]`**：
  - UI Sans：`"Inter Variable", "Inter", "Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", sans-serif`（`Inter Variable` 置顶管拉丁字母与数字，`Noto Sans SC` 随包提供真 `400 / 500 / 600` 常用字 + 长尾分片，配合 `font-synthesis-weight: none` 杜绝伪粗体与字重塌陷）。
  - 等宽代码：`--font-mono`（`SF Mono`, `JetBrains Mono`, `Cascadia Code`, `ui-monospace`, monospace），统一经 `--type-code-weight` / `--type-code-size` / `--type-code-line-height` 消费。
- **分语种字距与中英自动微隙 `[91-0b 落定]`**：
  - 默认（中文及混排）：正文 `letter-spacing: 0`、标题 `-0.012em`～`-0.014em`（**严禁把 `-0.011em` / `-0.03em` 套在中文上**）。
  - 纯英文（`:lang(en)`）：正文 `-0.011em`、大标题 `-0.024em`。
  - 全站开启 `text-autospace: normal`（中英文与数字间自动留微隙，不在文案里硬敲多余空格）与 `font-feature-settings: "cv02", "cv03", "cv04", "cv11"`（提升 Inter 数字与字母辨识度）。
- **八档固定字阶与呼吸行高**（由 `DESIGN.md` 与 `tests/soft-workbench-refinement.test.ts` 锁死为 **`11 / 12 / 13 / 15 / 17 / 20 / 24 / 30px`**；严禁发明 `14px`、`18px`、`560` 字重等野生档位）：
  1. `30px / 600 / lh 1.25`：到达页 / 项目大标题
  2. `24px / 600 / lh 1.30`：设置页 / 独立文档标题
  3. `20px / 600 / lh 1.35`：工作面内容主标题（打开的条目/文档标题）
  4. `17px / 400 / lh 1.8–2.0`：长阅读正文（如笔记 / Shelf 书页正文）
  5. `15px / 600 / lh 1.45`：设置节标题 / 卡片分组头 / 弹窗提问（`15px / 400` 用于较宽松的阅读段落）
  6. `13px`：`500` 为控件标签、按钮文字、列表项名、导航选中行；`400` 为常规正文与输入值（当前 `HEAD` 行高 `1.5`，`91-0b` 起调整为 `1.58`）
  7. `12px / 400`（工具与视图切态 `500`）：说明文字、元数据、次要辅助信息（`--muted`）
  8. `11px / 500 / lh 1.35`：微型分组眉标、快捷键标、极紧凑计数
- **等宽数字**：所有时间、计数、百分比、金额、代码行号与进度比一律套 `.mw-num` 或 `font-variant-numeric: tabular-nums`，会跳变的数字加 `data-num-ghost` 锁宽防横跳。
