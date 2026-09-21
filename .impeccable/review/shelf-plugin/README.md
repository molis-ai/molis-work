# Shelf 对照图

`tests/shelf-plugin.e2e.test.ts` 每次跑都会重写这些图。

| 图 | 状态 |
| --- | --- |
| `workbench-light/dark` | 选中一份材料的工作面 |
| `confirm-light/dark` | 确认页（动作、参数、读/写/网络/隔离、谁在跑） |
| `drop-light/dark` | 从 Finder 拖进来的罩层 |
| `wheel-light/dark` | 六瓣轮盘（原生截图，不由 e2e 生成） |
| `settings-light/dark` | Shelf 设置页的六段用途卡片 |

**看 dark 图时注意：** 无头 Chrome 在深色下会把「选中态底片」画成上一次的浅色，Molis 自己的左侧导航选中行也一样。这是截图管线的陈旧合成，不是表面色值问题——同一次断言里 `--da-press` 已经是 `#28282F`，在真实浏览器里打开深色设置页，选中底片是 `rgb(40, 40, 47)`。要肉眼核对深色选中态，请开真实窗口看，不要只看这张 PNG。
