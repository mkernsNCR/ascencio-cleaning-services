---
name: Publish schema limits
description: Observed managed-publishing behavior for hand-written PostgreSQL migrations.
---

Do not assume a successful schema-only publish reproduces every feature of the development SQL migrations.

**Why:** Production inspection after publishing found the tables and ordinary constraints present, but migration-history rows, the reservation exclusion constraint, and the booking lifecycle trigger absent. Local startup against a fully migrated development database did not reveal this difference.

**How to apply:** Check critical production constraints and triggers using read-only catalog queries. Distinguish successful server startup from safe booking operation. Use the supported publish flow for managed production schema changes; do not replay development DDL at production startup or bypass read-only production access.
