# 组件板 `/__ui/catalog` 与 `docs/design/` 原型规范

生产组件的唯一活文档是 **`/__ui/catalog`**；设计探路原型的唯一共享底盘是 **`docs/design/kit/`**。严禁再造第二套组件板或私自复制静态 CSS。

---

## 1. 维护生产组件板 `/__ui/catalog`（7 章 + 子路由）

1. **新增控件先上板，再进业务**：任何新 `mw-*` 原语、状态变体、反馈原语（如 `#platform-feedback`）或复杂交互件，必须先在 `packages/design-system/src/primitives/catalog*.ts`（或工作台经结构化 `CatalogExtraChapter` / `extraChapters` 注入的标本文件）补齐全状态标本（默认 / 悬停 / 聚焦 / 忙碌 / 禁用 / 错误 / 空态），严禁用 `.replace(...)` 正则字符串拼接强插 HTML。
2. **目录与章节纪律**：
   - 保持 7 章中文名称稳定（受 `tests/design-language.test.ts` 保护）；`look-card` 标本保持紧邻 `typeface`（受 `tests/appearance-parts.test.ts` 保护）。
   - 标题不写死批次号，不留过期的「待共审」临时标签；所有标本文字走 `t()`，不得裸露未翻译 i18n 键或损坏快捷键。
   - 图标按钮用 `renderButton({ iconOnly: true, icon, label })`。`label` 是必填的动作名，用 `t.text()` 取当前语言的文字，由 SDK 写成可访问名。
   - 左侧目录使用动态 `grid-row: 1 / span ${totalCount}`（严禁写死 `span 76` 截断新增章节），并提供 `[data-catalog-chapter]` 章节筛选芯片与 `[data-catalog-find]` 搜索框。
3. **子板 iframe 必须穿透外观**：`/bar`、`/navigation`、`/conditions`、`/assistant` 等所有子板文档必须挂齐 `appearanceHead(appearance)`，确保在组件板切换 4 套皮肤、F1 字体、明暗或紧凑密度时全部子框同步刷新。
4. **改组件板必跑关联测试**：组件板约有 70+ 个耦合单测与 E2E（`tests/*board*.test.ts`、`tests/primitives.test.ts`、`tests/design-language.test.ts`、`tests/appearance-parts.test.ts`、`tests/work-line-specimens.test.ts`），改结构后用 `node scripts/affected-tests.mjs` 挑出并全部跑绿。

---

## 2. 在 `docs/design/` 画新原型与归档旧原型

### 目录结构（干净的 9 个现役目录 + `archive/`）
- **现役目录**只留 3 类：`kit/`（唯一构建工具与产物）、现行整屏基准（`screen-polish/`、`folio-baseline/`）、尚未落地的待实施原型。
- **已落地或被取代的原型**一律 `git mv` 移入 `docs/design/archive/<name>/`，不堆积在 `docs/design/` 根目录。

### 画新原型的 4 条硬规则
1. **唯一依赖 `../kit/`**：
   - 构建命令：`pnpm build && node docs/design/kit/build.mjs`（同时生成 `kit.css`、`kit.js`、`settings.css` 与 `dist/{arrival.css,workbench.css,settings.css,theme.js,sprite.js,foundation.js}`）。
   - 禁止新建第二套 `_catalog`、`component-board` 或跨原型互相引用兄弟目录样式；原型的额外微调样式只放在本目录内且只用语义 CSS 变量。
2. **只写参考，不冒充规范**：每个新原型目录放一份简短 `README.md`（标明对应批次、备选方案与用户已选方向），并在 `docs/design/README.md` 登记链接（`scripts/gates/doc-indexes.mjs` 强制每个 `docs/design/*/README.md` 均被索引）。
3. **严禁新增 `.impeccable/` 入库文件**：评审截图放被忽略的 `.impeccable/qa/review/`；`scripts/gates/impeccable-files.mjs` 对每个 `.impeccable/` 组只许减不许增（挪动旧目录内的 `design.json` 侧车文件会被当成新组拦截，归档前须经用户确认删除历史 sidecar 或保留原地）。
4. **归档必清全仓 Markdown 断链**：移动目录后立即批量更新所有非 `archive/` Markdown 对该目录的相对链接，并跑 `pnpm health:check` 保证 `doc-links` 与 `doc-indexes` 均归零。
