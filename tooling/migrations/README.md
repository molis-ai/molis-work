# Molis Work migration tooling

This directory contains one-off operator tools for architecture and data migrations. It is deliberately not a workspace package and does not expose a stable API.

## Goal lifecycle migration audit

GW2 moved the runtime schema and reconciliation migrations into the Goals Module public entrypoint. The Store calls those functions during startup; the compatibility Store no longer contains a second implementation.

Before and after upgrading an existing database, run:

```bash
node tooling/migrations/audit-goal-lifecycle.mjs /absolute/path/to/molis-work.sqlite
```

The audit is read-only. It checks the required migration markers and reports historical states that should have been reconciled. A non-zero exit means the database should not be treated as migrated yet.

The migration functions themselves are transaction-bound. If any schema write, reconciliation write, or audit event fails, the migration marker and every earlier write in that migration are rolled back together.

## Project identity migration audit

AP1 makes `project_id` the formal Project identity and keeps `board_id` only as the V1 database identity. Before and after upgrading an existing Project Catalog, run:

```bash
node tooling/migrations/audit-project-identity.mjs /absolute/path/to/catalog.db
```

This audit opens the Catalog read-only. It checks ownership/version metadata, the Projects Module tables, unique identities and database paths, the `project_id`/`board_id` compatibility rule, migrated Board mappings, and workspace membership references. It never rewrites Project facts.
