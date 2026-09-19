# @molis-ai/molis-work-plugin-diff

One comparison surface for three interchangeable kinds of input: two snapshots
captured in Files, a change set a Coding Run prepared, and a change already in
the Git working tree.

The change-set Artifact type is owned here, by the consumer, rather than by any
producer. Producers conform to what a comparison needs, which is what keeps one
surface able to render all of them instead of growing a branch per upstream.

A Run's change set carries hunks rather than both ends of each file, so a
comparison built from one is marked `partial` and says so above the rows. It is
not the same claim as a full file comparison and is never presented as one.

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
