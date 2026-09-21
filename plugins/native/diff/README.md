# @molis-ai/molis-work-plugin-diff

One comparison surface for three interchangeable kinds of input: two snapshots
captured in Files, a change set a Coding Run prepared, and a change already in
the Git working tree.

The change-set Artifact type is owned here, by the consumer, rather than by any
producer. Producers conform to what a comparison needs, which is what keeps one
surface able to render all of them instead of growing a branch per upstream.

Legacy Run change sets carry hunks, so their comparisons remain marked
`partial`. Coding's fixed text-review records preserve both original sides and
use the same bounded text comparison as file snapshots. Repeated edits to one
path are addressed by their original change index. These are saved proposals
with execution receipts, not a claim about the current working tree; command
and external effects are outside this text-review coverage.

The production default binding delivers Coding's selected `changeset` output
to Diff without changing the user's selected input group. An exact Artifact
reference can also be opened independently of the live input group. Coding's
embedded reader adds feedback anchors only after saving a fixed version; no
feedback action authorizes or applies an edit.

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
