# 工作台：全局设置进插件壳，账号与齿轮拆开

状态：纠偏已落地。完成等级 **3：功能可用**。全局设置同样是目录分类 + 右边 exclusive 正文（外观在 stage，目录没有 theme 控件）。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是这次入口与展示位置变更的唯一需求书。它覆盖 `specs/archive/chrome-plugin-rail/spec.md` 里「全局设置从账号进入」，以及 `specs/archive/directory-account-compact/spec.md` 里「账号行仍打开全局设置」。

项目设置从 chrome 齿轮进入同一套壳，见 `specs/archive/project-settings-directory-panel/spec.md`。独立 `/settings/*` 与 `/projects/{id}/settings*` 直达 URL 仍保留给项目列表、书签和既有滚动合同。

## 背景与目标

插件栏底的头像曾链到 `/settings/appearance`，点一下就离开工作台。头像后续要做账号管理；全局设置单独一颗齿轮。上一轮把外观和其它分类正文都塞进第二栏目录，违反插件壳（目录=列表，右边=主体），窄栏里控件被压成纵向堆叠。

目标：点齿轮留在插件壳。目录只放外观 / AI 与执行工具 / 规划方法 / 诊断；正文进右边 exclusive 主体，用独立设置页那套行内 setting-row。账号仍是占位。

## 当前行为与问题证据

- 插件栏底：设置齿轮在上，账号头像在下。点账号不跳转。
- 点齿轮：`data-directory-panel="settings"` 里同时有 nav 和外观正文；右边主体不是设置文档。
- 目录压缩样式隐藏说明、把 setting-row 改成纵向，和独立 `/settings/appearance` 内容栏不一致。

## 范围与非目标

### 做

- 插件栏底：上面一颗设置齿轮，下面是账号头像。
- 点齿轮：第二栏换成全局设置分类，右边主体换成当前分类正文。不改 URL，不关现有标签（exclusive 盖住，状态保留）。
- 目录内能切 外观 / AI 与执行工具 / 规划方法 / 诊断。外观可改主题、密度、终端配色、语言；控件在右边主体。
- 点账号：不跳转。账号管理未接入，不假装已完成。
- 点插件栏其它入口（首页、插件、市场）后，目录离开设置，exclusive 清除。
- 齿轮在设置打开时高亮；账号不高亮。
- 窄屏抽屉：齿轮在头像上方，点齿轮后抽屉里是分类，主体是正文。

### 不做

- 不做账号登录、头像上传、多账号。
- 项目设置进壳见 `specs/archive/project-settings-directory-panel/spec.md`。
- 不把设置做成可卸载插件或市场项。
- 不删独立 `/settings/*` 页。
- 不改 Runtime / 规划 / 诊断的领域契约，只改它们出现的位置。
- 不把整页 embed 再塞进目录。

## 使用场景

1. 在首页点齿轮：第二栏出现「设置」分类，右边是外观正文；地址栏仍是当前项目。
2. 在右边改主题：立即变色，不必跳页。
3. 切到「AI 与执行工具」：右边看到 Runtime 记录，接入预览仍用现有确认框。
4. 点 Goals：目录回到 Goal 树（或 root），exclusive 清除，齿轮取消高亮，标签按原合同预览/钉住。
5. 点头像：还在当前项目工作台。
6. 390 抽屉：齿轮在头像上方，点开后抽屉是分类。

## 方案与关键决策

1. **齿轮是壳入口，不是标签。** `data-plugin-id="settings"` + `data-directory-open="settings"`，没有 `data-work-surface-open`。
2. **账号只是占位。** `button.personal-account`，`aria-label` 为「账号管理」，无 href。
3. **设置是第二栏的一种 directory + 右边 exclusive 工作面。** 目录 panel 只有 nav。标签 `apply()` 不得在设置打开时把目录改回当前插件。
4. **外观预渲染在 settings stage。** 其它段按需把现有设置页正文装进 stage。工作台内的 `/settings/` 链接继续留在壳里，不整页跳走。语言切换仍走 `/locale`（会刷新当前项目路径）。
5. **独立设置页保留。** 项目列表「系统设置」、直达 URL、滚动测试仍可用。

## 输入输出与依赖

- 输入：当前项目、已启用插件、本机外观偏好、现有 `/settings/*` 正文。
- 输出：插件栏底齿轮+头像、目录分类、右边设置文档、不跳页的段切换。
- 依赖：现有 directory 切换、tab-workspace exclusive、视觉偏好脚本、Runtime 预览、规划/诊断页正文。
- 不改用户库、不新协议。

## 文件 / 模块边界

- `apps/workbench/src/goals-page-renderer.ts`、`immersive-shell.ts`、`settings-directory.ts`、`settings-appearance.ts`
- `apps/workbench/src/styles/immersive-navigation.ts`、`immersive-directory.ts`、`linear-density.ts`、`project-settings-page.ts`
- `apps/workbench/src/scripts/client/immersive-navigation.ts`、`navigation-feed.ts`、`tab-workspace.ts`、`settings-directory.ts`
- `apps/workbench/src/scripts/settings.ts`、`scripts/settings-web-service.ts`
- `specs/archive/chrome-plugin-rail/spec.md`
- 测试：`tests/desktop-tui.test.ts`、`tests/project-home-start.e2e.test.ts`、`tests/i18n.test.ts`

## 验收标准

1. 插件栏底顺序：设置齿轮在上，账号头像在下；齿轮 `aria-label` 为「打开全局设置」。
2. 点齿轮：`#goal-tree-pane[data-desktop-directory=settings]`，`[data-tab-workspace][data-exclusive=settings]`，`[data-work-surface=settings] [data-theme-option=dark]` 可见；目录 panel 没有 theme option；`location.pathname` 仍是当前项目。
3. 在右边改主题会改 `document.documentElement.dataset.resolvedTheme`。
4. 能切到 AI / 规划 / 诊断，正文在 `[data-work-surface=settings]`，不把工作台换成 `body.settings-page`。
5. 点账号后仍在当前项目路径。
6. 点 Goals（或其它插件）后目录离开设置，exclusive 清除，齿轮不再 `aria-current`。
7. 定向测试通过。完成等级 3 只在主体可编辑且样式可用之后宣称。不宣称可发布。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
pnpm --filter @molis-ai/molis-work-app-workbench typecheck
node --import tsx --test --test-concurrency=1 \
  tests/desktop-tui.test.ts \
  tests/i18n.test.ts \
  tests/project-home-start.e2e.test.ts
```

Chrome e2e 用隔离项目。禁止打用户默认 home。独立 `/settings/appearance` 滚动合同仍由 `tests/chrome-inner-scroll.e2e.test.ts` 覆盖，不在本任务重跑全套。

## 假设与开放问题

- 项目设置从 chrome 齿轮进同一套壳，见 `specs/archive/project-settings-directory-panel/spec.md`。
- 账号管理后续另开任务。
- 规划方法的深层编辑页也装进右边主体；保存成功后的跳转若仍写独立设置 URL，以内嵌加载消化，不把整窗换成设置页。
