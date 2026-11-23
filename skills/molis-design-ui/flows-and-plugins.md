# 跨表面串联、插件布局选型与界面文案

单个页面再精致，如果页面之间断链、跳丢草稿、审批分裂或术语满屏黑话，用户依然会觉得割裂。所有跨模块串联只走平台公开合同。

---

## 1. 八大跨表面串联标准协议（不另造私路）

| 串联场景 | 唯一标准协议 | 关键细节与禁忌 |
| --- | --- | --- |
| **缺模型 / 缺连接去设置再回来** | `host.returns.go({ kind, ... }, { draft_key, step })` + `arrived()` + `renderResumePrompt` + 监听 `document` 的 `molis-work:model-ready` | 去设置前若在模态 `<dialog>` 内先关模态；重开模态前必须同时验 `root.getClientRects().length && getComputedStyle(root).visibility === 'visible'`；桌面端绝不跳系统浏览器 |
| **唤起右侧栏某视图** | `molis:side-open { tab, view }`（iframe 内用同名 `postMessage`）；随文档变化的侧栏声明 `context_binding: "focused-object"` 并带递增 `context_epoch` | 收起保持收起，切文档不抢走用户选中的普通工具 |
| **跨模块页内事件** | 登记在 `packages/contracts/src/platform/dom-events.ts` 的 `CustomEvent`（新增跑 `pnpm api:update`）；`molis-work:open-settings-section` 派发在 `document`（非 `window`） | 禁止私发未登记全局事件；外部会话「整理」等协作留在工作台内不整页硬跳丢分屏 |
| **让对象出现在首页、搜索、引用与速览** | 在 Manifest 声明 `manifest.presentation`（`row / card / peek / overview`）+ 搜索条目与对象读取器 | 速览拉取失败必须在弹窗内给错误与重试，严禁静默关闭 |
| **向统一输入框供源 / 挂载选区工具** | 动作声明 `composer_source`；编辑器选区发 `molis:context-tools` | 不自建第二个底部输入框或私绘选区浮条 |
| **AI 问人 / 操作卡 / 审批** | 问卷走 `ask-user` + `agentQuestionHtml`；建议步走 `suggest-action` + `agent.offers.run`；审批全部汇入统一 `AgentReview` 与右下角「该你」卡叠 | 严禁按翻译后的中文字段名过滤审批字段（如 `f.label === '应用'` / `"子任务角色"`），一律用结构化枚举键 |
| **对象转换 / 发送到别处** | 走 `horizontal/placement` 公开动作与统一 `host.showToast` | 不跨插件直接 import 内部模块或操作另一插件数据库表 |
| **实时运行流（SSE）** | 经平台受控 SSE 路由 + `molisWorkRequest(..., { as: "response", signal })` + `readEventStream` | 严禁裸 `fetch` 与无法带会话凭证头的裸 `new EventSource`；撤权/切号即时断流 |

---

## 2. 插件舞台布局选型与「列表—详情」标准方向（不要万物硬套同一套模子）

- **现役基线（`91-0c` 底座合入 `main` 前，当前写代码按此执行）**：
  - 主从列表 + 详情插件统一复用现役 `renderPluginStageShell`（`@molis-ai/molis-work-plugin-sdk/ui`）+ 两档左栏（`240 / 280px` `--surface-soft`）+ `@container plugin-stage` 三档断点，不另套外框；
  - **禁止继续扩大分裂**：新插件与改造页面**严禁再向全局 `workbench.directory` 返回非空面板**，严禁在外壳新增插件 ID 分流分支或 `[data-*-delete]` 样式硬编码，列表多选一律用标准 `aria-multiselectable="true"`。
- **目标架构（[决定 64](../../specs/post-anticorruption-roadmap/reference/decisions.md#decision-64)，随 `91-0c` 落地后按实装同步切换本节 API）**：
  - 全部带条目列表插件统一收归各自窗格（`workbench.main`/`workbench.side`）内的标准容器 **`.mw-stage-list-detail`**（`[data-stage-list-detail]`，避免与设置页既有 `.mw-list-detail` 冲突），经 Manifest 可选声明 `ui.views[].stage_layout` 区分默认 `detail_mode: "focus"`（承接 `36A-3` 一件事一页，舒展档 `≥960px` 母页提供轻量「展开列表」`⌘\` 切换键）与 `detail_mode: "split"`（高频分拣/连续流 `240/280px` 可拖拽、可一键折叠左轨；窄窗格自动逐层推进与四路返回归一）。
  - 顶部以 `kind: "item"` 打开的独立条目标签一律默认隐藏主列表轨呈现纯净单页；母页普通点击原地开、非多选列表 `⌘/Ctrl`+点击与全列表鼠标中键均后台组内新开标签（`openBehind`）；多选列表（`aria-multiselectable="true"`）`⌘/Ctrl` 归多选、中键照开，配套 APG 键盘多选与 `.mw-selection-bar`。
- **文档 / 阅读 / 对话主轴**（如 Pages 正文、灵光、Jelly、Work Brief、Coding 对话）：以 `--measure-reading`（`680–720px`）或 `--measure-form`（`760–880px`）单轴居中，目录或参考栏按 `@container` 折叠。
- **画布 / 看板 / 宽表 / 演示**（如 Goals、Dataset、PPT、Shelf、Plugin Builder）：选用 `--measure-wide`（`1152px`）或专属画布结构，但按钮、弹窗、空态、状态标、Toast、忙碌态与动效仍 100% 遵守本 Skill。
- **工作台标签条已经写了插件名**：舞台内不要再重复放一行插件名大标题（仅在独立打开或试用页时显示）。
- **插件同等地位**：内置插件、创作台生成插件与第三方签名插件用同一套 `mw-*` 原语、舞台容器、标签组合同与质量线（`skills/molis-plugin-dev/ui.md` `studio-quality-bar`）。

---

## 3. 界面文案与双语规范（单一真相，不复制）

全部界面短句写法、零 AI 基础转译表、九类元素公式与标点规则以 [`skills/molis-plugin-dev/text-and-appearance.md`](../molis-plugin-dev/text-and-appearance.md) 与 [`docs/system/GLOSSARY.md`](../../docs/system/GLOSSARY.md) 为**唯一真相**。动手时守住 5 条底线：

1. 所有短句走 `t("<主人>.<位置>.<元素>", 参数)`，日期/数字走 `format`；持久化后才显示的文字存 `TextRef` 键与参数，不存译文，**绝不拿译文做 `if` 分支或正则匹配**。
2. 按钮用**祈使动词**（英文 Sentence case，如 `Import` / `Resume` / `Start`，严禁错绑过去分词 `Imported` / `Resumed` / `Started`），不可逆删除写具体动词（如「删除来源」），不用「确定 / 去处理」。
3. 面向零 AI 基础普通用户：日常界面不裸写 `Runtime / Agent / Prompt / 上下文 / 回执 / 投影 / 宿主 / 合同 / Jev / G1–G6`；必须核对的第三方词写 `白话主词（行业词）`（如 `密钥（API Key）`）。
4. 中文引界面名称用直角引号 `「…」`，层级路径用 ` › `（两端留空格）；严禁在 CSS `content:` 里写死中文。
5. 改完词包必跑 `node scripts/gates/translations.mjs --missing` 与 `node scripts/audit-ui-copy.mjs`。
