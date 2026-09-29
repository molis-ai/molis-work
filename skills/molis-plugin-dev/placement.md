# 放在哪里：位置、关联、移动与完成提示

用户做完一件事，要知道东西存在哪里、和哪项工作有关、谁能看到、以后从哪里找回来。这些规则由系统统一说明，插件只做几件小事。需求与语义见 [specs/work-placement/spec.md](../../specs/work-placement/spec.md)。

## 四个概念

| 概念 | 含义 | 谁负责 |
| --- | --- | --- |
| 位置 | 对象存在哪里：**个人空间**或**某个项目**，恰好一个 | 插件的分区（`project_id`；个人空间是保留分区 `personal`）；只存个人的插件（Shelf、Cognia、Jelly）永远在个人空间 |
| 访问范围 | 除本人外哪些工作环境能读 | 由位置决定：个人空间分区只有你；Home 级插件的内容是你的，但各项目里获授权使用该插件的助理和工作流能读（界面写“只有你和获授权的助理”）；项目里是该项目的助理、Runtime、工作流和授权客户端 |
| 关联 | 和哪项工作有关（用于项目、Goal 资料、来自哪里） | 系统放置服务（关系写在它自己的 Context Ledger）；Goal 资料由 Goals 的输入绑定记 |
| 入口 | 从哪里能打开 | 插件目录、项目首页“关联资料”、Goal“资料”、搜索、完成提示；入口不代表归属 |

移动（同一 id、关联都在）、复制（新对象记“复制自”）、转成（交给另一个插件做成新对象记“来自”）、固定版本（Artifacts 里不再变的一版）、关联（不改位置）是五种不同操作，界面名称要照实写。

## 插件要做的事

1. **对象读取**：界面上展示的每种对象都有 `*.subject.read`（见 [continuity.md](continuity.md)），带 `open: { surface, id }`；不存在时抛 `<plugin>.not_found`。放置服务靠它判断对象在不在、叫什么、在哪打开。
2. **能移动、复制的对象，声明放置协议**（只对 `user`，项目作用域）：

   ```ts
   // 内置插件从 contracts 引入；第三方插件从 Plugin SDK（@molis-ai/molis-work-plugin-sdk）引入同名导出
   import { bindObjectMoveHandler, bindObjectCopyHandler, defineObjectMoveAction, defineObjectCopyAction } from "@molis-ai/molis-work-contracts/platform/actions";
   move: defineObjectMoveAction("pages.placement.move", ["pages_document"], "文档", ["pages:read", "pages:write"]),
   copy: defineObjectCopyAction("pages.placement.copy", ["pages_document"], "文档", ["pages:read", "pages:write"]),
   bindObjectMoveHandler(actions.move, input => /* 把 input.from_project_id 分区的这一行改到 input.to_project_id，id 不变 */),
   bindObjectCopyHandler(actions.copy, input => /* 同一 request_id 返回同一份副本 */),
   ```

   移动时放掉只在原项目有意义的东西（文件夹、原项目里的 Goal 挂接、固定版本编号），有进行中的发布就拒绝。不能移动的对象（绑定外部服务、跨库）不声明，界面会写“不能移动”。
3. **能接收内容的插件，做成工作流内容站**（`defineWorkflowContentActions`，含 `receive`、需要时 `create`）：灵光“转成文档”、问卷“存成数据表”、Goal“新建演示稿”都走它；同一次交付只建一个对象（用 `workflowDeliveryKey`）。内容站的定义放进 manifest 的 `actions`，处理器单独导出（`create<Plugin>ContentHandlers`），由 Host 与插件动作处理器合并注册；不要塞进 `create<Plugin>ActionHandlers`，否则只按 `<plugin>Actions` 注册的调用方会报“处理器未声明”。
4. **页面声明当前对象**：插件根元素写 `data-assistant-context`（`object: { kind, id, version, title }`、`unsaved`），并在标题行留一个位置槽：

   ```html
   <span data-placement-slot data-placement-saved="off"></span>   <!-- 自己已显示保存状态时加 saved=off -->
   <span data-placement-slot data-placement-scope="home"></span>  <!-- Home 级插件（Shelf、Cognia、Jelly） -->
   <p data-placement-target></p>                                  <!-- 新建入口旁：工作台填成“新建内容存到 …” -->
   ```

   不要再写“内容属于当前项目”这类固定文字；位置由工作台按真实位置填。
5. **完成时报告结果**：新建、导入、生成、存固定版本、导出后发一个事件，工作台显示“做成了什么、存在哪里、下一步”：

   ```js
   window.dispatchEvent(new CustomEvent("molis:placement-result", { detail: {
     verb: "created" /* imported | generated | versioned | exported | printed */, title, object: { kind, id },
     note /* 可选 */, file: { name, format } /* 导出时 */ } }));
   ```

   `data-assistant-context` 只描述屏幕上正在看的对象；工作台把插件收回列表时会去掉其中的 `object`，插件再次打开对象时重新写入即可。

   请求共用对话框：`molis:placement-request`（`{ action: "use-in-project" | "move" | "copy", object }`）；把内容交给别的插件：`molis:placement-convert`（`{ source, station | goal: true, payload?, note? }`）。监听 `molis:placement-changed`（`{ mode, from, to }`），涉及自己的对象种类时重读列表，移走的对象关掉编辑器。

## 不要做的

- 不要在插件里自己记“用于哪个项目”“复制自哪里”：关系由放置服务记，内容总向所有者读。
- 不要把“存成 Artifact”“标记已发布”这类内部动作写成交付：写清结果去了哪里、别人能不能用（例如“存为固定版本”“开始收集（在这台电脑上）”）。
- 不要未经确认改变访问范围：移动、用于项目只对本机用户开放，助理只能读描述。

## 样例与验证

- 样例：Pages（导出 Markdown/网页/打印）、PPT（放映、导出 PPTX、接收大纲）、问卷（收集、填写页文件、导入答卷、存成数据表）、数据表（接收 CSV）、灵光（转成文档、建成 Goal）、Shelf（用于本项目 vs 存一份固定版本）。
- 测试：`tests/work-placement.test.ts`。
