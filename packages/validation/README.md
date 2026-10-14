# @rental/validation

Shared Zod schemas for application boundaries.

Includes UUIDs, PostgreSQL connection URLs, external identity references, branch
updates and an allowlist for audit metadata. Validation does not establish trust:
external identities must first be verified by the backend authentication adapter,
and tenant selection must pass active membership checks.
