# @molis-ai/molis-work-plugin-text-stats

Counts characters, UTF-8 bytes and lines in a captured file snapshot.

The smallest complete Plugin in the system: one required input, no Capabilities,
no outputs, no events, no storage, no disk. It exists as much to keep the
platform honest as to count characters — if consuming one bound Artifact needs
more than this, the platform is asking too much of whoever writes the next one.

The three counts disagree with each other on purpose. Characters counts code
points, bytes counts UTF-8, and neither is "length" in any language with text
outside ASCII.

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
