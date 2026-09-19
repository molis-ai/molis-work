# 设置页脚注收到标题旁叹号

## 背景目标
设置正文底部的补充说明（`.settings-footnote`）在折叠段落后像被甩掉的一行，既占空间又打断收尾。把它收到页标题旁边的叹号提示里，正文只留真正要改的内容。

## 当前行为与问题
- 项目说明页标题下已有用途说明，页底再跟「只发送当前生效版本…」。
- 工作规则、外观、AI 与执行工具、诊断、全局项目管理页也用同样的页底脚注。
- 工作规则表单保存按钮旁的说明是操作语义，不是页级注脚。

## 范围与非目标
范围：把设置文档的页级脚注移到对应 `h1`/`h2` 旁的叹号提示；悬停/点击/键盘都能读到原文。
非目标：不改 Runtime 发送顺序、规则生效时机或文案含义；不收走保存按钮旁的表单说明。

## 使用场景
打开项目说明或任一设置页时，标题旁有一个安静的叹号。点开或聚焦后看到原先那句生效说明；页底不再留一行灰字。

## 方案与关键决策
- 用 `mw-hint`（圆圈叹号 + 原生 popover + CSS anchor）挂在标题右侧。
- 项目说明按钮名用已有「Runtime 如何使用」；工作规则用已有「这些规则什么时候生效」；其余用「如何生效」。
- 表单保存旁的 `.settings-footnote` 保留。

## 输入输出与依赖
输入：现有脚注文案与设置标题结构。
输出：标题旁提示、去掉页级脚注。
依赖：`@molis-ai/molis-work-design-system` 的 hint 原语。

## 文件 / 模块边界
允许：design-system hint、设置页 HTML/CSS、policy 项目文档标题、对应 i18n 与测试。
禁止：改 Guidance/Policy 写入语义、MCP、保存 API。

## 验收标准
1. 项目说明标题旁有叹号提示，原文仍在；页底没有 `.settings-footnote`。
2. 工作规则、外观、AI 与执行工具、诊断、全局项目页同样处理。
3. 工作规则 / Goal 规则表单保存旁的说明仍在按钮附近。
4. 键盘可打开提示；窄屏不被裁切。

## 验证命令
- `pnpm --filter @molis-ai/molis-work-design-system build && pnpm --filter @molis-ai/molis-work-plugin-goals build && pnpm --filter @molis-ai/molis-work-app-workbench build`
- `node --import tsx --test --test-concurrency=1 tests/primitives.test.ts tests/goals-policy-ui.test.ts tests/project-settings-accordion.test.ts tests/project-settings-stage.test.ts`
- 浏览器：项目说明、工作规则、外观；点开叹号；窄屏确认提示可见。

## 假设与开放问题
设置内容区 `overflow` 会裁切绝对定位气泡，因此提示用原生 popover 进顶层，不靠页内绝对定位。
