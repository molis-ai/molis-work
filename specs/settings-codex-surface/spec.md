# 设置正文采用 Codex 偏好页节奏

状态：已落地，正在按 Codex 纠正卡片底色与密度。完成等级 **3：功能可用**。隔离 Chrome 量到：h1≈28px、白卡片 12px 圆角、行距约 10px、分类行≈36px 带图标、无选中竖条、控件在文案右侧。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是这次设置视觉变更的唯一需求书。壳模型仍以 `specs/project-settings-directory-panel/spec.md` 与 `specs/settings-directory-panel/spec.md` 为准：目录只放分类，正文在右边主体。四个分类的字段与保存仍以 `specs/project-settings-redesign/spec.md` 为准。Linear 工具密度继续管工作台目录/标签/列表，不再压设置文档。

## 背景与目标

点齿轮后设置已经在右边主体，但看起来不像能用的偏好页。Linear 密度把标题压到 16px、行距 8px、导航 28px；目录分类还套了 Goal 列表那套 compact 行。对照 Codex 设置：左边分类可扫，右边大标题；页面浅灰、卡片白色；相关行叠进同一张卡，说明在左控件在右。不是白底上再铺一层灰卡片，也不是每个分类单独占一块高卡片。

目标：工作台设置 stage 和独立 `/settings*`、`/projects/{id}/settings*` 共用同一套 Codex 偏好节奏。用户扫一眼知道这是哪一类、这一行改什么、控件在哪。

## 当前行为与问题证据

- `apps/workbench/src/styles/linear-density.ts` 把 `.settings-stage` / `project-preferences-page` 的 h1 收到 16px、content padding 16px、setting-row padding 8px、独立页导航 28px。
- 目录分类用 `mw-dir-row--compact`（28px）加左侧 2px 选中条，像 Goal 列表，不像偏好分类。
- 正文分组没有卡片；标题、行、危险操作挤在一条细线上，说明字 12px 贴着标题。

## 范围与非目标

### 做

- 设置文档退出 Linear 压缩：大标题约 28px，内容栏留白，行距约 10px，说明 13px。
- 相关设置行收进白色圆角卡片（12px、`--paper`、细分隔），组标题在卡片内或卡片上方，控件仍在行右。项目说明六个分类叠进一张白卡；版本记录 / 已停用说明叠进下一张，不再各自铺灰底。
- 目录分类 36px、圆角选中底、图标+名称；去掉 Goal 列表那条选中竖条。独立页左侧导航同样加图标、保持 36px。
- 全局外观行包进同一套卡片。

### 不做

- 不抄 ChatGPT 的信息架构、搜索框、主题代码预览。
- 不改保存 API、删除确认、四个分类字段。
- 不把工作台 Goal/Feed 目录改松。
- 不重做账号管理。

## 使用场景

1. 点项目齿轮：目录四分类带图标、当前项圆角底；右边「常规」28px 标题，项目名称/本地数据在一张卡片里，名称在左、输入和保存在右。
2. 切到工作规则：分组卡片里开关和选择在行右，底栏保存仍在。
3. 全局设置外观：同样大标题 + 一张卡片里的主题/语言/密度行。
4. 直达独立设置页：左侧分类与右边文档同一套节奏。
5. 窄屏：行可折成上下，触控目标 44px 保留。

## 方案与关键决策

1. **设置是偏好文档，不是工具列表。** Linear 密度继续管壳；设置文档用 Codex 阅读节奏。
2. **分组靠白卡片，不靠灰底块，也不靠再压字号。** 画布用 `--page`，卡片用 `--paper`；同类行叠进一张卡。行还是左文案右控件。
3. **分类导航像 Codex 侧栏，不像 Goal 树。** 图标 + 36px 行 + 圆角选中，无左侧竖条。

## 输入输出与依赖

- 输入：现有设置 HTML、独立页导航、工作台 directory row。
- 输出：可扫的分类 + 可读可改的右边文档。
- 不改用户库。

## 文件 / 模块边界

- `apps/workbench/src/styles/linear-density.ts`、`project-settings-page.ts`
- `apps/workbench/src/settings-directory.ts`、`settings-appearance.ts`、`settings-navigation.ts`
- `DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md`、`specs/linear-workbench-density/spec.md`
- 测试：`tests/project-settings-stage.test.ts`、`tests/desktop-tui.test.ts`、`tests/project-home-start.e2e.test.ts`、`tests/project-settings-standalone.e2e.test.ts`

## 验收标准

1. Linear 密度不再把设置 h1 / setting-row / 独立导航压到 16px / 8px / 28px。
2. `.settings-stage` 与独立偏好页：h1 约 28px；setting-row 水平、控件在右；卡片是白色 `--paper`，不是灰底；项目说明分类是一张卡里的行，不是六张高卡片。
3. 目录分类有图标，当前项圆角底，没有 2px 选中竖条。
4. 四个项目分类和全局外观在主体里仍可操作；不跳页合同不变。
5. 定向测试通过。完成等级 3 只在浏览器里设置页能扫能改之后宣称。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-app-workbench build
npx pnpm --filter @molis-ai/molis-work-app-workbench typecheck
node --import tsx --test --test-concurrency=1 \
  tests/desktop-tui.test.ts \
  tests/project-settings-stage.test.ts \
  tests/project-home-start.e2e.test.ts \
  tests/project-settings-standalone.e2e.test.ts
```

Chrome e2e 用隔离项目。禁止打用户默认 home。
