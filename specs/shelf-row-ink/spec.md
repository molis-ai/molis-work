# Shelf 目录行字色对齐其它插件

状态：已落地。完成等级 **3：功能可用**。

## 背景目标

Shelf 进舞台后，未选中文件名用 DropAgent 的 `--da-muted`（`--content-muted`），暗色约 `#96969F`。Goals / Feed / Sessions 目录行标题用 `--ink`（暗色 `#f7f8f8`）。同一工作台里文件名发灰，看起来像次要说明。

圈出的「试用示例.pdf」行：未选中、`.shelf-row`。

## 当前行为与问题证据

- `[data-shelf] .shelf-row { color: var(--da-muted); }`
- 选中才 `.is-on { color: var(--da-text); }`（`--content-ink`，暗色 `#E9E9ED`，仍略淡于 `--ink`）
- `.shelf-name` 12px，其它插件目录标题 13px
- 分组 `summary` 已是 `--muted` / `--da-muted`，与 Goals 折叠标题一致，不是这次对象

## 范围与非目标

做：舞台上的 `.shelf-row` 文件名用 `--ink`、13px；选中行标题同样 `--ink`。

不做：改五色类型图标、时间戳、行尾操作、空状态、预览正文、底栏、轮盘；不把 DropAgent 阅读面整体改成 Coss 强调色；不 commit。

## 使用场景

暗色打开 Shelf，未选中「试用示例.pdf」与 Feed / Goals 行标题同档墨色。悬停出操作、选中描边、拖出不变。

## 方案与关键决策

行标题跟工作台目录合同 `--ink`，不跟 DropAgent 侧栏 muted。图标仍走 `--mark-*`。说明文字仍 `--da-faint` / `--da-muted`。

## 文件边界

- `plugins/native/shelf/src/styles.ts`
- `tests/shelf-plugin.test.ts`、`tests/shelf-plugin.e2e.test.ts`
- `specs/shelf-plugin/spec.md` 补一句舞台行标题例外

## 验收

1. 未选中 `.shelf-name` 计算色等于 `var(--ink)`，不等于 `var(--muted)`。
2. 选中后仍是 `--ink`。
3. `.shelf-name` 13px。
4. `.shelf-glyph` 仍是五色标（PDF 浅色 `rgb(178, 116, 96)`）。
5. `.shelf-when` / `.shelf-ops` 仍 muted/faint。

## 验证

```
pnpm test tests/shelf-plugin.test.ts
pnpm test tests/shelf-plugin.e2e.test.ts
```

4174 暗色对照 Goals / Feed 行标题。

## 假设

用户说的「内容」是文件名，不是分组头。
