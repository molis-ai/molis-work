---
name: "Developer tools"
summary: "Design around developer workflow, integration contracts, fast feedback, compatibility and debuggability."
applies_to: ["SDKs", "API products", "CLI and developer platforms"]
---

# Developer tools

## Planning path

1. Define the task, workflow, environment and time to success
2. Fix public API, SDK, CLI, configuration and extensions
3. Design installation, first success, feedback, debugging and local-to-CI path
4. Establish versions, deprecation, migration and ecosystem integration
5. Verify real projects, diagnostics, performance and upgrades

## Required coverage

| area | label | question |
| --- | --- | --- |
| developer_job | Developer task | What is the job and its current friction? |
| integration_contract | Integration contract | What are inputs, outputs and errors for API, SDK, CLI, configuration and extensions? |
| time_to_success | First success | What takes discovery through install, authentication and first real result? |
| feedback_debugging | Feedback | Do errors, logs, tracing and diagnostics make the next step clear? |
| compatibility_versioning | Versioning | How do compatibility, deprecation, migrations and environments evolve? |
| docs_examples | Docs and examples | How do they stay aligned with behavior? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| clients-after-contract | SDK, CLI, docs and integrations need stable, testable public contracts. | clients and docs depend_on public contract |
| release-after-compatibility | Release requires compatibility, migration, diagnostics and real project evidence. | release depends_on compatibility evidence |

## Completion evidence

- Time to first success and real path
- Public contract, error and compatibility tests
- Install, upgrade, migration and debug record

## Closeout checks

- Documentation and examples work in a clean environment
- Error messages guide the next action
- Public contract changes have a path for compatibility and migration

## Common mistakes

- Implementing API without testing the workflow
- Substituting source or internal knowledge for docs
- Releasing breaking changes without migration
