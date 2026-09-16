# 工作台：全局设置进目录，账号与齿轮拆开

状态：已实现。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

本文件是这次入口与展示位置变更的唯一需求书。它覆盖 `specs/chrome-plugin-rail/spec.md` 里「全局设置从账号进入」，以及 `specs/directory-account-compact/spec.md` 里「账号行仍打开全局设置」。

项目设置（chrome 上那颗项目齿轮、`/projects/{id}/settings*`）仍走独立页。独立 `/settings/*` 路由保留给项目列表、直达链接和既有滚动合同。

## 背景与目标

插件栏底的头像目前链到 `/settings/appearance`，点一下就离开工作台。头像后续要做账号管理；全局设置应单独一颗齿轮，内容在第二栏目录里打开，右边标签和工作面不动。

## 当前行为与问题证据

- `footer.personal-sidebar-footer` 只有 `.personal-account`，`href` 指向 `/settings/appearance?project=…`，`aria-label` 是「打开全局设置」。
- 齿轮画在账号内部，插件栏 CSS 把它 `display:none`。
- 点账号会整页跳到 `body.settings-page`。
- `tests/project-home-start.e2e.test.ts` 点 `.personal-account` 断言 `location.pathname==='/settings/appearance'`。

## 范围与非目标

### 做

- 插件栏底：上面一颗设置齿轮，下面是账号头像。
- 点齿轮：第二栏换成全局设置，不改 URL，不关现有标签。
- 目录内能切 外观 / AI 与执行工具 / 规划方法 / 诊断。外观可改主题、密度、终端配色、语言。
- 点账号：不跳转。账号管理未接入，不假装已完成。
- 点插件栏其它入口（首页、插件、市场）后，目录离开设置。
- 齿轮在设置打开时高亮；账号不高亮。
- 窄屏抽屉同样：齿轮在头像上方，点齿轮打开目录里的设置。

### 不做

- 不做账号登录、头像上传、多账号。
- 不把项目设置搬进目录。
- 不把设置做成可卸载插件或市场项。
- 不删独立 `/settings/*` 页。
- 不改 Runtime / 规划 / 诊断的领域契约，只改它们出现的位置。

## 使用场景

1. 在首页点齿轮：第二栏出现「设置」，右边仍是首页标签；地址栏仍是当前项目。
2. 在目录里改主题：立即变色，不必跳页。
3. 切到「AI 与执行工具」：目录里看到 Runtime 记录，接入预览仍用现有确认框。
4. 点 Goals：目录回到 Goal 树，齿轮取消高亮，标签按原合同预览/钉住。
5. 点头像：还在当前项目工作台。
6. 390 抽屉：齿轮在头像上方，点开后目录是设置。

## 方案与关键决策

1. **齿轮是目录入口，不是标签。** `data-plugin-id="settings"` + `data-directory-open="settings"`，没有 `data-work-surface-open`。
2. **账号只是占位。** `button.personal-account`，`aria-label` 为「账号管理」，无 href。
3. **设置是第二栏的一种 directory。** `data-directory-panel="settings"`。标签 `apply()` 不得在设置打开时把目录改回当前插件。
4. **外观内联。** 工作台已有视觉偏好脚本。其它段按需把现有设置页正文装进目录，目录内的 `/settings/` 链接继续留在目录里，不整页跳走。语言切换仍走 `/locale`（会刷新当前项目路径）。
5. **独立设置页保留。** 项目列表「系统设置」、直达 URL、滚动测试仍可用。

## 输入输出与依赖

- 输入：当前项目、已启用插件、本机外观偏好、现有 `/settings/*` 正文。
- 输出：插件栏底齿轮+头像、目录内设置面板、不跳页的段切换。
- 依赖：现有 directory 切换、视觉偏好脚本、Runtime 预览、规划/诊断页正文。
- 不改用户库、不新协议。

## 文件 / 模块边界

- `apps/workbench/src/goals-page-renderer.ts`、`immersive-shell.ts`、`settings-directory.ts`、`settings-appearance.ts`
- `apps/workbench/src/styles/immersive-navigation.ts`、`immersive-directory.ts`、`linear-density.ts`
- `apps/workbench/src/scripts/client/immersive-navigation.ts`、`navigation-feed.ts`、`tab-workspace.ts`、`settings-directory.ts`
- `apps/workbench/src/scripts/settings.ts`、`scripts/settings-web-service.ts`
- `specs/chrome-plugin-rail/spec.md`
- 测试：`tests/desktop-tui.test.ts`、`tests/project-home-start.e2e.test.ts`、`tests/i18n.test.ts`

## 验收标准

1. 插件栏底顺序：设置齿轮在上，账号头像在下；齿轮 `aria-label` 为「打开全局设置」。
2. 点齿轮：`#goal-tree-pane[data-desktop-directory=settings]`，目录可见设置正文；`location.pathname` 仍是当前项目。
3. 目录内能看到外观控件，改主题会改 `document.documentElement.dataset.resolvedTheme`。
4. 能切到 AI / 规划 / 诊断，正文在目录里，不把工作台换成 `body.settings-page`。
5. 点账号后仍在当前项目路径。
6. 点 Goals（或其它插件）后目录离开设置，齿轮不再 `aria-current`。
7. 定向测试通过。完成等级 3，不宣称可发布。

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

- 项目设置仍从 chrome 齿轮进独立页。
- 账号管理后续另开任务。
- 规划方法的深层编辑页也装进目录；保存成功后的跳转若仍写独立设置 URL，以内嵌加载消化，不把整窗换成设置页。
