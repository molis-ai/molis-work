# UI Evidence 与完整事件历史

## 背景与目标

`MOLIS_WORK-UI-EVIDENCE-HISTORY` 要让用户不离开 Molis Work Web，就能提交一条人工验收证据、在 Review 中引用它，并查看某条 Goal 的完整可追溯事实。当前页面只展示 Runtime 已提交的 Evidence 摘要；用户没有提交入口，事件历史只显示最近 12 条摘要，完整记录也遗漏 Evidence、Risk、Relation、Candidate 与 Rewire 的关联细节。

## 当前行为与问题证据

- `src/web/render.ts` 的 `renderEvidenceCell` 只读展示 `item.evidence`，没有人工提交表单。
- `src/web/server.ts` 没有 `POST /api/goals/:goalId/evidence` 路由；Coordinator 已提供 `submitEvidence`，且允许不绑定 Runtime Run 的人工 Evidence。
- `renderHistory` 截断为 12 条事件；`renderFullRecords` 只有 Claim、Run、Review、Policy 四类摘要。
- `renderReference` 只直接打开 HTTP(S)，其他引用一律复制，不能安全打开项目内引用。

## 范围

1. 在未归档、未回收的 Goal 页面提供“提交人工 Evidence”入口：选择一个或多个本 Goal 的验收条件、Evidence 类型、结果、定位引用和可选摘要。
2. Web 后端只适配 `MolisWorkCoordinator.submitEvidence`，使用 `web-user` 作为提交者且不伪造 Runtime Run。
3. Evidence 列表显示 Evidence ID、提交者、时间、验收条件、摘要和定位引用；Human Review 继续可从同一列表选择/引用 Evidence。
4. HTTP(S) 引用直接打开；受控项目内相对路径可通过只读 Web 路由打开。路由只允许指定项目根目录内的普通文本文件，拒绝绝对路径、上级跳转、符号链接逃逸、目录和超大/非文本文件。其余协议或不受控引用仍只复制。
5. 为每条 Goal 呈现完整事件历史而非 12 条截断：包含 Claim、Run、Evidence、Review、Policy、Risk、Relation、Candidate、Rewire、Contract/Goal Tree Proposal 与澄清记录所关联的事件，并能展开查看 ID、时间、操作人、理由和结构化 payload。

## 非目标

- 不开放任意本地路径、目录浏览或文件写入。
- 不改变 Runtime 通过 MCP 提交 Evidence 的权限、Run 归属或完成门禁。
- 不引入第二套 Evidence 存储或绕过 Coordinator 的业务规则。
- 不重做现有 Goal Workbench 的视觉语言。

## 方案与关键决定

- 新增 `projectRoot?: string` Web server 选项，默认启动 Web 服务的当前工作目录；它只用于受控引用读取，不写入项目文件。
- 仅相对的、无协议的项目路径和 `project://` 前缀的路径可走本地打开路由；路径经 `resolve`/`realpath` 再验证仍在 `projectRoot` 内。
- 人工 Evidence 默认 `attestation`，但用户可选择现有 Evidence kind 与 `passed/failed/inconclusive`；至少选中一条该 Goal 的 criterion，定位引用不能为空。
- 完整历史使用可展开、按时间倒序的事件账本；原有紧凑摘要保留为“最近动态”，不再作为唯一历史。
- Goal Tree Proposal 不只归到其 root Goal：显式列为受影响对象、或在条目 payload 中指向的子 Goal 也会关联到同一份提案事件。
- 沿用连续文档、细分隔线和可展开记录，不增加卡片堆叠或新的视觉世界。

## 模块边界与调用链

```text
Goal 页面 Evidence 表单
  -> POST /api/goals/:goalId/evidence
  -> coordinator.submitEvidence(... actor_id: web-user, run_id: null)
  -> SQLite evidence + event
  -> /api/board 刷新同一 canonical view

Evidence locator
  -> HTTP(S): 浏览器直接打开
  -> 项目内相对路径: GET /api/project-references/:encoded-locator
     -> 安全解析 projectRoot 内的只读文本文件
  -> 其他 locator: 复制，不尝试打开
```

## 验收标准

1. 用户可以在 UI 中将一条人工 Evidence 绑定到本 Goal 的一个或多个验收条件；保存后它进入同一 Evidence 列表、可被 Human Review 引用，并参与既有完成门禁。
2. HTTP(S) 引用可直接打开；合规项目内引用可在只读路由打开；路径逃逸、绝对路径、目录、二进制和超限文件被拒绝。
3. Goal 的完整历史不再截断，且与该 Goal 有关的 Claim、Run、Evidence、Review、Policy、Risk、Relation、Candidate、Rewire、Contract/Goal Tree Proposal、澄清事件均可找到并展开查看完整详情。
4. 页面保持现有桌面/移动端 Goal Workbench 的连续文档体验，表单、错误态和键盘焦点可用。

## 验证

- `pnpm exec tsc --noEmit`
- `pnpm exec tsx --test tests/web.test.ts`
- `pnpm test && git diff --check`
- 本地浏览器：人工 Evidence 提交、HTTP/项目内引用、拒绝不安全路径、完整历史展开、移动端表单。

## 假设与开放问题

- 本轮 `projectRoot` 表示启动 Web 服务的本地工作目录；以后项目绑定服务提供明确工作区根目录时，可由其传入同一选项，不改引用安全模型。
