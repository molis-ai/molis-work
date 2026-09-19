# @molis-ai/molis-work-plugin-files

Browses the bound workspace, reads one file at a time, and publishes what it
captured: a collection description, `before`/`after` text snapshots, and the
text the user selected.

Files never reads a directory itself. The Host lists and reads; this Plugin
turns those results into a tree, a preview and the Artifacts other Plugins bind
to. Every interesting case — a directory that failed to list, one that was
truncated, a file that is binary, too large, missing or unreadable — is its own
state with its own sentence, so the user can tell which problem they have.

It subscribes to Coding and Git because both change files behind the user's
back. A tree that keeps showing a file a Run deleted is worse than one that
reloads.

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
