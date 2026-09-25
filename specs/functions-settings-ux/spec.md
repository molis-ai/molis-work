# 函数设置：从用途到启用

目标：达到功能可用，并以真实浏览器验证核心设置路径。现有三栏把对象、规则、映射和发布并排展示；技术 key 抢占注意力；能力目录手工遗漏 Jelly / Cognia；额外 judgment subjects 在服务端有、界面无。

保留：Choice/Noul/Score、草稿自动保存、已有发布与场景绑定合同、项目 UI 风格。替换：三栏导航改为「选择用途 → 判断规则 → 试跑与启用」可自由切换的步骤，固定反馈与操作区；技术标识渐进展开；类型以人话解释。作用对象仍可选，不因选择去向偷偷改动。改用途可能同步默认/动作选项，但保留自定义规则。发布不等于启用，不宣称函数会自动执行所有插件工具。

能力范围：以现有内置插件目录声明的 behaviors / mcp_exports 为来源，保留连接器接入条件；补齐 Jelly/Cognia，动态呈现服务端 subjects。动作库可搜索、按插件分组、显示完整描述和读取/修改属性。事件只用现场支持的按钮；Agent 工具只作为建议，执行仍受工具启用和权限约束。不新增各插件执行能力，不改权限、不启用用户函数或发起计费试跑。

文件边界：Functions UI/client/styles/en，Host behavior-catalog，对应 tests 与本 spec。保护工作树已有修改，不改无关插件和全局设计。

验收：三种类型用自然语言辨认；选择用途后可顺序完成规则、样例、发布；可返回修改且草稿不丢；保存/失败状态常驻可见；映射缺失可定位；库中工具可找、解释可读，主体扩展可见；已发布规则只读但可试跑；桌面/窄屏可用、键盘有焦点、减少动态偏好生效。

验证：插件与 Host 定向 build/typecheck，Functions plugin/system capability 回归；通过本地隔离 fixture 在浏览器实际验证步骤、筛选、自动保存、失败、发布与映射；不使用真实 API Key 计费。现有三栏 DOM 合同断言更新为步骤合同。浏览器证据不代表 TypeSafe 实际判断质量或原生安装验收。

## 验证记录

- 完成程度：功能可用；未做真实 TypeSafe 计费调用，不宣称判断质量验收或原生发布验收。
- Contracts、Functions、Workbench、Local Host 的定向构建通过。检查中遇到并行工作新增导出的旧构建问题，重建相应依赖后通过，未修改其他任务的实现。
- `node --import tsx --test --test-concurrency=1 tests/functions-plugin.test.ts tests/functions-system-capability.test.ts`：42/42 通过，含内置能力全量覆盖、固定页面动作池、HTTP 发布/调用/绑定与不可变性。
- 通过 CUA 操作隔离真实 SQLite/service/routes + 模拟 provider：Choice 编辑 → 搜索 Cognia → 加入结果 → 自动保存 → 试跑 → 发布 → 只读；Noul 的 Inbox 映射遗漏会回到规则步骤，补齐映射可保存；Score 禁用不支持的页面用途并解释原因。
- 实操清空名称触发服务端错误；返回目录被阻止，输入和错误留在当前页面；修正名称后可保存并返回。
- 服务端扩展判断对象在页面可见；能力搜索为空有恢复提示。已发布记录和新草稿切换不继承前一条的对象勾选。
- 桌面浅色/深色及英文、窄屏布局已检查；底部操作固定、内容独立滚动；窄屏 DOM 无水平溢出。步骤切换回顶，减少动态偏好由 CSS 关闭切换动效。
- 新版完整宿主在 `127.0.0.1:4175` 启动，已打开原项目的 Functions 草稿，只读检查主界面集成。原 `4173` 服务未重启。
- `tests/functions-draft-retention.test.ts` 更新为阻止丢失未保存草稿的新导航合同；本轮没有运行其独立 Chrome 启动脚本，相关失败/恢复路径以 CUA 实操验证。
- 能力完整性边界见 [核对表](capability-audit.md)。运行时动态安装插件与真实外部账号执行不在本轮验证范围。

后续说明：本 spec 替代 `functions-independent-authoring` 的三栏视觉布局要求；函数独立存在、可选对象、默认动作同步、自定义输出保留和 HTTP 协议保持不变。隔离验证脚本在 `scripts/preview-functions.mts`，不触碰用户凭据。
