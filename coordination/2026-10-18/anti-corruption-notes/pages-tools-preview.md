# Pages 工具职责外部候选预演

状态：仅 D 中外部候选和结构/资源验证完成，P 源码未改；尚无 accepted 生产 spec，未运行正式 build、typecheck 或 Chrome。

## 资源结果

预演用 Pages 包目录作为 `absWorkingDir`，其余 esbuild 参数逐项等同 package.json build；输出只写 D，served bytes 由现有宿主 `tightenServedJs` 计算。原源码预演 raw 与当前正式 `dist/pages-editor.js` **逐字节相同**，正式基线 706839 B。

| 候选 | served B | 对正式 PGK | 对前一步 |
| --- | ---: | ---: | ---: |
| 原源码 | 706839 | 0 | — |
| 纯提取 `pages-tools-planned` | 706946 | +107 | +107 |
| 加 listCommand 固定 id 工厂 `pages-tools-list-planned` | 706854 | +15 | -92 |
| 再将 tools/screen 转发闭包放入 handle `pages-tools-inline-planned` | 706825 | -14 | -29 |

首次外部预览的原源码 706848 B 与正式基线相差 9 B，已定位为 esbuild CommonJS 包装键中的路径：从 D 运行写 `wt-pages-commands/node_modules/...`，正式包目录运行写 `../../../node_modules/...`。只有这一处 raw 差异；上表已修正运行目录，不能引用早先数字作为基线。

## 推荐候选及实际边界

推荐 **`pages-tools-inline-planned`**：新模块拥有 14 项工具定义、heading/list 命令工厂、groups/pressed/opens 及 selection screen；原六行 runTool 仍留入口路由弹层/命令。无新状态、缓存、getter、控制器、监听器或生命周期回调。

- 入口：856 → 805 行（含末尾空行的 split 计数）；mount：568 → 538 行。
- 新模块：65 行；最大函数 18 行。纯提取新模块 67 行，list 工厂减少 2 行。
- 公开导出声明与 handle 形状不变，55 个相对依赖模块无环。
- 规划时估计入口减约 60、mount 减 35–40 行偏大，实测分别减 51、30 行；入口仍超过 800、mount 仍是巨大函数，本片不代表 Pages 治理完成。

`listCommand(id)` 与既有 `headingCommand(level)` 使用相同形式：只在定义工具时捕获固定 id，执行回调才收到当次 state/dispatch。原列表判断、派发及 true/false 出口完全保留。tools/screen 原本只有定义与 handle 引用两处，转发函数内联到 handle 后仍延迟执行，其他调用时机不变。

## 对照证据

- `check-pages-tools.cjs`：14 项定义及返回类型/顺序/译文调用，两个原 helper，group 分支与可选字段，screen 四字段，mount 剩余语句及创建顺序，其他函数和公开声明逐项 AST 对照；55 模块无环。输出 `pages-tools-planned/ast-check.log`。
- `check-pages-tools-variants.cjs`：逐个验证固定 id 为 bullet_list/ordered_list/task_list；工厂回调参数为 state/dispatch，展开后三条 run 表达式与原定义一致；helper 体 AST 完全相同。入口只有两个 forwarding closure 内联，其他 AST 全部不变。输出 `pages-tools-variant-ast.log`。
- `preview-pages-tools-variants.mjs`：原源码、纯提取、list 工厂、handle 内联在同一 machine build slot 连续预演；结果 `pages-tools-variant-bytes.json`，各 raw 候选在对应目录的 `*-formal-path.js`。

下一步由主 Session 决定是否将此边界写入 accepted spec；执行前按既有计划建立正式 PGK Chrome 基线，生产改动后仍需整体构建、相应真实浏览器验证与正式门禁。此处只证明候选职责提取和资源约束可同时满足，不声称产品行为已验证。
