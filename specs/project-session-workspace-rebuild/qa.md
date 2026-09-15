# 项目内 Sessions 与工作目录重做 QA

日期：2026-08-30

完成等级：2 · 可交互原型

## 验收结果

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| Goals、Sessions、工作目录在项目根目录平级 | 通过 | 根入口均为同一 `.desktop-module-item` button；浏览器返回根目录后仍保留右侧工作标签与详情 |
| 不再存在独立管理页和 `sw-*` 壳层 | 通过 | 旧 renderer、独立 CSS / JS 资产与旧截图已移除；项目兼容路由重定向到同一工作台 hash |
| 目录层级对齐 Goal Tree | 通过 | 使用同一 `.tree-pane`、`.desktop-directory-heading`、搜索、连续行、选择、focus 与 `.tree-footer` 语法 |
| 详情层级对齐 Goal Detail | 通过 | 使用同一 `.document-pane`、工作标签、`goal-document`、标题动作、主工作面与上下文栏 |
| Session 执行内容和 Goal 历史占主要比重 | 通过 | 桌面执行流占主栏，当前关系和 Goal 历史在右侧持续可见；fallback 只呈现 Molis Work 可证明事实 |
| 返回方向和入口下划线 | 通过 | 目录返回统一使用真实 `ArrowLeft` 图标；入口是 button，不存在浏览器链接下划线 |
| Light / Dark | 通过 | 浏览器检查两套主题，选中、状态、正文、上下文栏与动作均可辨认 |
| 窄屏列表与详情 | 通过 | 500 CSS px 详情与 390×844 列表均实测；列表复用现有移动导航，详情标题与动作分行；Session 与工作目录详情 `scrollWidth === clientWidth` |
| 交互状态 | 通过 | 浏览器实测目录返回、列表选择、原生与 fallback 内容切换；DOM 验证不可读 / 失败、Handoff、路径修复、启动和空态均存在 |

## 浏览器证据

- `.impeccable/review/project-operations-redo-sessions-dark-final.png`
- `.impeccable/review/project-operations-redo-sessions-narrow-final.png`
- `.impeccable/review/project-operations-redo-session-detail-narrow-final.png`
- `.impeccable/review/project-operations-redo-workspace-detail-narrow-final.png`

## 本地安装版验收

- `pnpm install:local`：通过；`0.1.8` 同版本内容已刷新到 `/Users/yijunwang/.molis-work`，安装器保留旧版本恢复能力。
- `/Users/yijunwang/.molis-work/bin/molis-work service restart --home /Users/yijunwang/.molis-work --confirm --json`：通过；受管 LaunchAgent 返回 `restarted`。
- `http://127.0.0.1:4173/health`：通过；重启后返回 `status: ok`，监听进程与 `service_process_id` 均已更新。
- 当前项目真实安装页：通过；刷新后在项目根目录看到 Goals、Sessions、工作目录平级 button，入口 `text-decoration: none`。
- Sessions：通过；左栏为搜索、筛选和连续 Session 列表，右侧以执行内容为主，并展示当前关系与 Goal 关联历史。
- 工作目录：通过；左栏为路径目录，右侧展示路径状态、已知 Sessions、启动条件和项目关系。
- 返回控件：通过；安装页使用 `#icon-back`，路径为左向箭头，按钮和图标均无 CSS 旋转或下划线。
- 430px 窄屏：通过；Sessions 与工作目录详情均可查看，`scrollWidth === clientWidth === 430`；验收后已恢复默认 viewport。

## 命令验证

- `pnpm build`：通过。
- `node --import tsx --test --test-name-pattern="Web project catalog switches browser scope" tests/web.test.ts`：1/1 通过。
- `node /Users/yijunwang/.agents/skills/impeccable/scripts/detect.mjs --json --scope layout ...`：通过，0 条布局告警。
- `git diff --check`：通过。

完整测试套件不计为本切片的通过证据：一次误用 `pnpm test -- --runInBand tests/web.test.ts` 实际触发了全仓套件，暴露了当前工作树中与本切片无关的既有 i18n / CSS 断言，以及沙箱回环监听 `EPERM`。本切片随后使用获准的回环权限运行了对应 Web 定向测试并通过。
