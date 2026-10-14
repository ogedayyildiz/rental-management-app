# Security

**Document:** `10-SECURITY.md`  
**Status:** Initial Architecture Definition  
**Scope:** Tenant isolation, API security, telemetry/device security, secrets, encryption, remote commands, file security, infrastructure protection, logging, backups, and incident readiness.

---

## 1. Purpose

The security architecture protects:

- organization data;
- machine data;
- financial information;
- rental and maintenance records;
- uploaded documents;
- telemetry;
- tracking devices;
- provider credentials;
- user sessions;
- remote machine commands;
- platform infrastructure.

Security must be enforced primarily by the backend and infrastructure rather than relying on frontend behavior.

Authentication and permissions answer:

```text
Who is allowed to perform an action?
```
This document focuses on:
How data, infrastructure, devices, secrets, and commands are protected.

# 2. Security Principles
The platform should follow these principles:
Least Privilege

Defense in Depth

Secure by Default

Tenant Isolation

Explicit Trust Boundaries

Server-Side Enforcement

Auditable Sensitive Actions

Minimal Secret Exposure

Fail Closed Where Security Is Uncertain

Security-sensitive functionality should not depend on hidden buttons or frontend-only checks.
# 3. Tenant Isolation
Every tenant-owned business record must belong to an Organization.

Examples include:

- Machines
- Customers
- Rentals
- Work Orders
- Telemetry
- Financial Records
- Documents
- Users' Memberships
- Reports
- Device Installations

Every backend operation must resolve the active organization and enforce tenant scope.
A user belonging to Organization A must never be able to access Organization B's data merely by changing:

- URL parameters
- API request IDs
- Machine IDs
- Rental IDs
- Document IDs
- Device IDs

Tenant isolation must be tested at the backend and database-access layer.
# 4. Platform Access vs Tenant Access
Platform-level administrative access must remain separate from normal organization memberships.

A platform administrator may need to perform actions such as:
```
Create Organization

Suspend Organization

Manage Subscription

Review Technical System Health

Resend Initial Administrator Invitation
```
This must not automatically grant access to:
```
Rental Prices

Machine Acquisition Costs

Profitability

Customer Contracts

Internal Maintenance Notes

Tenant business-data access should require explicit authorized support access where such functionality is introduced.
```
# 5. Support Access
Future support access to customer data should be:
Explicit

Time-Limited

Audited

Purpose-Limited

Where practical, support access should require customer approval.
The audit trail should record:
support_user
organization
reason
approved_by
started_at
expires_at
actions_performed

Permanent unrestricted support impersonation should be avoided.
# 6. API Security
The web and mobile applications must communicate through the backend API.
They must not directly access:
PostgreSQL
TimescaleDB
Redis
Provider Credentials
Telemetry Broker
Ruptela TCP Listener
Internal Infrastructure Services

The backend API must enforce:
- authentication;
- authorization;
- tenant scope;
- input validation;
- rate limits where appropriate;
- output filtering;
- audit requirements.
Sensitive business logic must never rely exclusively on frontend validation.
# 7. Input Validation
All external input must be treated as untrusted.
This includes:
Web Requests
Mobile Requests
Telemetry Packets
Provider API Data
Uploaded Files
Webhook Payloads
Import Files
Query Parameters
URLs
User-Entered Text

Structured application input should be validated using shared schemas such as Zod where appropriate.
Validation should cover:
Type
Length
Allowed Values
Format
Required Fields
Numeric Ranges
Identifiers
Unexpected Fields

Validation does not replace authorization.
# 8. Database Security
Application databases should not be publicly exposed to the internet.
Database access should be limited to authorized backend infrastructure.
Production database credentials must not be:
Stored in frontend code

Committed to Git

Included in mobile applications

Included in public configuration files

Production access should use separate credentials from development and testing environments.
Where practical, application database roles should receive only the permissions they actually require.
# 9. Sensitive Financial Data
Financial information is particularly sensitive.
Examples include:
Machine Purchase Cost
Acquisition Cost
Revenue
Margin
Profitability
ROI
Customer Pricing
Maintenance Costs
Resale Estimates

Backend responses should exclude unauthorized financial fields rather than merely hiding those fields in the user interface.
Exports must apply the same restrictions.
Logging should avoid unnecessarily recording sensitive commercial values.
# 10. Encryption
Data in transit should use encryption wherever supported.
Web and mobile communication must use:
HTTPS / TLS

Provider integrations should use secure transport mechanisms whenever the provider supports them.
Sensitive data at rest should rely on infrastructure-level encryption such as encrypted:

- Database Storage
- Object Storage
- Backups
- Secrets

The application should not invent custom cryptographic algorithms.

Use well-established platform and library implementations.

# 11. Secrets Management
Secrets include:

- Database Passwords
- OIDC Secrets
- Provider API Tokens
- Ruptela Credentials
- Xtellio Credentials
- Encryption Keys
- Object Storage Credentials
- Email Credentials
- Push Notification Credentials
- Third-Party API Keys

Secrets must never be committed into the repository.

Production secrets should be stored in an appropriate secret-management system.

Applications should access them through secure runtime configuration.

Secrets should be rotatable without requiring source-code changes.

# 12. Environment Separation

At minimum, separate:
- Development

- Staging

- Production

These environments should use separate:
- Databases
- Credentials
- Provider Configuration
- Storage
- Secrets

Development systems must not casually connect to production machine control infrastructure.
Production remote commands must not be executable from test environments.

# 13. Telemetry Endpoint Security
Telemetry ingestion is a separate trust boundary from the normal application API.
For Ruptela:
```
Ruptela Device
      ↓
Public TCP Telemetry Endpoint
      ↓
Telemetry Ingestion Service
```

The telemetry listener must treat every incoming connection as untrusted until the device is resolved and accepted.

An incoming provider/device identifier must be mapped through:
```
Provider Device Identity
      ↓
TrackingDevice
      ↓
DeviceInstallation
      ↓
Machine
      ↓
Organization
```

Unknown devices must not automatically create trusted machines, installations, or tenant access.

# 14. Device Identity
Tracking-device identity may rely on provider-specific identifiers such as:
IMEI
Provider Device ID
Hardware ID
Certificate
API Identity

A device claiming a known identifier must not automatically be considered fully trustworthy if the provider protocol supports stronger authentication methods.
The architecture should allow stronger device authentication to be added without redesigning the machine domain.
Device identity must remain separate from machine identity.

# 15. Telemetry Data Trust
Telemetry data may be:
Delayed
Duplicated
Malformed
Corrupted
Out of Order
Unexpected
Incorrectly Configured

Telemetry ingestion must validate protocol structure and expected ranges where possible.
Provider data should not directly modify rental, maintenance, finance, or safety-critical state without domain validation.
For example:
GPS shows machine at depot

must not automatically mean:
Rental Completed

and:
Fault disappears

must not automatically mean:
Machine Repaired

# 16. Provider Integration Security
Each telemetry provider must be isolated behind a provider adapter.
Provider-specific:
Credentials
Payloads
Protocols
Endpoints
Tokens
Device IDs

must remain inside the integration boundary.
The core business domain should consume normalized information rather than provider credentials or raw API structures.
A compromise or outage affecting one provider should not automatically compromise unrelated providers or the rental application.
# 17. Remote Command Security
Remote commands are among the most security-sensitive functions in the system.
Examples include:
Immobilize Machine
Enable Machine
Change Device Output
Reset Device
Change Configuration

A request to perform a command is not equivalent to successful execution.
The command lifecycle should preserve states such as:
REQUESTED
QUEUED
SENT
ACKNOWLEDGED
FAILED
EXPIRED

The UI must never display:
Machine Locked

merely because a request was submitted.
# 18. Remote Command Authorization and Safety
Remote commands must require explicit permissions.
Example:
machine.remote_control
machine.immobilize

Sensitive commands may additionally require:
Reason
Confirmation
Recent Authentication
Audit Record

where appropriate.
The cloud platform must not bypass physical machine safety systems.
The machine/controller must remain responsible for determining whether the requested physical action can safely occur.
Remote immobilization must use an engineered safe inhibit mechanism rather than blindly interrupting hazardous machine power.
# 19. Command Idempotency and Expiry
Every remote command should have a unique command identifier.
Repeated API requests must not unintentionally execute the same physical command multiple times.
Commands should support expiry.
Example:
Immobilize when safe
Requested:
10:00

Expiry:
10:10

If the device reconnects at 15:00, an expired safety-sensitive command should not automatically execute unless explicitly designed to do so.
Command retry behavior must distinguish:
Message Delivery Retry

from:
Physical Action Retry

These are not necessarily equivalent.
# 20. Audit Logging
Security-sensitive actions must generate audit records.
Examples include:
Login Security Events
Role Changes
Permission Changes
User Deactivation
Organization Changes
Support Access
Financial Data Changes
Machine Service Blocks
Remote Commands
Telemetry Device Assignment
Provider Configuration Changes
Exports
Document Access Where Required

Audit records should generally include:
organization
user
action
entity
timestamp
result
source
relevant_before_after_values
reason where required

Audit records themselves must be protected from casual modification or deletion.

# 21. File and Document Security
Uploaded files must be treated as untrusted.
Documents should be stored in private object storage unless explicitly published.
Access should be provided through authorized backend-controlled mechanisms or time-limited signed URLs where appropriate.
File access must follow:
Tenant Isolation
Permissions
Document Ownership

The system should validate:
Allowed File Types
File Size
Metadata
Storage Path

and should remain capable of adding malware scanning where required.
A user must not gain access to another organization's document by guessing a storage key or URL.
# 22. Export Security
PDF and XLSX exports may contain highly sensitive information.
Examples:
Customer Prices
Machine Costs
Maintenance Costs
Revenue
Profitability
Technical History
Customer Names
Internal Notes

Exports must be generated according to the requesting user's permissions.
An export endpoint must not become a way to bypass normal field-level restrictions.
Where useful, sensitive exports should be audited.
Externally shareable reports should use dedicated report profiles that exclude confidential information.
# 23. Logging and Observability
Application logs are required for:
Debugging
Security Monitoring
Incident Investigation
Provider Failures
Telemetry Problems
Remote Command Diagnosis

However, logs should avoid unnecessary exposure of:
Passwords
Access Tokens
Refresh Tokens
API Secrets
Full Authentication Headers
Provider Secrets
Sensitive Customer Data

Structured logging should support correlation IDs so related activity can be traced across services.

Sentry and OpenTelemetry may be used according to the architecture defined in:

02-SYSTEM-ARCHITECTURE.md.
# 24. Rate Limiting and Abuse Protection
Public-facing endpoints should have appropriate abuse protection.
Examples include:
Login
Password Reset
Invitation Acceptance
Public API Endpoints
File Uploads
Expensive Reports
Remote Command Requests

Rate limiting must not accidentally break legitimate telemetry device traffic.
Telemetry traffic requires provider/device-specific controls rather than assuming the same limits as human-facing REST APIs.
Repeated invalid device connections, failed authentication, or malformed packets should be observable.
# 25. Backups and Recovery
Production data must be backed up according to an explicit recovery policy.
Backups should include, where applicable:
PostgreSQL Data
TimescaleDB Data
Critical Object Storage
Configuration Required for Recovery

Backups must be protected with appropriate encryption and access controls.
A backup is not considered reliable merely because it exists.
Recovery procedures should be tested periodically.
The platform should eventually define:
RPO
Recovery Point Objective

RTO
Recovery Time Objective

according to business requirements.
# 26. Dependency, Deployment, and Infrastructure Security
Production deployments should use controlled CI/CD processes.
Dependencies should be kept reasonably current and reviewed for known vulnerabilities.
Production deployments should avoid:
Manual Untracked Server Changes

Shared Administrator Credentials

Unversioned Configuration Changes

Secrets Embedded in Images

Infrastructure definitions should be version controlled where practical, for example through Terraform.
Containers should run with minimal required privileges.
Only required network ports should be exposed publicly.
Development tools and debug interfaces must not be publicly available in production.
# 27. Incident Readiness and Fundamental Security Rules
The platform should be designed so security incidents can be investigated.
Relevant records may include:
Audit Events
Authentication Events
Deployment History
Provider Events
Remote Command History
Application Logs
Infrastructure Logs

The system should eventually define procedures for credential compromise, unauthorized access, telemetry abuse, accidental data exposure, provider compromise, lost devices, and suspicious remote-command activity.
The following rules are architectural requirements:
1. Tenant boundaries must be enforced by the backend.
2. Platform administration must remain separate from tenant business-data access.
3. Support access should be explicit, limited, and audited.
4. Frontend hiding is not authorization.
5. Unauthorized financial data should not be returned by APIs.
6. Databases must not be publicly exposed.
7. Secrets must not be committed to source control.
8. Production secrets must be independently manageable and rotatable.
9. Development, staging, and production environments must remain separated.
10. Unknown telemetry devices must not automatically become trusted.
11. Device identity and machine identity are separate concepts.
12. Provider-specific security details must remain behind provider adapters.
13. Telemetry is untrusted input until validated.
14. Telemetry must not directly control contractual or maintenance state.
15. Remote command requests are not proof of physical execution.
16. Remote commands require permission, auditability, idempotency, expiry, and appropriate acknowledgement handling.
17. The cloud must not bypass machine-level physical safety.
18. Sensitive documents and exports require server-side authorization.
19. Audit records must be protected from casual modification.
20. Logs must not intentionally expose passwords, tokens, or secrets.
21. Production data requires tested backups and recovery procedures.
22. Only required network services should be publicly exposed.
23. Infrastructure and deployment changes should be traceable.
24. Security-sensitive behavior should fail closed where authorization or identity is uncertain.
28. Related Documents
This document should be read together with:
02-SYSTEM-ARCHITECTURE.md
03-DOMAIN-MODEL.md
04-UI-UX.md
05-AUTH-AND-PERMISSIONS.md
06-TELEMETRY-IOT.md
07-RENTAL-BUSINESS-RULES.md
08-MAINTENANCE.md
09-FINANCE-ANALYTICS.md
11-CODING-STANDARDS.md

Responsibility boundaries:
AUTH AND PERMISSIONS
→ identity, memberships, roles, permissions

SECURITY
→ trust boundaries, secrets, protection, remote-command security,
  data exposure, infrastructure, auditing and recovery

TELEMETRY
→ provider/device communication and normalized telemetry

RENTAL / MAINTENANCE / FINANCE
→ business rules inside their respective domains