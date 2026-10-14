# @rental/permissions

Stable permission definitions; enforcement belongs on the backend.

Contains the minimal tenant/platform permission catalog and exact-match permission
evaluation. Wildcards and role-name checks are not supported. Tenant permission
collections are loaded from active memberships by the API; clients never supply
effective grants. No default roles are seeded before organization onboarding exists.
