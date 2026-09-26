# @molis-ai/molis-work-plugin-workspace

Retired from the product catalog and runtime graph. There is no Workspace navigator entry. Directory association and browsing selection now live in Project Settings → Workspaces, through the [current-project settings protocol](../../../docs/platform/PROJECT-SETTINGS.md).

This package retains legacy contracts and data compatibility. Local Host migrates its saved `selected-workspace` once; catalog memberships and historical Artifacts remain intact. New consumers must use `projectSettingsCapabilities`, not Workspace output bindings.

- Status: `partial` (legacy compatibility only)
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
