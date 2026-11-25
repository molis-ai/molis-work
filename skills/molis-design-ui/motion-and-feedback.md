# 动效语法「一变一动」与确定性反馈体系

动效不是装饰，反馈不是补丁。每一帧位移都必须回答「刚才发生了什么、现在谁在干活、下一步该谁点」，并随时可被用户打断。

---

## 1. 动效令牌、无刷新连续感与「一变一动」六大原语

### 统一时长与曲线（禁止任何非令牌数字与私造 JS `cubic-bezier`）
- 时长令牌：`--dur-press: 130ms`、`--dur-hover: 130ms`、`--dur-move: 250ms`、`--dur-arrive: 420ms`、`--dur-moment: 640ms`、`--dur-stagger: 60ms`、`--dur-reveal: 90ms`
- 曲线令牌：`--ease-quint`（`cubic-bezier(.22, 1, .36, 1)`，主位移与展开，利落刹停）、`--ease-spring`（`cubic-bezier(.2, 1.35, .4, 1)`，轻回弹，只用于宽高都不超过 32px 的小东西：小图标键的按压、勾选落定、开关滑块；按钮、选项卡片、分段滑块这些更大的用 quint，POLISH-35）、`--ease-reveal`（流式浸润）
- **无页面刷新感四铁律**：
  1. **持久化 DOM + FLIP**：切换筛选/视图/增删条目调用 `window.molisListTransition` / `window.molisReflow`（自带容器高度呼吸），绝不整块 `innerHTML` 闪烁重建。
  2. **平滑展开**：折叠明细使用 `<details class="mw-collapsible">` 的 `::details-content` 自然高度过渡（`0fr → 1fr` 仅限白名单折叠原语）；`.mw-inset-row__drawer` 使用纯合成层 `craft-rise` 轻浮展开，避免触发布局属性动画门禁。
  3. **仅合成层动画**：只动 `transform`、`opacity`、`filter`（仅流式末梢微焦）；位距 `≤ 16px`；**退场总比进场快 30–40%**；在 `prefers-reduced-motion: reduce`、`[data-craft-still]`、`navigator.webdriver` 下归零或单帧直达。
  4. **单次克制**：只在入场时使用 `.is-arriving`。首页时间线、市场、插件列表、助理起点与组件板入场样件用 `--dur-stagger` 错开前四项，第一项立即开始，第四项在 180ms 后开始。第五项起直接显示。

### 六大语法与唯一触发时机

| 语法 / API | 语义 | 正确用法 | 禁止滥用 |
| --- | --- | --- | --- |
| **`molisCraft.carry`** | 同一对象换位置 | 列表点开详情、切换事项进入左上角格、展开对话框标题承接 | 无关页面硬连 |
| **`molisCraft.turn`** | 前进 / 后退 / 翻页 | 设置切页、引导步骤切换、日历翻月、退回默认首页（沿方向滑 `16px`） | 同屏原地刷新 |
| **`molisCraft.land`** | 新条目落入列表 | 新消息、新成果、新安装插件落入列表时一次雾蓝柔光洗底淡出 | 首屏全量列表同时闪烁 |
| **`molisCraft.ask`** | 刚轮到你决定 | 审批/问题/高危确认新进入卡叠或侧栏时一圈琥珀柔和扩散**一次** | 无限循环呼吸闪烁、普通通知 |
| **`molisCraft.celebrate`** | 克制完成时刻 | 目标完成、工作流跑通、表单发布等里程碑轻放一次短粒 | 首屏加载、普通保存 |
| **`molisReflow` + 悬停让位** | 列表重排 / 行内操作滑出 | 删除/分拣平滑补位；移入列表行时标题平顺让位、操作键滑出（同时写 `:focus-within` 与 `@media (hover: none)` 常显） | 重排闪白；仅 `:hover` 藏起导致键盘/触控拿不到 |

---

## 2. 确定性行为反馈闭环（0ms → 250ms → 回执 / 回滚）

1. **按下即回应（0ms）**：所有 `.mw-btn` 具备 `scale(.985)` 轻按压（回来不冲过头）；底栏与 Coding 发送在非 IME 组合态 `<16ms` 乐观上屏（失败无损恢复草稿与修订号），并在统一输入框落齐 **WebKit / Tauri macOS `500ms` 合成后卫**（`isComposing || keyCode === 229` 之外，记录 `compositionend.timeStamp` 拦截尾随假回车与伴随 `beforeinput` 换行）。
2. **悬浮揭示「100ms 意图延迟 + 慢进快出」**：消息操作条（复制/重试等）悬停进场配独立 `transition-delay: 100ms` + `var(--dur-hover)`（过滤过路鼠标防闪烁），离开用 `var(--dur-stagger)`（`60ms`）零延迟快出（不留残影，严禁手写非令牌毫秒数），键盘 `:focus-visible` 零延迟、`@media (hover: none)` 常显，严守 `--ease-quint`（`POLISH-35`）；富交互胶囊 Hover 详情卡走 `600ms` 首次 / `0ms` 热切 / `200ms` 移入桥接 / 点击升级 `pinned` `role="dialog"` + `fixed` body portal 首帧隐藏守卫。
3. **`250ms` 静默阈值与 `window.molisBusy(btn, work, opts?)`**：
   - 任何耗时 `< 250ms` 的请求**不闪骨架、不闪转圈**；超过 `250ms` 才淡入 `.mw-spinner` 并设 `data-loading` + `aria-busy="true"` + 防连点锁，有图标时原位等宽替换不抖动，弹窗内自动拦截 `Esc` 并在 `finally` 释放。
   - **禁止**手写 `button.disabled = true` 灰死僵住、**禁止**整页 `workspace.inert = true` 无声冻屏、**禁止**绕开 `250ms` 立刻渲染 `.mw-loading`。
4. **唯一宿主 Toast（`host.showToast` / `window.molisToast(message, options?)`）**：
   - 全产品只走这一条队列，底距统一 `calc(var(--helm-h, 74px) + 14px)` 避让底栏与控件，每次触发清前序定时器。
   - 三档规范时长：`short: 2600ms`（纯确认，`role="status"`）；`normal: 4200ms`（警告/信息）；`long: 7000ms`（带 `undo` / `action` 按钮或错误提示，鼠标悬停或键盘焦点自动暂停倒计时，离开后平滑续跑，用于高频可逆操作替代多余阻塞确认框）。
5. **统一五态自动保存（`window.molisAutosave(el, save, opts?)`）**：
   - `idle`（静默隐退，常态不刷绿也不占位）→ `dirty`（中性灰「未保存」）→ `saving`（超 `250ms` 显微环「保存中…」）→ `saved`（轻亮后 `2.2s` 淡隐）→ `error`（红字常驻 + 保留草稿 + `retry()`）。
6. **乐观开关回滚（`window.molisOptimisticToggle(control, work, opts?)`）**：切换立即生效，请求失败自动弹回原值、恢复交互并经 `molisToast` 报错。
7. **危险确认、空态与报错文案范式（温和友好、克制不聒噪）**：
   - 不可逆操作统一走 `host.confirm({ title, body, confirmLabel, cancelLabel, tone: "danger" })`（左取消、右红底具体动词）；标题直接写动作与对象（如 `退出 Molis Work？`，不用 `确定要…吗`），正文两句内平实交代不可逆影响与保留项。
   - 报错、中断与空态统一按 **「现状 → 安心/影响 → 出口」** 写温和白话（用「你」，禁用 `此/该/予以/尚未/暂无/如需/未能完成操作`），报错明确说明「已有内容都保留着」；Host HTTP/SSE/WS 与 Prologue 出口统一按当前语言转译为 `common.error.*`，前端绝不裸露 `MODEL_HTTP_ERROR`、`SYNC_*`、AJV 字段路径或异语言报错，排错技术细节只留给可复制的「诊断编号（`call_id`）」与「设置 › 诊断」。日期/时间输入走 `window.molisEnhanceDateInputs()` 统一样式、可清除按钮与 `Escape` 行为，并按活跃语言格式化 `aria-label`（不写死中文默认值）。

---

## 3. AI 协作四态与流式丝滑底线

| AI 时刻 | 唯一视觉与交互表达 | 严禁 |
| --- | --- | --- |
| **1. 正在干活** | 恒定 `20px` 状态环（`.mw-state-ring--fixed`）原地切换 `[data-mw-state]`（不销毁 DOM、不归零相位），旁侧状态短语配零高 `flex: 1` 稳位座防右侧耗时横跳；`molisStreamText` v2 仅对**当前变更节点**执行 `finishDirect()`，不打断前段正在完成的光影浸润波浪 `.mw-fresh`（`blur(2px)` 90ms 快速渐显，收尾时立即收齐）；代码块原地生长；思考流独立轻量折行（用户点开或 `⌘F` `beforematch` 展开后标 `data-user-toggled` 不自动合上，守 `VUX-13`）；嵌套步骤用 `:not(:where([data-mw-step] *))` 隔离悬停/聚焦；`molisFollow` 真人交互走柔和微阻尼追底、用户滚轮/触控首帧让权（减动效与自动化单帧直达） | `500ms` 轮询顿挫；掐断前段在途淡入导致闪字；把 20px 状态环硬换成 13px 图标造成 7px 横跳；劫持用户向上滚动；对大容器挂 `:has()` 做嵌套悬停；循环文字扫光（违 `only loading indicators loop` 门禁） |
| **2. 等你拍板** | 统一进入右下角「该你」卡叠（并关联信息栏与原位上下文）；唯一琥珀色 + 一次 `molisCraft.ask`；卡片写清影响与具体动词按钮 | 在 4 处同时画 4 种不同长相的审批弹窗；二次确认套娃 |
| **3. 结果不确定** | 琥珀提示「结果暂不确定 · 请先核对」+ 跳转核对记录入口（对齐 Prologue `reconcile-required / unknown` 合同） | 假装成功，或提供「再点一次」自动盲重放外部副作用 |
| **4. 失败 / 阻断** | 红色明确白话原因 + **原样保留草稿、输入与已附材料** + 下一步动作（缺模型走 `host.returns.go`、普通错误原位重试、可复制诊断号） | 静默关闭弹窗/吞错；把 `401`/`MODEL_CONTEXT_OVERFLOW` 等裸错误码甩给普通用户 |
