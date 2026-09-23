# Cognia

Status: `partial`. Workspace migration: `goal-reorg-f2`. Contract: `@molis-ai/molis-work-contracts/platform/plugin`.

Personal knowledge workspace for the current Molis Work Home. Import a local Obsidian, LLM Wiki or Markdown folder, preview the fixed snapshot, then explicitly commit. Browser folder uploads create an independent source; select an existing upload source to update it. Local paths use the canonical directory as source identity. Source files are never changed. See [format compatibility](../../../specs/cognia-plugin/compatibility.md).

The Home store is `cognia/cognia.db`. Materials preserve paths, original bytes, Markdown, frontmatter, common title/tags/aliases and every changed version. Source/path pairs are unique. Import previews expire after 30 minutes; cancelled previews do not add materials. Repeated commits and draft saves are idempotent. Conflicting previews require a fresh preview. Deleting source files does not delete imported materials.

Limits: 1,000 entries / 32 MB per batch, UTF-8 text up to 2 MB, attachments up to 8 MB. Hidden/cache directories and symlinks are skipped. Unsupported formats and read failures appear in the receipt. Images/PDF/audio/video are retained as attachments, without OCR or extraction. Downloads use attachment disposition and never execute HTML or SVG.

Search supports full text, domain and source filters. Internal links resolve within their own source; ambiguity stays visible. Source versions referenced by knowledge remain readable after reimport. Directly entered materials and domains are persisted in the same store.

AI is explicit. The Host composes `createCogniaProloguePort` using the current Home model-settings catalog and Prologue, with no tools and no filesystem access. No environment-only model adapter is used in production. Select 1–5 text materials for synthesis, or ask a question to retrieve up to 5 materials in the chosen domain. Context is capped at 100,000 characters; it is rejected instead of silently truncated. Inputs are marked untrusted; output must contain valid fixed-source citations. Generated drafts survive restart and enter knowledge only after **Save to knowledge base**. Missing configuration or model failure leaves local reading/import intact. Actual model usage follows the configured provider's billing.

Read-only MCP `cognia.search` / `cognia.read` exports are disabled by default and use the existing plugin-tool switch. MCP only reads imported records, never arbitrary local paths. HTTP mutations use the existing local Host same-origin/control-token gate. Filesystem scanning is POST-only.

Verification:

```sh
pnpm --filter @molis-ai/molis-work-plugin-cognia typecheck
node --import tsx --test tests/cognia-*.test.ts
pnpm boundary:check
```

No cloud sync, background watching, bidirectional sync, proprietary database migration, graph view, Dataview execution, block-reference reconstruction, or PDF/OCR extraction is included.
