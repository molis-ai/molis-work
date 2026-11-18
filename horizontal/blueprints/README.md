# 场景采用

保存场景草稿，预览每项设置的影响，按本人选中的范围写入各设置主人。重新打开后可继续，也可撤销仍由这次采用持有的更改。

## 开发要求

- 服务拥有 `blueprints/blueprints.db` 中的草稿、采用记录与逐项进度。实际设置由声明它的项目或插件持有。
- 公开入口 `@molis-ai/molis-work-service-blueprints`。动作合同见 [场景合同第七节](../../specs/scene-and-page-contract/spec.md#7-保存与恢复)。
- 嵌套动作沿用调用者的身份、项目及授权。等待主人返回后重新检查授权，再提交对应步骤的进度。
- 同一采用只按第一次确认的范围继续。核对写入用原请求编号与原始请求。撤销用主人写入时返回的版本。
- 改动后运行 `node scripts/run-tests.mjs --jobs 1 tests/blueprint-adoption-service.test.ts tests/blueprint-adoption-contract.test.ts`。
