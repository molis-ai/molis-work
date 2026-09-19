# 项目首页与目录列表视觉统一

状态：完成。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是本次体验变更的唯一需求书。它补在 `specs/poetic-project-home/spec.md` 与 `specs/directory-plugin-switcher/spec.md` 之上：保留已确认的诗意首页结构和 Codex 目的地目录，只统一「下面列表 + 右边首页」的视觉语言和进出动线。

## 背景与问题

右侧项目首页是留白、日期、宋体引语、月历、快捷方式和禁用输入框。左侧目的地之下，Goals 是 32px 单行，Feed / Inbox 是约 80px 卡片，Sessions 约 76px，来源筛选还有低于 9px 的字。首页列表区写着「首页没有条目。点上面的插件开始工作。」，和右侧诗意页不像同一个产品。

## 范围与非目标

### 范围

- 保留诗意首页：本地日期/星期、自动引语、月历、快捷方式、禁用单行输入。无问候大标题、无活动列表、不接入 Agent。
- 目的地仍是一层：项目首页 + 已启用插件；「+ 插件市场」留在目的地最底下，与工作插件略分开。
- 统一目录列表语法，使 Goals / Sessions / Inbox / Feed / 来源 / Artifacts / 首页列表区与首页次要文字同一家族：
  - 标题 13px / 450，单行省略；
  - Goals / Sessions 保持 36px 单行（标题 + 状态）；需要次要事实的列表 44px 两行（标题 + 一条 11px muted 说明）；
  - 圆角 6px；选中/悬停为平面 `nav-active`，不浮起、不用蓝色底芯片；
  - 列表区标题 12px / 500 / muted，与首页年、月标签同级；
  - 次要文字不低于 11px（修复来源筛选 8.5px）；
  - 摘要正文、类型芯片、计数行继续不出现在目录。
- 首页列表区不再写操作提示；列表标题仍为「项目首页」，下面留白。工作从上面的目的地进入。
- 首页焦点环、选区与工作台一致（2px `--blue` 焦点，`--blue-soft` 选区），不改首页构图。

### 非目标

- 不重做 Goal 画布、Frame、Feed/Inbox 详情、插件市场内容页。
- 不改快捷方式存储、外链、日历、引语轮换、Agent 禁用。
- 不改插件领域行为（搜索、筛选、拖到 Frame、状态机）。
- 不把首页做成列表，也不把列表做成诗意长文。

## 使用场景

1. 打开项目：左边上面是目的地，下面标题「项目首页」、无条目提示；右边仍是诗意首页。
2. 点 Goals：下面 36px 单行 Goal 树，右边画布或上次 Frame。
3. 点 Feed / Inbox：下面 44px 两行列表，标题和次要事实可读，选中态与 Goal 树相同。点 Sessions：下面 36px 单行，语法与 Goals 相同。
4. 从任意插件点回项目首页：主区回到诗意页，列表区再次留白。

## 文件边界

- `apps/workbench/src/styles/immersive-directory.ts`、`immersive-navigation.ts`、`project-home.ts`
- `apps/workbench/src/goals-page-renderer.ts`、`i18n/en.ts`、`artifact-ui.ts`
- 必要时更新 `DESIGN.md` 当前工作台段落与 `.impeccable/surfaces/immersive-workbench.md`
- 测试：`tests/desktop-tui.test.ts`、`tests/immersive-directory.e2e.test.ts`

## 验收

1. 首页构图与现网一致：日期、引语、月历、快捷方式、禁用输入仍在；浅色/深色/窄屏可用。**通过**（隔离 4188：浅色桌面、深色首页、390 抽屉）。
2. 首页列表区没有「点上面的插件」类说明。目的地与列表之间的横线已由 `specs/directory-list-divider/spec.md` 去掉。**通过**（隔离 4188：浅色桌面、深色首页、390 抽屉）。
3. Goal 行高仍为 36px，标题不换行，状态不被挤掉。**通过**（e2e + 浅色 Goals 截图）。Sessions 随后由 `specs/session-directory-goal-row/spec.md` 对齐为同一单行语法。
4. Feed 目录行高约 44px，标题 13px，次要文字 11px，选中为 `nav-active`。**通过**（e2e；Inbox / Artifacts 空态同目录语法）。
5. 来源筛选按钮字号 ≥ 10px。**通过**（目录 CSS 11px）。
6. 定向测试通过；隔离浏览器可走 首页 → Goals → Feed → Sessions → 回首页。**通过**（另验 Inbox / Artifacts / 390 抽屉）。

截图：`.impeccable/review/home-directory-visual-unify/`。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/desktop-tui.test.ts \
  tests/immersive-directory.e2e.test.ts \
  tests/project-home-start.e2e.test.ts \
  tests/chrome-inner-scroll.e2e.test.ts
```

Chrome e2e 需要非沙箱。隔离试用必须临时 `--home`，禁止打默认 home。
