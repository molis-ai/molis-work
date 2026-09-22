# Shelf 文件类型改成靠左色标

状态：完成。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

## 背景目标

舞台材料行把类型（`PDF`）做成右侧灰字。用户要求类型往左靠，并用标签+颜色区分文件种类。

## 当前行为与问题证据

`.shelf-row`：图标、文件名（`flex: 1`）、`.shelf-cap` 灰字、悬停操作盖住类型。实测「试用示例.pdf」行宽 886px，类型贴右。

## 范围与非目标

做：材料 / 结果 / 子项 / 剪贴板行的类型紧跟文件名；用现有 `--mark-slate/blue/ochre/plum/clay` 及 `-fill` 做成色标；悬停不再藏类型。

不做：不改图标、不改 DropAgent 五色、不改隐藏/删除/拖动语义、不加 Coss `mw-badge`。

## 使用场景

1. 短文件名：图标、名称、彩色 `PDF` 挨在一起，右侧留空给操作。
2. PDF / MD / TXT / IMG / WEB / URL / DIR 颜色可辨，文字仍在。
3. 悬停仍能点复制/隐藏/删除，类型标签还在。

## 方案

文件名改为 `flex: 0 1 auto`。`.shelf-cap` 加对应 `tone-*`，底用 `--mark-*-fill`，字用 `--mark-*`。`text` 标成 `TXT`。失败仍是陶土「失败」。

## 文件边界

允许：`plugins/native/shelf/src/{ui,client,styles,glyphs}.ts`、对应测试、`DESIGN.md` 一句。

## 验收标准

1. 「试用示例.pdf」的类型左缘紧挨文件名右缘（间隙 ≤ 12px），且距行右缘 > 40px。
2. 该标签有陶土底/字，不是 `--da-faint` 纯文本。
3. 悬停 `visibility` 不是 hidden。
4. MD / IMG 等与 PDF 不同色。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-plugin-shelf build
npx pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/shelf-plugin.test.ts tests/shelf-plugin.e2e.test.ts
```

## 验收

| 标准 | 结果 | 证据 |
| --- | --- | --- |
| 1 类型紧跟文件名，不贴右 | 通过 | 预览：试用示例.pdf 与 PDF 间隙 8px，距行右 888px。e2e 同约束。 |
| 2 陶土底/字 | 通过 | 暗色 `rgb(77, 61, 55)` / `rgb(210, 156, 135)`。e2e 亮色 `rgb(242, 231, 225)` / `rgb(178, 116, 96)`。 |
| 3 悬停仍可见 | 通过 | hover 后 `visibility: visible`。e2e 同。 |
| 4 不同种类不同色 | 通过 | `toneForKind`：pdf clay、md/txt slate、image plum、url/web blue、folder ochre；单测锁 class。本项目预览只有 PDF。 |
