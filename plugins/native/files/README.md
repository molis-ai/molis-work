# @molis-ai/molis-work-plugin-files

Browses the bound workspace, reads one file at a time, and publishes what it
captured: a collection description, `before`/`after` text snapshots, and the
text the user selected.

Files never reads a directory itself. The Host lists and reads; this Plugin
turns those results into a tree, a preview and the Artifacts other Plugins bind
to. Every interesting case — a directory that failed to list, one that was
truncated, a file that is binary, too large, missing or unreadable — is its own
state with its own sentence, so the user can tell which problem they have.

The declared event subscriptions describe the intended Coding/Git refresh
connection; automatic refresh is not yet wired end to end. The current product
uses explicit refresh and rejects snapshot capture when the displayed file's
fingerprint no longer matches the Host read.

The formal routes expose bound-workspace state, directory reads, file opening
and capture into the existing `before`, `after` and `selection` outputs. The
Host rechecks project membership on every read, rejects symlinks and traversal,
and bounds a directory to 1000 entries and a UTF-8 file to 256 KiB. Reading
position survives restart. Switching workspaces invalidates current outputs
while keeping historical Artifacts. The Workbench mounts the Files directory
and reader through public exports; default bindings feed snapshot Diff and
Text Stats. Generic command availability, standalone plugin entry, Coding
material consumption and automatic refresh remain incomplete.

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`

Directory candidates and browsing preferences come from the [current-project settings protocol](../../../docs/platform/PROJECT-SETTINGS.md). Files/Git consume `projectSettingsCapabilities.browsingWorkspace`; Coding consumes `workspaces` and keeps its execution directory per session. Manage directories in Project Settings → Workspaces.
