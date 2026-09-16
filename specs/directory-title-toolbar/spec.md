# 目录标题与插件操作同一行

状态：标题与操作同一行已被 `specs/chrome-plugin-rail/spec.md` 取代（操作改到标题下方）。本文件仍保留「目录内不再放搜索框、各插件共用操作标记」的合同。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

## 背景与问题

Goals 目录在标题「Goals」下面还有一整条工具栏（用户截图里仍能看到搜索框和筛/建/归档/回收站/折叠）。搜索已经不应出现在这里。剩下的图标按钮继续占掉列表上方一行，和 Sessions / Feed / Inbox / 来源各自不同的工具排布不一致。

## 范围与非目标

### 范围

- 每个插件目录的标题行是：**左侧插件名，右侧该插件的操作**，同一行，约 32px。
- Goals：目录内不再有搜索框。「折叠全部」已由 `specs/goals-directory-remove-collapse-all/spec.md` 删除。新建横条、筛选位置、归档/回收站百叶窗见 `specs/goals-directory-collection-folds/spec.md`。
- Sessions：筛选、新建贴在「Sessions」右侧。去掉目录内搜索框；关键词跳转走全局搜索。
- Feed：筛选贴在「Feed」右侧。Feed / 来源分段仍在同一行标题区。去掉目录内搜索框。
- 来源：筛选（原「全部 / 账号 / 公开 Feed / 需处理」收进筛选菜单）和添加贴在「来源」右侧。去掉目录内搜索框。
- Inbox：待处理 / 历史贴在「Inbox」右侧。
- Artifacts、项目首页：没有插件操作时，只保留标题，不留空工具行。
- 筛选弹出层仍锚在该行图标上，不超出目录宽度，不改 SQLite 事实。

### 非目标

- 不改 Goal 画布、Frame、终端、插件市场、详情页。
- 不把操作搬进项目选择那一行。
- 不恢复 Goal Tree 关键词过滤；不新增服务端搜索。

## 使用场景

1. 打开 Goals：看到 `Goals` 和一排图标同一行，下面直接是 Goal 列表。
2. 打开 Sessions / Feed / Inbox / 来源：同样是标题 + 右侧操作，没有第二行搜索条。
3. 点筛选：面板从该行打开，能筛列表；Escape 或再点关闭。
4. 窄屏抽屉里同一行仍可点，触控目标不小于现有图标按钮。

## 方案与关键决策

- 工作台用目录区域网格把「标题」和「当前面板的工具条」排进同一行；各插件仍渲染自己的按钮与弹出层。
- 列表内搜索框删除，避免 236px 侧栏把标题行撑成两行。列表过滤继续用现有筛选菜单。
- 视觉跟现有石墨目录：12px muted 标题、27–32px 幽灵图标，不另起工具条皮肤。

## 文件边界

- `apps/workbench/src/styles/immersive-directory.ts`、`immersive-navigation.ts`
- `apps/workbench/src/scripts/client/immersive-navigation.ts`（筛选菜单关闭）
- `plugins/native/goals/src/tree-ui.ts`
- `plugins/native/work/src/ui/render.ts`
- `plugins/native/feed/src/ui.ts`
- `plugins/native/inbox/src/ui.ts`
- `DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md`
- 测试：`tests/immersive-directory.e2e.test.ts`、`tests/chrome-inner-scroll.e2e.test.ts`、`tests/desktop-tui.test.ts`、`tests/i18n.test.ts`

## 验收

1. Goals / Sessions / Feed / Inbox / 来源：插件标题与操作垂直中心对齐，同一行；目录内没有搜索输入。**通过**（隔离试用 4193，各插件点开确认；目录内无搜索框）。
2. 项目选择旁放大镜仍在；点开仍是按插件分组的全局搜索。**通过**（输入 `Session` 只出 Sessions 分组结果）。
3. Goals 状态筛选、新建、归档、回收站可用；Sessions 筛选 / Feed 筛选 / Inbox 分段 / 来源添加可用。**通过**（Goals / Sessions / Feed / 来源筛选面板宽度贴近目录，不挤在图标里；Inbox「历史」切到空态文案）。「折叠全部」后来删除，见 `specs/goals-directory-remove-collapse-all/spec.md`。
4. 定向测试与相关 e2e 通过。**通过**（52 通过，1 跳过 grok CLI）。

窄屏抽屉点按：**未运行**浏览器 390 宽；`tests/goals-narrow-navigation.e2e.test.ts` 已绿。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/desktop-tui.test.ts \
  tests/goals-tree-ui.test.ts \
  tests/i18n.test.ts \
  tests/goals-tree.e2e.test.ts \
  tests/immersive-directory.e2e.test.ts \
  tests/chrome-inner-scroll.e2e.test.ts \
  tests/goals-narrow-navigation.e2e.test.ts
```

Chrome e2e 需要非沙箱。隔离试用必须临时 `--home`，禁止打默认 home。
