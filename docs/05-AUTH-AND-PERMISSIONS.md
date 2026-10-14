# 05 - Authentication and Permissions

## Document Status

Status: Draft  
Version: 0.1  
Project: Rental Management and Equipment Tracking Platform

---

# 1. Purpose of This Document

This document defines how users authenticate to the platform and how access to data and actions is controlled.

It describes:

- Platform-level users.
- Organization-level users.
- User invitations.
- Organization memberships.
- Roles.
- Permissions.
- Branch restrictions.
- Multi-organization access.
- Financial-data access.
- Remote-machine permissions.
- Platform support access.
- Backend authorization requirements.
- User deactivation.
- Session and account security expectations.

This document defines WHO may access WHICH information and WHICH actions.

Detailed security architecture is defined separately in:

`10-SECURITY.md`

---

# 2. Authentication vs Authorization

Authentication answers:

> Who is the user?

Authorization answers:

> What is the user allowed to do?

These concepts must remain separate.

Example:

```text
User successfully logs in
        │
        ▼
Authentication successful
        │
        ▼
User requests:
"View machine profitability"
        │
        ▼
Authorization check
        │
        ▼
finance.read permission required
```

A logged-in user must not automatically have access to all functionality.

---

# 3. User Identity

`User` represents a human identity in the platform.

A user may have information such as:

```text
id

name

email

authentication_provider_id

preferred_language

timezone

account_status
```

A user does not directly belong to one organization.

Organization access is provided through:

`Membership`

---

# 4. Organization Membership

A `Membership` connects a user to an organization.

Conceptually:

```text
User
   │
   ▼
Membership
   │
   ▼
Organization
```

Example:

```text
User:
Mehmet Yılmaz

Organization:
ABC Rental

Membership:
ACTIVE

Role:
General Manager
```

A user may theoretically have memberships in multiple organizations.

Example:

```text
User: Mehmet Yılmaz

Membership 1:
ABC Rental
General Manager

Membership 2:
XYZ Rental
Viewer
```

Permissions are evaluated separately for each organization.

---

# 5. Platform Access and Tenant Access

Platform-level administration must remain separate from tenant-level administration.

Conceptually:

```text
                         User

            ┌─────────────┴─────────────┐
            │                           │
            ▼                           ▼

     Platform Access                Membership
            │                           │
            ▼                           ▼

   Platform Roles                Organization
                                       │
                                       ▼
                                  Tenant Roles
```

Platform roles may include:

```text
PLATFORM_ADMIN

PLATFORM_SUPPORT

PLATFORM_OPERATIONS
```

Tenant roles may include:

```text
GENERAL_MANAGER

RENTAL_MANAGER

FLEET_MANAGER

SERVICE_MANAGER

TECHNICIAN

FINANCE

VIEWER
```

A Platform Administrator is not automatically an administrator of every customer organization.

---

# 6. Platform Roles

## 6.1 Platform Administrator

The Platform Administrator manages the SaaS platform itself.

Typical permissions may include:

```text
platform.organization.create

platform.organization.read

platform.organization.update

platform.organization.suspend

platform.subscription.manage

platform.user.read

platform.device.manage

platform.system.read

platform.support.manage
```

A Platform Administrator may:

- Create organizations.
- Activate organizations.
- Suspend organizations.
- Configure subscriptions.
- Invite the initial organization administrator.
- Review system usage.
- Manage platform-level settings.
- Review system health.
- Manage technical device provisioning.

A Platform Administrator must not automatically receive unrestricted access to tenant financial data.

---

## 6.2 Platform Support

Platform Support is intended for technical assistance.

Typical permissions may include:

```text
platform.organization.read

platform.device.read

platform.telemetry.support

platform.support.request_access
```

Platform Support should normally be able to view technical information needed to diagnose problems without automatically seeing:

```text
Rental prices

Machine profitability

Customer contracts

Financial reports
```

---

## 6.3 Platform Operations

Platform Operations may manage technical infrastructure-related functions.

Examples:

```text
Device provisioning

Telemetry configuration

Subscription state

System monitoring

Integration status
```

This role should not automatically have tenant business-data permissions.

---

# 7. Tenant Roles

Tenant roles group organization-level permissions.

The platform should provide a set of default role templates to help new organizations start quickly.

Initial default role templates may include:

```text
General Manager

Rental Manager

Fleet Manager

Service Manager

Technician

Finance

Viewer
```

These role templates are not mandatory for every organization.

Different rental companies may have different organizational structures.

For example, one organization may have separate:

```text
Rental Manager

Service Manager
```

while another organization may use a single:

```text
Operations Manager
```

that combines the relevant responsibilities.

The authorization system must therefore support organization-specific role configuration.

---

## 7.1 Default Role Templates

Default roles should be considered templates provided by the platform.

When a new organization is created, the platform may initially provide a recommended set of roles.

Example:

```text
General Manager

Rental Manager

Fleet Manager

Service Manager

Technician

Finance

Viewer
```

The General Manager or another authorized organization administrator may then:

```text
Enable a role

Disable a role

Rename a role

Create a custom role

Modify allowed permissions

Assign users to roles
```

subject to authorization rules.

---

## 7.2 Enabled and Disabled Roles

Organizations should be able to disable role templates that do not match their organizational structure.

Example:

```text
Organization:
ABC Rental

Enabled Roles:

General Manager
Operations Manager
Technician
Finance

Disabled Default Roles:

Rental Manager
Service Manager
Fleet Manager
```

Disabling a role does not delete historical records associated with that role.

A role that is currently assigned to active users should not be disabled without resolving those assignments.

The application should warn the administrator before disabling an assigned role.

---

## 7.3 Custom Roles

Organizations should be able to create their own roles.

Example:

```text
Role:
Operations Manager
```

with permissions such as:

```text
machine.read

machine.update

rental.read

rental.create

rental.update

maintenance.read

maintenance.create

maintenance.assign

fault.read

telemetry.read
```

Another organization may define:

```text
Branch Supervisor
```

or:

```text
Workshop Manager
```

according to its own structure.

Custom roles belong only to the organization that created them.

---

## 7.4 Role Names vs Permissions

The system must not rely on role names when authorizing actions.

For example, this is incorrect:

```text
if user.role == "Service Manager"
    allow maintenance management
```

Instead:

```text
if user has permission:
maintenance.manage
    allow
```

This allows two organizations to use different role structures while sharing the same authorization system.

Example:

```text
Organization A

Role:
Service Manager

Permissions:
maintenance.manage
```

and:

```text
Organization B

Role:
Operations Manager

Permissions:
maintenance.manage
rental.manage
```

Both users may manage maintenance even though their role names are different.

---

## 7.5 General Manager Role Configuration

The General Manager should normally be able to configure tenant-level roles if the membership contains:

```text
roles.manage
```

Typical role-management actions may include:

```text
Enable Default Role

Disable Default Role

Create Custom Role

Rename Role

Change Role Permissions

Assign Role to User

Remove Role from User
```

The General Manager must not be able to modify platform-level roles such as:

```text
PLATFORM_ADMIN

PLATFORM_SUPPORT

PLATFORM_OPERATIONS
```

---

## 7.6 Protected Administrative Capabilities

Although organization roles are configurable, certain capabilities should require careful handling.

Examples include:

```text
roles.manage

users.manage

finance.manage

device.immobilize

organization.manage
```

The system should prevent an organization from accidentally removing all users capable of administering the organization.

At least one active membership must retain sufficient administrative permissions.

---

## 7.7 Example Organization Structures

The platform should support organizations with different structures.

Example A:

```text
General Manager

Rental Manager

Service Manager

Technician

Finance
```

Example B:

```text
General Manager

Operations Manager

Technician

Accountant
```

Example C:

```text
Owner

Branch Manager

Rental Employee

Workshop Technician
```

The platform should not require every customer to adopt the same organizational chart.

The shared authorization model is based on permissions, not fixed job titles.

Tenant roles group organization-level permissions.

The initial role set may include:

```text
General Manager

Rental Manager

Fleet Manager

Service Manager

Technician

Finance

Viewer
```

Organizations may later be allowed to create custom roles.

Permissions must remain the underlying authorization mechanism.

Role names alone must not be used as the primary backend authorization logic.

---

# 8. General Manager

The General Manager is the highest normal organization-level role.

Typical access may include:

```text
Machines

Rentals

Customers

Maintenance

Telemetry

Finance

Reports

Users

Roles

Branches

Organization Settings
```

Typical permissions may include:

```text
machine.*

rental.*

customer.*

maintenance.*

telemetry.read

finance.read

finance.manage

users.manage

roles.manage

branches.manage

organization.manage
```

Remote machine commands may still require explicit permission rather than being granted automatically.

---

# 9. Rental Manager

The Rental Manager focuses on rental operations.

Typical access:

```text
Machines

Availability

Customers

Rentals

Reservations

Rental Calendar

Delivery / Collection

Basic operational reports
```

Typical permissions:

```text
machine.read

customer.read

customer.create

customer.update

rental.read

rental.create

rental.update

rental.extend

rental.complete

rental.cancel

reservation.manage
```

The Rental Manager should not automatically have access to:

```text
Machine purchase price

Machine ROI

Detailed financial costs

Remote immobilization

User administration
```

---

# 10. Fleet Manager

The Fleet Manager focuses on machine availability and operational fleet control.

Typical permissions:

```text
machine.read

machine.create

machine.update

machine.assign_branch

telemetry.read

device.read

maintenance.read

fault.read

rental.read
```

The Fleet Manager may see machine state and location without necessarily seeing detailed financial information.

---

# 11. Service Manager

The Service Manager manages maintenance operations.

Typical permissions:

```text
machine.read

telemetry.read

fault.read

maintenance.read

maintenance.create

maintenance.update

maintenance.assign

maintenance.complete

document.read

document.upload
```

The Service Manager may create and assign work orders.

Financial access to maintenance costs may be configurable separately.

---

# 12. Technician

The Technician role is designed for field and workshop personnel.

Typical permissions:

```text
machine.read

telemetry.read

fault.read

maintenance.read

maintenance.update_assigned

document.read

document.upload
```

A technician may:

- View assigned work orders.
- View machine location.
- View operating hours.
- View active faults.
- Add notes.
- Add photos.
- Record diagnosis.
- Complete assigned maintenance steps.

A technician should not automatically have access to:

```text
Rental prices

Machine purchase price

Revenue

ROI

Customer financial information

User administration
```

---

# 13. Finance Role

Finance users primarily access financial information.

Typical permissions:

```text
finance.read

finance.manage

rental.read

customer.read

machine.read_financial

report.finance
```

They may see:

```text
Purchase price

Rental revenue

Maintenance cost

Repair cost

Machine profit

ROI

Payback
```

They may not necessarily have operational permissions such as:

```text
maintenance.manage

device.immobilize
```

---

# 14. Viewer

The Viewer role is read-only.

Possible permissions:

```text
machine.read

rental.read

customer.read

maintenance.read

telemetry.read
```

Sensitive areas such as finance may require separate permission.

A Viewer must not be able to modify records.

---

# 15. Permissions

Permissions represent individual authorization capabilities.

Permissions should use stable internal identifiers.

Examples:

```text
machine.read

machine.create

machine.update

machine.archive

machine.assign_branch

customer.read

customer.create

customer.update

rental.read

rental.create

rental.update

rental.extend

rental.complete

rental.cancel

reservation.manage

maintenance.read

maintenance.create

maintenance.update

maintenance.assign

maintenance.complete

fault.read

telemetry.read

device.read

device.assign

device.remove

device.immobilize

finance.read

finance.manage

report.read

document.read

document.upload

document.delete

users.manage

roles.manage

branches.manage

organization.manage
```

Permission identifiers must remain language-independent.

The UI translates their human-readable descriptions.

---

# 16. Role-Permission Relationship

A role contains multiple permissions.

Conceptually:

```text
Role
 │
 ├── Permission
 ├── Permission
 ├── Permission
 └── Permission
```

Example:

```text
Role:
TECHNICIAN

Permissions:

machine.read

telemetry.read

fault.read

maintenance.read

maintenance.update_assigned
```

The backend must check permissions rather than hard-coding rules such as:

```text
if role == "TECHNICIAN"
```

unless the role itself is the actual intended business condition.

---

# 17. Custom Roles

The system should be designed to support organization-specific roles later.

Example:

```text
Role:
Regional Operations Manager
```

with permissions:

```text
machine.read

rental.read

customer.read

maintenance.read

report.read
```

and access only to selected branches.

Custom roles should remain scoped to the organization that created them.

Platform roles cannot be created or modified by tenant administrators.

---

# 18. Branch-Based Access

Organizations may restrict a membership to one or more branches.

Example:

```text
User:
Ahmet

Accessible Branches:

Ankara
Konya
```

The user may be prevented from viewing or modifying data belonging exclusively to:

```text
Istanbul
```

unless granted broader access.

A membership may conceptually have:

```text
ALL_BRANCHES
```

or:

```text
SELECTED_BRANCHES
```

Branch access must be enforced by the backend.

---

# 19. Branch Access and Shared Records

Some entities may not belong exclusively to one branch.

Examples:

```text
Customer used by several branches

Machine transferred between branches

Organization-level document

Organization-wide finance report
```

Branch authorization must therefore be defined per domain rather than implemented as one simplistic global filter.

Detailed behavior may be refined during implementation.

---

# 20. User Invitations

Users should normally join organizations through invitations.

Conceptually:

```text
Organization
      │
      ▼
OrganizationInvitation
      │
      ▼
Email
      │
      ▼
User accepts
      │
      ▼
Membership
```

An invitation may contain:

```text
organization

email

intended_role

branch_access

invited_by

created_at

expires_at

status
```

Possible statuses:

```text
PENDING

ACCEPTED

EXPIRED

REVOKED
```

---

# 21. Initial General Manager Invitation

When a Platform Administrator creates a new organization, they may invite the initial General Manager.

Flow:

```text
Platform Administrator
        ↓
Create Organization
        ↓
Invite Initial Administrator
        ↓
OrganizationInvitation
        ↓
Email
        ↓
User Accepts
        ↓
Membership Created
        ↓
GENERAL_MANAGER Role Assigned
```

After this point, the General Manager should normally manage their own organization users.

---

# 22. Existing User Invitation

If the invited email already belongs to an existing platform user, accepting the invitation should create a new organization membership rather than creating another duplicate user.

Example:

```text
Existing User:
mehmet@example.com

Existing Membership:
Rental Company A

New Invitation:
Rental Company B
```

Result:

```text
One User

Membership 1:
Rental Company A

Membership 2:
Rental Company B
```

---

# 23. Organization Switching

If a user belongs to multiple organizations, the application should provide an organization switcher.

Example:

```text
Current Organization:
ABC Rental

[Switch Organization]

XYZ Rental
```

All data, permissions, and branch access must be re-evaluated after switching organizations.

The application must never combine tenant data from multiple organizations in normal screens.

---

# 24. User Management

Authorized organization administrators should be able to:

```text
Invite User

View Members

Change Role

Change Branch Access

Deactivate Membership

Reactivate Membership

Resend Invitation

Revoke Invitation
```

Organization administrators must not be able to:

```text
Assign Platform Roles

Access Other Organizations

Modify Platform Administrators
```

---

# 25. Membership Deactivation

When an employee leaves a company, their organization membership should normally be deactivated rather than deleting the User identity.

Example:

```text
User:
Ahmet

Membership:
ABC Rental

Status:
INACTIVE
```

Historical records such as:

```text
Work Orders Completed By Ahmet

Rental Edited By Ahmet

Audit Events By Ahmet
```

must remain intact.

---

# 26. User Account Status vs Membership Status

These must remain separate.

Example:

```text
User Account Status:
ACTIVE
```

may coexist with:

```text
ABC Rental Membership:
INACTIVE

XYZ Rental Membership:
ACTIVE
```

The user can still access XYZ Rental.

A disabled global user account prevents access to all organizations.

---

# 27. Financial Permissions

Financial information must be protected separately from normal machine access.

For example:

```text
machine.read
```

must not imply:

```text
finance.read
```

A technician may see:

```text
Machine model

Serial number

Faults

Operating hours
```

while being unable to see:

```text
Purchase price

Revenue

Profit

ROI

Rental rates
```

This separation is fundamental.

---

# 28. Financial Field-Level Visibility

In some pages, the same entity may contain both operational and financial information.

Example:

```text
Machine Detail
```

A user with:

```text
machine.read
```

may see:

```text
Model

Serial Number

Location

Operating Hours
```

while a user with:

```text
finance.read
```

may additionally see:

```text
Purchase Price

Revenue

Profit

ROI
```

The backend must not send restricted financial fields simply because the frontend intends to hide them.

---

# 29. Remote Machine Permissions

Remote machine actions require explicit permissions.

Examples:

```text
device.immobilize

device.enable

device.request_status
```

`GENERAL_MANAGER` should not automatically imply remote-machine control unless the assigned role contains the permission.

Remote-control permissions should be treated as sensitive.

---

# 30. Remote Command Authorization

A remote command requires more than UI visibility.

Conceptually:

```text
User
  │
  ▼
Authenticated?
  │
  ▼
Correct Organization?
  │
  ▼
Permission?
  │
  ▼
Branch Access?
  │
  ▼
Machine Eligible?
  │
  ▼
Safety / Business Rules?
  │
  ▼
Create DeviceCommand
```

Every command must be authorized by the backend.

---

# 31. Sensitive Permission Categories

Some permissions should be classified as highly sensitive.

Examples:

```text
device.immobilize

finance.manage

users.manage

roles.manage

organization.manage

platform.organization.suspend
```

The UI should clearly identify sensitive permissions when administrators assign them.

Future policy may require additional confirmation or MFA for certain actions.

---

# 32. Permission-Aware Navigation

The interface should hide navigation sections the user cannot access.

Example:

A technician without:

```text
finance.read
```

should not see:

```text
Finance
```

A user without:

```text
users.manage
```

should not see:

```text
Administration → Users
```

However, hidden navigation is only a UX feature.

The backend must independently reject unauthorized requests.

---

# 33. Backend Authorization

Every protected API operation must perform authorization on the server.

Incorrect architecture:

```text
Frontend hides Finance button

User manually calls:
GET /api/finance

Server returns data
```

Correct architecture:

```text
GET /api/finance
       │
       ▼
Authentication
       │
       ▼
Organization Membership
       │
       ▼
finance.read?
       │
       ▼
ALLOW / DENY
```

---

# 34. Tenant Isolation

Authorization must always include organization ownership.

Example:

A user in:

```text
Organization A
```

must not access a machine in:

```text
Organization B
```

even if both machine IDs are known.

Conceptually:

```text
User
   │
   ▼
Membership
   │
   ▼
Organization A
   │
   ▼
Machine must belong to Organization A
```

Tenant isolation must not depend on the frontend.

---

# 35. ID Guessing and URL Manipulation

The system must assume users may manually modify URLs or API requests.

Example:

```text
/machines/123
```

changed to:

```text
/machines/124
```

The backend must verify that machine `124` belongs to the active organization and that the user has permission to view it.

Knowledge of an entity ID must never grant access.

---

# 36. Platform Support Access

Platform Support may sometimes need access to customer data for troubleshooting.

Permanent unrestricted access is not preferred.

A future support-access workflow should allow:

```text
Platform Support
       │
       ▼
Request Support Access
       │
       ▼
Organization Approves
       │
       ▼
Temporary Access
       │
       ▼
Access Expires
```

Support access should be:

```text
Time limited

Purpose limited

Audited

Visible to the organization
```

---

# 37. Emergency Support Access

The architecture may later support emergency or break-glass access for serious incidents.

If implemented, it must require strong controls such as:

```text
Explicit reason

Strong authentication

Short expiration

Full audit logging

Customer notification where appropriate
```

This should not be used as normal support access.

---

# 38. Platform Admin Data Visibility

Platform administrators may need visibility into operational SaaS information such as:

```text
Organization Name

Subscription

User Count

Machine Count

Device Count

Telemetry Health

Last Activity
```

They should not automatically see confidential business content such as:

```text
Rental Prices

Machine ROI

Revenue

Profit

Contracts

Customer Financial Information
```

This separation should be maintained in APIs and database-access patterns where practical.

---

# 39. Authentication Provider

Authentication should use an established OpenID Connect-compatible provider.

Possible providers may include:

```text
Auth0

ZITADEL

Keycloak

Other OIDC-compatible provider
```

The application must not implement custom password authentication or custom cryptography unless absolutely necessary.

---

# 40. Login

The login experience should support:

```text
Email

Password
```

or equivalent authentication methods provided by the selected identity provider.

Future authentication options may include:

```text
Google

Microsoft

Enterprise SSO
```

The authentication provider should handle secure credential storage.

---

# 41. Password Reset

Users must have a secure password-reset workflow.

Typical flow:

```text
Forgot Password
      ↓
Enter Email
      ↓
Secure Reset Link
      ↓
Set New Password
```

The application should not reveal whether an arbitrary email address exists in the system through unsafe error messages.

---

# 42. Account Activation

A newly invited user may need to:

```text
Accept Invitation

Create / Confirm Account

Set Password if required

Accept Terms

Enter the Application
```

Invitation tokens must expire.

---

# 43. Multi-Factor Authentication

The architecture should support MFA.

MFA may initially be optional but should be strongly considered for:

```text
Platform Administrators

General Managers

Finance Users

Users with Remote Machine Control
```

Future organization policies may require MFA for specific roles.

---

# 44. Session Management

Users should be able to:

```text
Login

Logout

Remain securely authenticated

Have expired sessions handled cleanly
```

Sessions must be revocable.

Important account changes may invalidate active sessions where appropriate.

Examples:

```text
User disabled

Password changed

Security incident

Membership removed
```

---

# 45. Session Context

Every authenticated tenant request should conceptually know:

```text
user_id

active_organization_id

membership_id

permissions

branch_scope
```

The server must derive trusted authorization context rather than accepting it blindly from client-supplied values.

---

# 46. Language and Authentication

Authentication screens must also support localization.

Examples:

```text
Login

Forgot Password

Invitation Accepted

Invalid Invitation

Session Expired
```

must be displayed according to the user's language or appropriate fallback language.

Internal role and permission identifiers remain language-independent.

---

# 47. Audit Requirements

Important authorization-related actions must create audit records.

Examples:

```text
USER_INVITED

INVITATION_REVOKED

MEMBERSHIP_CREATED

MEMBERSHIP_DEACTIVATED

ROLE_CHANGED

PERMISSIONS_CHANGED

BRANCH_ACCESS_CHANGED

SUPPORT_ACCESS_GRANTED

SUPPORT_ACCESS_REVOKED
```

Audit records should identify:

```text
Actor

Target User

Organization

Action

Timestamp

Relevant Change
```

---

# 48. Role Changes

Role changes should take effect quickly.

Example:

```text
Technician
      ↓
Changed to:
Service Manager
```

The user's effective permissions should update without requiring a new user account.

Existing sessions may need permission refresh.

---

# 49. Preventing Administrative Lockout

The system should avoid accidentally leaving an organization without any user capable of administering it.

For example, the last active user with:

```text
users.manage
```

should not be removable without either:

- another qualified administrator being assigned, or
- a Platform Administrator performing a recovery process.

---

# 50. Self-Permission Changes

Users should not normally be able to grant themselves permissions they do not already have authority to assign.

Example:

A Rental Manager must not be able to edit their own role and add:

```text
finance.read

device.immobilize

roles.manage
```

Role-management authorization must be enforced independently.

---

# 51. Role Assignment Restrictions

A user who can manage users does not necessarily need permission to assign every possible role.

Future rules may include:

```text
Can invite technicians

Can invite rental employees

Cannot assign General Manager

Cannot assign finance access
```

The initial implementation may simplify this, but the architecture should allow assignment restrictions later.

---

# 52. Organization Ownership Concept

The system should not depend on a single permanent `owner_user_id`.

Organizations may have multiple senior administrators.

For example:

```text
Owner

General Manager

Director
```

may all have broad access.

Administrative capability should be controlled through membership permissions.

---

# 53. Subscription and Authorization

Subscription level may determine whether a feature exists for an organization.

Permissions determine whether a user may use that feature.

These are different checks.

Example:

```text
Organization Subscription:
Telemetry Pro
```

enables:

```text
Remote Machine Commands
```

but the user still requires:

```text
device.immobilize
```

Conceptually:

```text
Feature enabled for organization?
        +
User has permission?
        ↓
Action available
```

---

# 54. Feature Entitlements

The platform may later define organization-level feature entitlements.

Examples:

```text
telemetry

advanced_finance

ai_assistant

remote_control

advanced_reports
```

These should remain separate from user permissions.

---

# 55. Permission Evaluation

Authorization should conceptually evaluate:

```text
Authenticated User
       │
       ▼
Active Organization Membership
       │
       ▼
Membership Active?
       │
       ▼
Required Permission?
       │
       ▼
Branch Scope?
       │
       ▼
Entity belongs to organization?
       │
       ▼
Feature enabled?
       │
       ▼
Domain-specific rule?
       │
       ▼
ALLOW
```

Failure at any required step results in denial.

---

# 56. Authorization Errors

The user interface should distinguish appropriate authorization outcomes.

Examples:

```text
You do not have permission to perform this action.
```

or:

```text
This feature is not enabled for your organization.
```

Sensitive information should not be leaked through error messages.

---

# 57. Initial Permission Groups

For administration convenience, permissions may be grouped in the UI.

Example groups:

```text
Machines

Customers

Rentals

Maintenance

Telemetry

Devices

Finance

Reports

Documents

Users

Roles

Branches

Organization

Remote Control
```

This grouping is for usability.

Permission identifiers remain individually defined.

---

# 58. Example Default Roles

The following table represents an initial direction only.

| Capability | General Manager | Rental Manager | Service Manager | Technician | Finance | Viewer |
|---|---:|---:|---:|---:|---:|---:|
| View Machines | Yes | Yes | Yes | Yes | Yes | Yes |
| Edit Machines | Yes | Limited | Limited | No | No | No |
| View Customers | Yes | Yes | Limited | Limited | Yes | Yes |
| Manage Rentals | Yes | Yes | No | No | Limited | No |
| View Telemetry | Yes | Yes | Yes | Yes | Limited | Optional |
| Manage Maintenance | Yes | Limited | Yes | Assigned | No | No |
| View Finance | Yes | Optional | Optional | No | Yes | No |
| Manage Finance | Yes | No | No | No | Yes | No |
| Manage Users | Yes | No | No | No | No | No |
| Manage Roles | Yes | No | No | No | No | No |
| Remote Control | Explicit Permission | Explicit Permission | Explicit Permission | Normally No | No | No |

This table must not replace individual backend permission checks.

---

# 59. Permission Defaults

Default roles should provide sensible starting points.

However, organizations may need different policies.

Example:

One company may allow Service Managers to see maintenance cost.

Another company may prohibit this.

Therefore permissions should be configurable where practical.

---

# 60. Sensitive Data Separation

The authorization system should support separating:

```text
Operational Data

Technical Data

Financial Data

Administrative Data

Remote-Control Capability
```

Access to one category must not automatically imply access to another.

---

# 61. Mobile Permissions

The mobile application uses the same authorization model as the web application.

The mobile app must not create a separate simplified permission system.

Example:

If a technician lacks:

```text
finance.read
```

the mobile application must not expose financial information either.

---

# 62. API Tokens and Machine-to-Machine Access

Future integrations may require non-human access.

Examples:

```text
ERP Integration

Accounting Integration

External BI

Device Integration
```

These should use separate machine-to-machine credentials or service identities rather than ordinary human user accounts.

Detailed implementation belongs in the security architecture.

---

# 63. Service Accounts

If introduced, service accounts must have explicit scopes/permissions.

Example:

```text
Service Account:
Accounting Export

Permissions:

finance.read

customer.read
```

A service account must not automatically inherit organization administrator permissions.

---

# 64. Deletion Rules

Users with historical activity should not normally be physically deleted.

Instead:

```text
User or Membership
        ↓
Deactivate
```

Historical attribution must remain available.

Examples:

```text
Rental created by

Work order completed by

Permission changed by
```

---

# 65. Authorization Testing

Automated tests must cover important security rules.

Examples:

```text
Technician cannot view finance.

Rental Manager cannot assign platform role.

Organization A user cannot read Organization B machine.

User without device.immobilize cannot immobilize machine.

Inactive membership cannot access organization.

Branch-restricted user cannot access unauthorized branch data.

Viewer cannot modify rental.

Platform Admin does not automatically receive tenant finance permission.
```

Authorization tests are mandatory for sensitive functionality.

---

# 66. Initial Authentication and Authorization Scope

The first release should support:

```text
User authentication

Password reset

Organization invitation

Membership creation

Default tenant roles

Permission-based authorization

Branch access

User deactivation

Organization switching where applicable

Platform Admin

Platform Support

Tenant User Administration

Financial permission separation

Remote-control permission separation

Audit logging for permission changes
```

Advanced enterprise features may be introduced later.

---

# 67. Future Capabilities

Potential future authentication and authorization capabilities include:

```text
Multi-factor authentication policies

Microsoft Entra ID integration

Google Workspace integration

Enterprise SSO

SCIM provisioning

Custom organization roles

Advanced branch restrictions

Attribute-based access control

Temporary support access

Emergency access

IP restrictions

Device trust policies
```

These are not required for the first release unless a customer requirement makes them necessary.

---

# 68. Fundamental Authorization Rules

The following rules are considered mandatory.

1. Authentication and authorization are separate concerns.

2. A user does not directly belong to one organization.

3. Organization access is represented through Membership.

4. Platform roles and tenant roles are separate.

5. Tenant permissions are evaluated within the active organization.

6. Role names must not replace permission checks.

7. Financial information requires explicit financial permission.

8. Remote machine control requires explicit sensitive permission.

9. Hidden UI elements do not replace backend authorization.

10. Tenant ownership must be checked for every tenant-owned entity.

11. Branch restrictions must be enforced by the backend.

12. Deactivating a membership must preserve historical audit information.

13. Platform administrators must not automatically receive unrestricted tenant business-data access.

14. Permission changes must be auditable.

15. Knowledge of an entity identifier must never grant access.

16. Feature subscription and user permission are separate concepts.

17. Sensitive actions should be designed for future MFA or additional confirmation requirements.

---

# 69. Related Documentation

Project overview:

`01-PROJECT-OVERVIEW.md`

System architecture:

`02-SYSTEM-ARCHITECTURE.md`

Domain model:

`03-DOMAIN-MODEL.md`

UI / UX:

`04-UI-UX.md`

Telemetry and IoT:

`06-TELEMETRY-IOT.md`

Rental business rules:

`07-RENTAL-BUSINESS-RULES.md`

Security:

`10-SECURITY.md`