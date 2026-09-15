# Temporarily pause CI/CD

## Background and goal

Molis Work currently runs a full `Verify` job for every pull request and push to `main`, and automatically publishes macOS artifacts for version tags. Temporarily pause those automated workloads without deleting the workflow definitions or making the protected `main` branch impossible to merge into.

## Current behavior and evidence

- `.github/workflows/ci.yml` runs type checks, Node tests, Rust tests, and release-version validation on pull requests and pushes to `main`.
- `.github/workflows/release-macos.yml` builds on manual dispatch and on every `v*` tag, then publishes a GitHub Release for tags.
- GitHub rejects direct pushes to `main` and expects the required status check named `Verify`.

## Scope

- Keep a lightweight `Verify` placeholder on pull requests and pushes to `main` so the existing branch-protection rule can resolve successfully.
- Remove all build, test, and release validation from that placeholder job.
- Stop tag-triggered macOS builds and releases.
- Keep the macOS release workflow available through manual dispatch.
- Document the exact trigger and job blocks that must be restored when CI/CD is re-enabled.

## Non-goals

- Do not delete workflow files.
- Do not change application code, dependencies, tests, release scripts, or versioning.
- Do not remove `main` branch protection; the current GitHub integration cannot administer the classic protection rule.

## Acceptance criteria

1. Pull requests and pushes to `main` no longer install dependencies or run project verification commands.
2. A job named `Verify` still completes successfully for the protected branch.
3. Pushing a `v*` tag does not start the macOS release workflow.
4. A maintainer can still start the macOS release workflow manually.
5. Both workflow files remain valid YAML and `git diff --check` passes.

## Verification

- Parse both workflow files as YAML.
- Inspect their trigger and job definitions.
- Run `git diff --check`.
