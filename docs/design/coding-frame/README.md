# Coding 样张共用框架

画 Coding 定样的共用外壳，叠在组件板实件 [`../kit/`](../kit/README.md) 和 12 的布局层 [`../coding-execution-states/styles.css`](../coding-execution-states/README.md) 之上。kit 只放组件板、由 D 轨管；这里是 B 轨（Coding）自己的，手写。

| 文件 | 是什么 |
| --- | --- |
| `coding-proto.js` | `window.codingProto(cfg)`：原型控制条（块、方案、状态、语言、外观、重置、「标出组件板新增」）、Coding 头部、文件栏（12 已定的目录 C）、对话列、输入框、从按钮长出的弹层、提示条、04 的恢复框架（12 已定的恢复 A）、过程折叠。每个控件都调 `window.mwKit` 的真实渲染函数 |
| `coding-proto.css` | 上面框架在 12 布局层之上的补充：环境面板、过程行、尝试与额度、报告卡、阶梯、窄屏换行等；只引用组件板的变量 |

用它的样张：第 33 批 [coding-env-recovery](../coding-env-recovery/README.md)、第 35 批 [coding-daily-basics](../coding-daily-basics/README.md)。

## 引用顺序

```html
<link rel="stylesheet" href="../kit/kit.css">
<link rel="stylesheet" href="../coding-execution-states/styles.css">
<link rel="stylesheet" href="../coding-frame/coding-proto.css">
<script src="../kit/kit.js"></script>
<!-- 页面里要有 #icons、#proto、#app、#toast 四个元素 -->
<script src="../coding-frame/coding-proto.js"></script>
<script src="app.js"></script>
```

## 写一份新样张

`app.js` 调 `window.codingProto({ key, data, defaults, blocks, acts, after?, onKey?, onDraft? })`：

- `data`：`blocks`（块的 id 与中英文名）、`decided`（每块定下的方案，原型里标 ✓）、`schemes`（A／B／C 的名字）、`states`（每块的状态）。
- `blocks[id](ctx)` 返回这一块当前方案、当前状态的整屏 HTML；`ctx` 给出语言、组件板零件（`btn`、`ring`、`tag`、`badge`、`ic`、`item`、`group`）、版式（`frame`、`dirCol`、`composer`、`you`、`round`、`ai`、`recover`、`hint`、`fold`）、交互（`openPop`、`toast`、`busy`）。
- `acts(ctx)` 返回按钮 `data-act` 对应的处理函数。
- 组件板上没有的部件，用 `ctx.fresh("理由")` 打上标记；勾「标出组件板新增」时会加虚线框并显示理由。定下后先补成组件板标本，再进产品。

从 `docs/design` 起服务：

```bash
python3 -m http.server 4416 --bind 127.0.0.1 --directory docs/design
```

<!-- 从设计索引保留的说明与决策；后续只在本目录维护。 -->

Coding 样张共用框架 `coding-proto.js`／`.css`：原型控制条、Coding 外壳、恢复框架和「标出组件板新增」开关，叠在 kit 和 12 的布局层上

现行；B 轨维护，33、35-2 在用
