# BL-composer-frame-sources

分组：9. 平台小项与工程流程 / 统一输入

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-composer-frame-sources | 沙箱插件框架里的页面还列不出 `+` 菜单里的插件来源和 `@` 系统搜索：页面授权按设计拒绝框架直接调 `/api/composer/*` 与搜索。**第 11 批一个输入框之后（11-11 改写）**，框架页不再自己画输入框，登记为底栏的收件人，底栏的 ＋ 与 `@` 菜单本来就画在父页、以本人身份调来源；今天父页给框架收件人固定 `sources: false`（`apps/workbench/src/browser/plugin-frame/composer-parent.ts`）。原来「父页在框架上方代画浮层、键盘经桥转发」的部分不用做了。剩下要做的：父页核对安装后按页面登记的意愿给框架收件人开来源与搜索，选中的 `MaterialRef` 随发送交回框架（`composer-materials` 已有，框架永远列不出结果），Coding 把它们并进这一轮的 `materials`；`S-composer-source-call` 第 5 条改写并补带沙箱框架的浏览器级拒绝用例；下面「开来源时一并做」的一条 | [第 10 批](../post-anticorruption-roadmap/reference/batches/10.md#batch-10-progress) K2 交回（11-08） | 已知缺口 | 插件同等待遇要求补齐，但第 10、11 批没有沙箱插件用输入框来源：第一个使用者是 K6 的灵光（框架里），所以排在 K6 灵光接入之前做，不在本批。**2026-11-10 用户定：第 11 批 PR 开出后紧接着做**——Coding 也在框架里，它的 ＋ 要列「待办」等平台来源（第 11 批先 `sources: false`），桥做好后把选中的引用并进 Coding 这一轮的材料（`materials`，开轮时经 `knowledge.read` 读） | 第 11 批 PR 开出后（K6 灵光之前） | 高 | A 统一输入（与 D 工作台外壳评审框架桥） |

**开来源时一并做（第 11 批评审台 2026-11-11 提）：** 一个输入框起，框架页面按自己的发送键会经 `composer-send` 替人按底栏的发送（`apps/workbench/src/browser/plugin-frame/composer-parent.ts`）。今天发出去的只是这一页自己的字和附件，框架页面也不列来源，所以没有越权；但开了来源以后，页面就能把人在 ＋ 里选的别的插件的引用自动发出去，违背 UIV-20「收件人登记不能自动提交」。开来源时，`composer-send` 要么只在人真的点了页面自己的按钮时才发（子页把可信点击交给父页确认），要么材料条上有来源项时不收。
