## 做了什么

Pages 的编辑命令集中在 2,241 行文件里。按选区与菜单、块变更、插入、容器、光标与代码、格式、Markdown 拆成七个内部模块，最大的 634 行；原 `commands.ts` 作为 128 行的显式汇总入口，113 个导出及所有命令行为保持。

对应唯一 spec 的 W5-10-PGC-01～03。逐项 AST 对比确认 139 个声明实现原样保留，包入口声明不变，命令签名解析同一导入类型后相同。内部模块不回指汇总入口，依赖无环。没有新依赖、迁移或读取兼容。

## 验证

- 整体 `pnpm build` 通过。
- README 必跑、命令/输入规则/转换/拖拽/评论及直接调用方：29 文件 545 条通过。
- 七个真实 Chrome 文件：37 条通过（plugin-small-ux、content-editing-regressions、content-portable-regressions、pages-actions、pages-import-entry、pages-assistant-surfaces、pages-publication）。合计 36 文件 582 条，零失败/跳过。
- `pnpm boundary:check`、完整 merge-base health（64 API 快照、2,506 声明）、下降快查、最终文档检查与 diff 检查通过。
- 正式资源检查通过：25 项 7,476,313 B，Pages 编辑器仍为 707,007 B，本片增量 0。
- 首次健康检查因新增 spec 段落把原状态句挤出开头而失败；调整段落顺序后完整复跑通过，门禁规则未变。
- 按用户约定不在本机运行全量；共享全量交统筹 CI。没有可见 UI 改版或样式变化，浏览器证据验证现有编辑路径，不代替真人体验认可。

## 公开合同与 API 影响

无包 exports、contracts、SDK、动作、Manifest、MCP、HTTP 或数据合同变化。调用方保持原入口。基本合同检查不涉及新能力或授权路径。

## 只许减少的数字

巨大单元 137→136；快查仅删除原 `commands.ts` 的 2,241 行巨大文件项，未放宽任何门禁或资源许可。

## 没做 / 待定

此片只完成编辑命令族；editor mount、hoverHandlePlugin、其他节点视图与存储的 W5-10 后续仍按唯一 spec 推进。未触碰真实 Home，未发布。
