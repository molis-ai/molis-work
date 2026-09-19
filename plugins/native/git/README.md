# @molis-ai/molis-work-plugin-git

Shows what is in the working tree, publishes each change as a comparable change
set, and holds the decision to take a Coding Run's changes into the workspace.

This Plugin never runs `git`. The Host runs it; the parse of porcelain v1 lives
here so that renames, every conflict letter pair, and awkward paths are testable
without a repository — which is exactly where a hand-rolled split goes wrong.

Accepting a Run's changes is a **decision a person makes**, never a consequence
of the Run finishing. This Plugin decides only whether the decision is still
offerable: it refuses when a file moved since the change was prepared, when a
conflict is open, and when the changes already landed.

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
