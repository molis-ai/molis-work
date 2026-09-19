# @molis-ai/molis-work-plugin-workspace

Publishes the project's working directory as a typed Artifact so Files, Git,
Diff and Coding can bind to it through ordinary port wiring.

In FlyLeaf this was the `projects` Plugin, which both picked a directory and
published it. Molis Work already owns project selection in the catalog, so this
Plugin keeps only the half that was missing: turning the current project into a
value other Plugins can consume.

The published reference carries an **opaque Host handle**, never an absolute
path. Resolving a handle to a directory stays a Host privilege, so a Plugin that
was never granted filesystem access cannot learn the user's disk layout from an
Artifact that happens to pass through it.

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
