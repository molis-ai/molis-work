# README 必跑核对

所有路径来自本次准确 M+PR1b 的现行 README。未用 affected 建议豁免；本轮 139 个去重必跑文件，workbench-ui-platform 已在定向完整批通过，余下 138 个已经本轮执行。另补本片实际修改的 workbench-entry-exports、workbench-goals-mentions、package-boundary-must-contain 三份完整文件，验证合流后的入口与 owner 边界断言。

Home 装配/服务生命周期、安装身份/模型授权/撤权/关闭及 SDK 授权尾检没有本片行为改动，条件附加集不触发；本片新增页面字段拒绝按 accepted WO 的声明+投影两层回归及四负例验证。

## packages/contracts/README.md

- `tests/action-schema-compiler.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-plugin-audience.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-manifest-v2.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-declaration-rules.test.ts`：原 mandatory-resume FAIL 275/276；根授权单行修复后，final H 的 views-final-tests 完整文件 276/276 通过，原失败保留。
- `tests/action-read-compatibility.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/runtime-provider-identity.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-capability-availability.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-error-model.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-model-service.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-availability-kind.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。

## packages/plugin-sdk/README.md

- `tests/material-upload.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-runtime-integration.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/home-action-scenes.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-artifact-client.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-service.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/execution-lifetime.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/system-search.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-sdk-exports.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-declaration-rules.test.ts`：原 mandatory-resume FAIL 275/276；根授权单行修复后，final H 的 views-final-tests 完整文件 276/276 通过，原失败保留。
- `tests/plugin-manifest-v2.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/builtin-manifests-contract.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/side-panel-platform.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/contextual-interaction.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/work-placement.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-error-model.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-action-route.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-sample.e2e.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-cross-references.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-artifact-references.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/diff-plugin.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-model-service.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-availability-kind.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/question-rules-consistency.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/form-draft-questions.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-cards.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/assistant-card-outcomes.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/assistant-interaction-html.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/assistant-business-gateway.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-sdk-subpaths.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/feed-rich-content.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/code-incremental-colour.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/git-porcelain.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/diff-patch.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/companion-state-html.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/coding-change-html.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。

## packages/ui-host/README.md

- `tests/workbench-ui-platform.test.ts`：已在 targeted 完整文件通过。
- `tests/plugin-host-executor.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-declarative-mounting.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/ui-client-lifecycle.e2e.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/ui-request-client.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/security-invariants-browser-request.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/client-script-undeclared.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/ui-request-client-pages.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/ui-request-client.e2e.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/request-failure-call-id.e2e.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/ui-call-id.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-ui-invalidate.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。

## apps/local-host/README.md

- `tests/local-host.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/host-periodic-tasks.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/local-host-actions.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/local-host-queue-scope.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/web-mutation-key-settle.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-before-effect.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-directory-installation.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-model-scheduling.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-read-compatibility.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/installer-symlink-dependencies.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/system-search-host.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/project-arrival.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/project-deletion-hooks.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/project-deletion-owners.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/project-deletion-studios.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/project-deletion-assistant.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/onboarding-goals-actions.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/project-deletion-declarations.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/project-deletion-processes.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/memory-learning.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goal-management-identity.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/home-store-baselines.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/private-store-versions.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/project-deletion-service.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/mcp-connection-identity.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/management-door-identity.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-development-artifacts.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/mcp-session-authorship-nested.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-gateway-session-authorship.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/anysearch-single-owner.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/alchemist-pulse-github.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/lark-mcp-launch.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/connector-mcp.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/network-notices.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/model-first-setup-http.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/contextual-interaction.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/runtime-provider-identity.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/local-web-actions.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/verify-release-versions.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-error-model.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-error-edges.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-platform-home.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/web-home-isolation.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/feed-sync-authority.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/action-gateway.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goals-mcp-actions.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/security-invariants-gateway.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-project-database.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/settings-call-diagnostics.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/runtime-plugin-http-discovery.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/shelf-project-results-http.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-model-service.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/cli-goals-actions.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/shelf-jelly-cognia-images-error-model.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/host-pages-error-model.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-route-operations.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/security-invariants-connector-private-state.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。

## apps/workbench/README.md

- `tests/style-has-scope.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-declarative-mounting.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/builtin-plugin-agent-texts.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/builtin-manifests-contract.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/builtin-plugin-composition.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/workbench-ui-platform.test.ts`：已在 targeted 完整文件通过。
- `tests/i18n.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/client-script-undeclared.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/ui-request-client.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/ui-request-client-pages.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/settings-requests-through-helper.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/web-service-settings-client.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/assistant-island-script.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-client-served.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-list-developer-mode.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/plugin-picker-pins.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/settings-call-diagnostics.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/capabilities-page.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。

## plugins/native/goals/README.md

- `tests/goals-actions.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goals-workbench-registration.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goals-command-actions.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goals-library-actions.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goal-event-create-flow.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goals-tree-actions.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goal-progress-plugin-identity.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goal-management-identity.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goals-guidance-actions.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goals-planning-actions.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/proposal-entry-chain.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/management-door-identity.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goals-query-boundaries.test.mjs`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goals-input-confirm.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goal-artifact-inputs.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/feed-goal-promotion.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goals-command-module.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goal-events.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goal-events-state.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goals-query-facts.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goals-storage-boundaries.test.mjs`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goals-stored-json.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goals-personal-methods-stored-json.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/governance-collaboration-module.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/governance-provenance.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。
- `tests/goals-terminal.test.ts`：已在 mandatory / mandatory-resume 完整文件通过。

最终核抵：139 个去重 README 文件均有通过原件；仅声明文件及 stage-data-input 在 final H 新跑，其余保留 d5 执行绑定。最终增量只影响非数组 views，现行数组/缺省输入、其它模块和四有效负例未改变；具体核抵及最终资源复测见 REPORT.md，不把旧执行重标为新 H。

## 页面绘制条件集合补足

此前未列的十份完整文件已在最终 H 补验 43/43，无跳过/重试/取消；逐项原头、原始完整结果及输入差异见 [GOALS-CONDITIONAL-CHECKS.md](GOALS-CONDITIONAL-CHECKS.md)。无条件 139 计数保持原含义，不用其代替条件集合。
