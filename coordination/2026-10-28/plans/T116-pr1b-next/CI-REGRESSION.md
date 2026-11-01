# #1680 web-route-table 失败只读裁定

结论：`StagePageModel.request` 与用于组装模型的 `MolisWorkWebView.stage_request` 是 PR1b 已有的预期能力；本次失败中的 **`/api/board` 无页面路由匹配时仍序列化空 `stage_request: {}` 是返回合同回归**，不是需要默认刷新快照的新 API 决定。最小建议是修生产组装处的字段存在条件，保留现行快照与完整断言。

本轮只读核 Git 对象、公开合同、accepted 接续材料和原 CI 产物；未跑测试/构建、未改源码、spec、快照、Git refs 或 GitHub。仅新增本分析文件；CI-REPORT 与原件未覆盖。

## 对象及来源

- fresh PR 回读仍 open，H `3421e0e69645a7ac247672c590951bce3a9c5765`，base `6cdb218302cdb924bd8770a8c2180f5407e30031`。
- 失败来自 CI 41284745773、Product 1/2 job 124783719858、workflow attempt 1。
- 实际 checkout `30e544ccc19fe5bac7ae6ae8520bee4c47633963`，tree `d09b283bb6c6f3fe4bc2d48eb74ff21fdb8b0f0c`，双亲是上述 base 与 H。
- 该 checkout 相对 H 的六路径增量不含下列故障链实现、测试或快照，不能归咎于 CI 合并带来的 T390/T391 差异。
- 失败文件、快照、boardRoute 和 local-host README 在采用输入 M `db29f18d4f602fa8d9efb689a6a766aa9b07625f`→H 均未变化。

## 为什么判为回归

1. `packages/contracts/src/platform/ui.ts:188–198` 的 `UiStageDataDeclaration.input` 只把本插件声明页面路由的请求参数交给其 action 与 `StagePageModel.request`；`:238–242` 明定未声明 input 或未从本插件页面路由打开时 `request` 缺省。这没有新增 `/api/board` JSON 顶层键的需求。
2. `apps/workbench/src/page-view.ts:54–58` 的 `stage_request?` 是按 project-plugin id 保存的可选模型组装信息；`stage-renderers.ts:38–42` 只将对应插件的项映射为 `StagePageModel.request`。accepted `/private/tmp/t116-pr1b-ready/PLAN.md` 保留此内部通道，但未约定扩大通用 board API 返回形状。
3. `apps/local-host/src/page-routes.ts` 调 SDK matcher；本候选内只有 Goals 声明 `ui.page_routes`。其十二条路由含 `/api/board/refresh` 和 `/api/board/momentum`，没有 `/api/board`。
4. 因此这两个 board 探针没有 match。`project-stage-data.ts:32–41` 在 match=null 时给空投影 `{}`，既有 stage-data-input 的 null/unmatched/不归该插件/无 input 断言也明确如此。
5. 新增的 `web-request.ts:168–169` 无条件展开 `{ ...view, stage_request, stage_data: ... }`，将空对象也放进 view。`web-project-platform-routes.ts:227–230` 的 boardRoute 直接 `sendJson(..., await readWebView())`；空对象不会被 JSON 序列化省略。故 board JSON 多出一个键。
6. `tests/web-route-table.test.ts:179–195` 比较响应顶层键，`:247` 对145个探针的完整结果 deep-equal。原 snapshot 中两个成功 board JSON 探针分别为 `GET <project>/api/board` 和 `GET <project>/api/board (no token)`，都已有 stage_data、没有 stage_request。local-host README:13 也要求通用读取与 `/api/board` 保持原返回合同；其中 plugin_stage_ids 已按页面专用范围处理。

因此需要区分：保留新舞台能力，并恢复无投影请求原有形状。此处没有证据表明可信身份已被改写或敏感参数已泄漏；已证实的是不必要的空字段暴露和精确返回形状变化。

## 最小修复建议（未实施）

只改 `apps/local-host/src/web-request.ts` 的这一处对象组装，先照常计算投影、照常传给 declaredStageData，仅当**外层插件映射非空**时附加可选字段：

```ts
view = {
  ...view,
  ...(Object.keys(stage_request).length > 0 ? { stage_request } : {}),
  stage_data: await declaredStageData(
    view.shown_plugins ?? [],
    action => bindLocalWebAction(localHost, hostReference, action),
    stage_request,
  ),
};
```

外层非空检查很关键：合法匹配可产生 `{ schedule: {} }`，这仍有有效接收方，不能因其内层参数为空就丢掉对应 `request`。无匹配时外层为 `{}`，字段缺省，stage_data 的原读取仍接收 `{}`。源码中 cache 保存的是未扩展的 base，后续都是对象展开，没有请求投影原地写入缓存的链路。

建议范围仅此生产 hunk；不改共享 SDK/API 快照、错误语义、可信字段拒绝或 matcher；不在测试 fingerprint 中删掉 stage_request，也不刷新145探针快照接受未约定的外部变化。若将来确实要让 board API 返回请求投影，应作为独立、明确的合同决定说明用途和消费者，不由此次压红隐式引入。

## 最小补验建议（本轮未执行）

先将该一处行为约束补进现有 accepted 任务书，之后按授权实施；不另建需求体系。源码修改后绑定准确新 H/tree，使用公共 build 槽完成匹配整体 `pnpm build`，不能借旧 H dist 冒记新结果。

随后以隔离 Home、公共测试槽完整执行：

```sh
node scripts/run-tests.mjs --jobs 1 --retries 0 --verbose tests/web-route-table.test.ts tests/stage-data-input.test.ts
```

- 路由表完整文件继续使用原 snapshot、关闭 `MOLIS_WORK_UPDATE_ROUTE_SNAPSHOT`：两个 board JSON 键集、145探针状态/类型/路由落点及现有 terminal 404 断言都必须保持，不仅按名跑失败项。
- stage-data-input 完整文件覆盖正常参数到 Host 投影及 stage model、无匹配/不归该插件/无 input 反控、缺值边界、三可信字段的独立拒绝。源码 diff 同时确认非空映射仍进入组装。该文件现有正控分段调用真实 matcher/projection/renderer；**不是经实际 HTTP 穿过 private projectWebView 的端到端正控**，不夸大其证据层级。
- 若实现扩大到 matcher/投影/字段语义，或新增 helper/出口，才按实际变化补相应正反控；本建议无这些改动，不为包装这一条件新增公开导出或聚合层。
- 当前补丁不改 renderer、fixture、前端资源、SDK/public API 的输入；既有有效负例、66 HTML、48 serving-body 和其它已通过完整文件按准确输入核抵，无需重跑旧矩阵。源变更后的 build binding、diff 与必要 health/边界/导入检查应绑定新 H；生成 API 不变，不需要 api:update。
- 推送/触发仍由根按已有授权办理，最终需新 H 的准确远端 CI，特别确认原红 Product 文件实跑通过。旧 run 和其 Product failure 保留；既有 full=true/准确头 Full 需求不因窄范围本地通过而消失，也不在本只读任务触发 Full。

两个完整文件是最小定向范围，不是 Full/发布/用户验收。真实执行有新的差异或失败时再调整范围。

## 首败、重试与未证实部分

原件全部原样保留：

- `ci/job-124783719858.log`：原始 Product 作业，`fail (2 tries)`，最终217/218文件通过。
- `ci/product-1-report.json` 与 `ci/product-1.zip`（artifact 13075610193）：web-route-table status=fail、attempts=2、文件内 tests=2/pass=1/fail=1、末次截断 detail。
- `ci/product-2-report.json` 与原ZIP（artifact13075270751）、`product-coverage.json`、`CI-REPORT.md` 继续保留整轮上下文和结果。

首轮失败发生与第二次仍失败有计数原件，但产物只留末次诊断片段。**首轮逐断言细节、两轮是否完全同因仍 UNKNOWN**；本轮不制造一份不存在的首轮日志，也不重跑旧树填历史空白。末次 detail 的 `stage_request` 差异与源码链一致，但截断原件不能证明除此以外绝无其它差异；实际修复后必须让完整原快照通过，才可结清该失败。
