# 04 - UI / UX

## Document Status

Status: Draft  
Version: 0.1  
Project: Rental Management and Equipment Tracking Platform

---

# 1. Purpose of This Document

This document defines the user interface structure, navigation, major pages, common user journeys, and user-experience principles of the platform.

It describes:

- Which application areas exist.
- Which pages users can access.
- How users navigate between pages.
- What information is displayed on major screens.
- Which actions are available.
- How permissions affect the interface.
- How desktop and mobile experiences differ.
- How language selection affects all user-facing content.
- How loading, empty, error, warning, and confirmation states behave.

This document primarily describes the structure and behavior of the application.

Exact visual styling may evolve during implementation while preserving the workflows defined here.

---

# 2. Language and Internationalization Rule

This documentation uses English names for pages, buttons, navigation items, statuses, and other interface elements.

These English names are conceptual names only.

They must NOT be hard-coded into the application interface.

Every user-facing string must be translated according to the user's selected language.

For example, this documentation may refer to:

```text
Dashboard

Machines

Customers

Rentals

Maintenance

Finance

Add Machine

Save

Cancel
```

A Turkish user may instead see:

```text
Gösterge Paneli

Makineler

Müşteriler

Kiralamalar

Bakım

Finans

Makine Ekle

Kaydet

İptal
```

The actual wording must come from translation resources.

Conceptually:

```text
Navigation item:
machines.title
```

may render as:

```text
English:
Machines

Turkish:
Makineler
```

The same rule applies to:

- Page titles.
- Menu items.
- Buttons.
- Form labels.
- Table headings.
- Tooltips.
- Error messages.
- Success messages.
- Confirmation dialogs.
- Notifications.
- Machine states.
- Rental states.
- Maintenance states.
- Financial terminology.
- Date formatting.
- Number formatting.
- Currency formatting.

No user-facing English text should be embedded directly throughout application components.

---

# 3. Language Selection

The system must support at least:

```text
English

Turkish
```

from the initial product phase.

Additional languages may be added later.

Language may be selected:

- During login or onboarding.
- From the user's profile.
- From application settings.

Each organization may also have a default language.

The priority should generally be:

```text
User Preferred Language
        ↓
Organization Default Language
        ↓
Application Default Language
```

Changing the language should update the interface without requiring a new user account.

Where technically practical, the change should take effect immediately.

---

# 4. General UX Principles

The platform should feel like a professional industrial business application.

The interface should prioritize:

- Clarity.
- Speed.
- Readability.
- Consistency.
- Low training requirement.
- Fast access to important machine information.
- Clear separation between operational and financial data.
- Safe handling of destructive or remote actions.

The application should avoid unnecessary visual complexity.

The interface should not look like a consumer social application.

It should feel suitable for:

- Rental managers.
- Fleet managers.
- Service technicians.
- Company owners.
- Finance employees.

---

# 5. Desktop Application Structure

The web application should use a persistent primary navigation structure.

A typical desktop layout may resemble:

```text
┌─────────────────────────────────────────────────────────┐
│ Logo                    Search        Alerts   Profile  │
├───────────────┬─────────────────────────────────────────┤
│               │                                         │
│ Dashboard     │                                         │
│               │                                         │
│ Fleet         │              PAGE CONTENT               │
│ Rentals       │                                         │
│ Customers     │                                         │
│ Maintenance   │                                         │
│ Finance       │                                         │
│ Reports       │                                         │
│               │                                         │
│ Administration│                                         │
│               │                                         │
└───────────────┴─────────────────────────────────────────┘
```

The left navigation should remain consistent across pages.

Navigation items should appear or disappear according to permissions.

---

# 6. Main Navigation

The initial tenant application navigation should approximately contain:

```text
Dashboard

Fleet
    Machines
    Map
    Tracking Devices

Rentals
    Rentals
    Reservations
    Calendar

Customers

Maintenance
    Work Orders
    Maintenance Due
    Faults

Finance
    Overview
    Machine Performance
    Financial Records

Reports

Documents

Administration
    Users
    Roles & Permissions
    Branches
    Organization Settings
```

The exact wording displayed to users is language-dependent.

The menu should not display sections the current user has no permission to access.

For example, a technician without:

```text
finance.read
```

should not see:

```text
Finance
```

in the navigation.

Hiding a menu item does not replace backend authorization.

---

# 7. Application Header

The primary application header may contain:

```text
Global Search

Notifications

Current Organization

Current Branch

Language

User Profile
```

Depending on screen size, some items may move into menus.

---

# 8. Global Search

Users should be able to quickly search important entities.

Examples:

```text
Fleet number

Machine serial number

Machine model

Customer name

Rental number

Tracking device IMEI
```

Example:

```text
Search:
AWP-0042
```

may return:

```text
Machine
AWP-0042
Galen ES1012

Current Customer:
ABC Construction

Status:
Rented
```

Search results must respect user permissions and organization boundaries.

---

# 9. Dashboard

The dashboard is the default operational overview.

The exact cards shown depend on user permissions.

Possible dashboard components include:

## Fleet Summary

```text
Total Machines

Available

Reserved

Rented

Maintenance

Out of Service
```

## Connectivity Summary

```text
Online

Offline

Unknown
```

## Maintenance Summary

```text
Maintenance Due Soon

Maintenance Overdue

Open Work Orders

Active Critical Faults
```

## Rental Summary

```text
Active Rentals

Reservations Starting Soon

Rentals Ending Soon

Overdue Returns
```

## Financial Summary

For authorized users:

```text
Revenue This Month

Fleet Revenue

Fleet Profit

Average Utilization

Machines Near Payback
```

## Map Summary

A small fleet-location map may be displayed.

## Alerts

Examples:

```text
Machine offline

Critical fault

Low battery

Rental ending soon

Maintenance due

Remote command failed
```

Dashboard cards should normally be clickable and open the relevant filtered page.

Example:

```text
Maintenance Due: 7
```

clicking it opens:

```text
Maintenance
→ Maintenance Due
→ Filter: Due
```

---

# 10. Fleet - Machines Page

The Machines page is one of the primary operational pages.

The default view should be a searchable and filterable table.

Example columns:

```text
Fleet No.

Machine

Category

Serial Number

Branch

Rental State

Service State

Connectivity

Current Customer

Location

Operating Hours

Battery SOC

Last Seen
```

Not every column needs to be visible by default.

Users should be able to configure relevant columns where practical.

---

# 11. Machine Filters

Useful filters include:

```text
Category

Manufacturer

Model

Branch

Rental State

Service State

Connectivity State

Customer

Maintenance Due

Fault Present

Tracked / Untracked
```

Filters should be combinable.

Example:

```text
Category:
Scissor Lift

Branch:
Ankara

Rental State:
Available

Service State:
Operational
```

This should quickly answer:

> Which operational scissor lifts are available in Ankara?

---

# 12. Machine List Actions

Depending on permission, actions may include:

```text
View Machine

Add Machine

Edit Machine

Archive Machine

Assign Tracking Device

Create Rental

Create Work Order

Upload Document
```

Sensitive actions should not be placed too close to frequently used safe actions.

---

# 13. Add Machine

The Add Machine workflow should use a structured form.

Possible sections:

```text
Basic Information

Machine Model

Technical Information

Ownership

Branch

Tracking

Financial Information

Documents
```

Not every user should see every section.

For example:

A fleet employee may create basic machine information while purchase price may only be accessible to finance-authorized users.

---

# 14. Machine Detail Page

The Machine Detail page is one of the central screens of the platform.

The page header should immediately communicate the identity and current state of the machine.

Example:

```text
GALEN ES1012

Fleet No:
AWP-0042

Serial:
ES1012-00214

Rental:
RENTED

Service:
OPERATIONAL

Connectivity:
ONLINE
```

Quick actions may include:

```text
Edit

Create Rental

Create Work Order

View on Map

Upload Document

Remote Actions
```

depending on permissions.

---

# 15. Machine Detail Tabs

The machine detail page should approximately contain:

```text
Overview

Location

Telemetry

Rentals

Maintenance

Faults

Finance

Documents

Activity
```

Tabs must appear according to permissions and machine capabilities.

For example, an untracked machine may not require a detailed Telemetry tab.

A technician without financial permission should not see the Finance tab.

---

# 16. Machine - Overview Tab

The Overview tab should provide the most important machine information without requiring navigation to other tabs.

Possible sections include:

## Identity

```text
Fleet Number

Manufacturer

Model

Category

Serial Number

Year
```

## Current State

```text
Rental State

Service State

Operational State

Connectivity State
```

## Current Assignment

```text
Current Customer

Rental Number

Rental Start

Rental End
```

## Location

```text
Last Known Address

Last Seen

Small Map
```

## Telemetry Summary

Where available:

```text
Battery SOC

Operating Hours

Machine Active / Idle

Speed

Active Faults
```

## Maintenance

```text
Next Service

Hours Remaining

Open Work Orders
```

---

# 17. Machine - Location Tab

The Location tab should display:

```text
Current / Last Known Position

Map

Coordinates

Readable Address

Last GPS Update

Location History
```

Future features may include:

```text
Geofence History

Trip History

Customer Site Detection
```

The interface must clearly distinguish:

```text
Current Position
```

from:

```text
Last Known Position
```

when the device is offline.

---

# 18. Machine - Telemetry Tab

The Telemetry tab displays machine technical data.

Examples:

```text
Battery SOC

Operating Hours

Machine Activity

Speed

Charge State

Battery Temperature

Energy Use

Other Machine-Specific Signals
```

Historical values may be displayed as charts.

Example:

```text
Battery SOC
Last 24 hours

100 ┤
 80 ┤
 60 ┤
 40 ┤
 20 ┤
  0 ┼──────────────────
```

Users should be able to select time ranges such as:

```text
24 Hours

7 Days

30 Days

Custom
```

Telemetry values unavailable for a machine should not be displayed as misleading zeros.

They should be:

```text
Not Available
```

or omitted where appropriate.

---

# 19. Machine - Rentals Tab

The Rentals tab displays the rental history of the machine.

Possible columns:

```text
Rental Number

Customer

Assigned At

Released At

Rental Start

Rental End

Status

Revenue
```

Financial columns must only appear for users with financial permission.

This tab should answer:

> Who has rented this machine and when?

---

# 20. Machine - Maintenance Tab

The Maintenance tab may display:

```text
Next Maintenance

Operating Hours

Hours Until Service

Calendar Due Date

Open Work Orders

Completed Work Orders

Maintenance Cost
```

Possible actions include:

```text
Create Work Order

Complete Work Order

Schedule Maintenance
```

Cost information is permission-controlled.

---

# 21. Machine - Faults Tab

The Faults tab should distinguish:

```text
Active Faults

Historical Faults
```

Possible information:

```text
Fault Code

Description

Severity

First Seen

Last Seen

Status

Occurrence Count
```

A technician may be able to open a fault and see:

```text
Technical explanation

Relevant manual

Troubleshooting instructions

Related work orders
```

Future AI assistance may be launched from this screen.

---

# 22. Machine - Finance Tab

This tab is only visible to authorized users.

Possible information includes:

```text
Purchase Price

Total Acquisition Cost

Lifetime Rental Revenue

Maintenance Cost

Repair Cost

Other Cost

Profit

ROI

Payback Progress
```

Charts may show:

```text
Monthly Revenue

Cumulative Revenue

Cumulative Cost

Cumulative Cash Flow
```

The Finance tab must never be exposed simply because the user can view the machine.

---

# 23. Machine - Documents Tab

Documents may include:

```text
Manuals

Service Manuals

Certificates

Inspection Reports

Photos

Purchase Documents

Other Files
```

Possible actions:

```text
Upload

Preview

Download

Rename

Archive
```

depending on permission.

---

# 24. Machine - Activity Tab

The Activity tab provides a chronological history of important events.

Examples:

```text
Machine created

Tracking device installed

Rental started

Fault detected

Maintenance opened

Maintenance completed

Tracking device replaced

Rental completed

Machine moved to another branch
```

Sensitive actions should identify the responsible user where appropriate.

---

# 25. Map Page

The Map page should provide a fleet-wide geographical view.

Machines may be represented by markers.

Marker appearance may indicate information such as:

```text
Available

Rented

Maintenance

Offline

Critical Fault
```

The interface should avoid trying to represent too many statuses through color alone.

Selecting a machine should display a quick-information card.

Example:

```text
GALEN ES1012
AWP-0042

Status:
Rented

Customer:
ABC Construction

Battery:
74%

Last Seen:
2 minutes ago

[Open Machine]
```

---

# 26. Tracking Devices Page

The Tracking Devices page is primarily intended for administrators and technical users.

Possible table columns:

```text
Provider

IMEI

Device Model

Assigned Machine

Installation Date

Firmware

Last Seen

Status
```

Useful filters include:

```text
Installed

Uninstalled

Online

Offline

Provider

Firmware Version
```

Possible actions:

```text
View Device

Assign to Machine

Remove from Machine

View Installation History
```

---

# 27. Rentals Page

The Rentals page displays commercial rental transactions.

Possible columns:

```text
Rental Number

Customer

Start Date

End Date

Status

Branch

Machines

Total Value
```

Financial information must be permission-controlled.

Useful filters include:

```text
Draft

Reserved

Active

Ending Soon

Completed

Cancelled

Customer

Branch

Date Range
```

---

# 28. Rental Detail Page

A Rental Detail page may contain:

```text
Overview

Items

Machines

Delivery / Collection

Financials

Documents

Activity
```

The header should show:

```text
Rental Number

Customer

Status

Start Date

End Date
```

Important actions may include:

```text
Edit

Assign Machine

Start Rental

Extend Rental

Replace Machine

Complete Rental

Cancel Rental
```

Actions should only appear when valid for the current rental state.

---

# 29. Create Rental Workflow

A typical rental creation flow may be:

```text
Create Rental
      ↓
Select Customer
      ↓
Select Dates
      ↓
Add Rental Items
      ↓
Select Equipment Requirement
      ↓
Set Price
      ↓
Select Delivery Information
      ↓
Assign Specific Machine
      ↓
Review
      ↓
Save / Reserve
```

The system should allow a rental item to be created before selecting the exact physical machine where business rules allow it.

Example:

```text
1 × 12 m Scissor Lift
```

may be reserved first.

Later:

```text
AWP-0042
```

may be assigned.

---

# 30. Rental Machine Replacement

The UI should support replacing a machine during an active rental without losing history.

Example:

```text
Rental R-2026-001
        │
        ▼
Machine A
        │
     develops fault
        │
        ▼
[Replace Machine]
        │
        ▼
Machine B
```

The user should specify:

```text
Replacement Machine

Replacement Date / Time

Reason

Notes
```

The original machine assignment remains in history.

---

# 31. Reservations

Reservations represent future equipment commitments.

The Reservations page should help users understand future availability.

Possible views:

```text
List

Calendar
```

Important information includes:

```text
Customer

Equipment Requirement

Specific Machine if assigned

Start Date

End Date

Status
```

---

# 32. Rental Calendar

The calendar should visually display machine commitments over time.

Example:

```text
             Oct 1   Oct 2   Oct 3   Oct 4   Oct 5

AWP-001      RENTED  RENTED  RENTED

AWP-002                      RESERVED RESERVED

AWP-003      MAINT.  MAINT.

AWP-004      AVAILABLE
```

The calendar should help answer:

> Which machines are available next week?

Filtering should be available by:

```text
Branch

Machine Category

Model

Machine
```

---

# 33. Customers Page

The Customers page should contain:

```text
Search

Filters

Customer Table

Add Customer
```

Possible table columns:

```text
Customer Number

Customer Name

Type

City

Contact

Active Rentals

Lifetime Rentals

Status
```

Sensitive financial information should remain permission-controlled.

---

# 34. Customer Detail Page

Possible tabs include:

```text
Overview

Contacts

Addresses

Rentals

Machines Currently Rented

Documents

Financials

Activity
```

Financials must appear only to authorized users.

The page should make it easy to answer:

> Which machines does this customer currently have?

---

# 35. Maintenance - Work Orders

The Work Orders page should display:

```text
Work Order Number

Machine

Type

Status

Priority

Assigned Technician

Scheduled Date

Created Date

Operating Hours
```

Useful filters include:

```text
Open

Scheduled

In Progress

Completed

Preventive

Corrective

Technician

Branch

Machine
```

---

# 36. Work Order Detail

The Work Order page may contain:

```text
Machine

Type

Status

Priority

Assigned Technician

Reported Problem

Faults

Diagnosis

Work Performed

Parts / Materials

Photos

Documents

Cost

Operating Hours

Created At

Completed At
```

Technicians should be able to update work orders efficiently from mobile devices.

---

# 37. Maintenance Due Page

This page should prioritize machines requiring preventive maintenance.

Possible columns:

```text
Machine

Current Hours

Next Service Hours

Hours Remaining

Due Date

Days Remaining

Priority
```

Visual warnings may differentiate:

```text
Due Soon

Due

Overdue
```

---

# 38. Faults Page

The fleet-wide Faults page should display active and historical faults across machines.

Possible columns:

```text
Machine

Fault Code

Description

Severity

First Seen

Last Seen

Status

Customer

Location
```

Useful filters include:

```text
Active

Historical

Severity

Machine

Model

Customer

Branch
```

---

# 39. Finance - Overview

Only authorized users may access this area.

Possible dashboard information includes:

```text
Revenue

Fleet Costs

Gross Fleet Profit

Utilization

Fleet Investment

Fleet ROI

Payback
```

Filters may include:

```text
Date Range

Branch

Machine Category

Machine

Customer
```

---

# 40. Machine Performance

This page should compare financial and utilization performance between machines.

Possible columns:

```text
Machine

Purchase Cost

Revenue

Maintenance Cost

Profit

Rental Utilization

Operating Utilization

ROI

Payback Status
```

This should help management identify:

```text
Best-performing machines

Underutilized machines

High-maintenance machines

Machines approaching payback

Machines that may be worth selling
```

---

# 41. Reports

The Reports area may provide predefined and configurable reports.

Examples:

```text
Rental Revenue

Machine Utilization

Customer Revenue

Maintenance Cost

Fault Frequency

Fleet Availability

Machine ROI

Rental History
```

Future export options may include:

```text
PDF

Excel

CSV
```

---

# 42. Documents

The Documents area may provide centralized access to files across the organization.

Useful filters include:

```text
Machine

Customer

Rental

Maintenance

Document Type

Upload Date
```

Permissions still apply to the entity associated with the document.

---

# 43. Notifications

The application should provide an in-app notification center.

Examples:

```text
Critical Fault

Machine Offline

Maintenance Due

Rental Ending Soon

Rental Overdue

Remote Command Failed
```

Notifications should include direct navigation to the relevant entity where possible.

Example:

```text
Critical fault detected on AWP-0042

[Open Machine]
```

---

# 44. Remote Machine Actions

Remote actions are safety-sensitive and require special UI treatment.

They must not appear as casual toggle switches.

Example action:

```text
Immobilize Machine
```

should open a confirmation workflow.

Possible dialog:

```text
Immobilize AWP-0042?

Customer:
ABC Construction

Current State:
Idle

Last Communication:
20 seconds ago

This action will send a remote command to the machine.

[Cancel]

[Request Immobilization]
```

After submission, the UI should display:

```text
Command Requested

Waiting for Device...
```

followed by one of:

```text
Acknowledged

Failed

Expired
```

The UI must not immediately display:

```text
Machine Immobilized
```

simply because the button was clicked.

---

# 45. Administration - Users

Organization administrators should be able to manage their own users.

Possible columns:

```text
Name

Email

Role

Branch Access

Status

Last Login
```

Actions may include:

```text
Invite User

Change Role

Change Permissions

Deactivate Membership

Resend Invitation
```

The organization administrator must not be able to assign platform-level roles.

---

# 46. User Invitation Flow

Typical tenant invitation flow:

```text
Administration
      ↓
Users
      ↓
Invite User
      ↓
Enter Email
      ↓
Select Role
      ↓
Select Branch Access if applicable
      ↓
Send Invitation
```

The invited person receives an email and accepts the invitation.

---

# 47. Roles and Permissions Page

Authorized organization administrators should be able to review role definitions.

Examples:

```text
General Manager

Rental Manager

Service Manager

Technician

Finance

Viewer
```

The interface may allow custom roles later.

A role editor should display permissions grouped by domain.

Example:

```text
Machines

[x] View Machines
[x] Create Machines
[x] Edit Machines
[ ] Delete / Archive Machines


Finance

[ ] View Finance
[ ] Edit Financial Records


Remote Control

[ ] Immobilize Machine
```

Sensitive permissions should be clearly identified.

---

# 48. Branches

The Branches page allows organization administrators to manage operational branches.

Information may include:

```text
Branch Name

Address

City

Country

Contact Information

Active / Inactive
```

Future functionality may include:

```text
Branch Geofence

Machine Inventory by Branch
```

---

# 49. Organization Settings

Possible settings include:

```text
Organization Name

Logo

Default Language

Default Currency

Timezone

Country

Date Format

Number Format

Notification Preferences
```

Organization settings must not override a user's selected language where personal language preference is supported.

---

# 50. User Profile

Every user should have access to a personal profile area.

Possible settings:

```text
Name

Profile Photo

Language

Timezone

Password / Security

Notification Preferences
```

Changing personal language should change page titles, menus, buttons, messages, and other user-facing interface content.

---

# 51. Platform Administration

The SaaS operator requires a separate administration interface.

This interface must be clearly separated from normal rental-company administration.

Possible main navigation:

```text
Platform Dashboard

Organizations

Users

Subscriptions

Devices

System Health

Support

Platform Settings
```

---

# 52. Platform Organizations Page

Platform administrators should be able to:

```text
Create Organization

View Organization

Activate Organization

Suspend Organization

Review Subscription

Review Usage

Invite Initial Administrator
```

Possible columns:

```text
Organization

Country

Subscription

Users

Machines

Tracking Devices

Status

Created At
```

Normal tenant business data should not automatically be visible here.

---

# 53. Create Organization Workflow

A platform administrator may create a tenant using a workflow such as:

```text
Create Organization
        ↓
Company Details
        ↓
Regional Settings
        ↓
Subscription
        ↓
Create
        ↓
Invite Primary Administrator
```

Example organization information:

```text
Company:
ABC Rental Ltd.

Country:
Türkiye

Default Language:
Turkish

Currency:
TRY

Timezone:
Europe/Istanbul
```

---

# 54. Invite Initial General Manager

After creating an organization, the platform administrator may invite the company's initial administrator.

Example:

```text
Name:
Mehmet Yılmaz

Email:
mehmet@abcrental.com

Tenant Role:
General Manager
```

The resulting flow is:

```text
Platform Admin
      ↓
OrganizationInvitation
      ↓
Email
      ↓
User Accepts
      ↓
Membership Created
      ↓
General Manager Role Assigned
```

After this point, the General Manager should normally manage the company's own users.

---

# 55. Platform vs Tenant Administration

The interface must clearly distinguish:

```text
Platform Administrator
```

from:

```text
Organization Administrator
```

A Platform Administrator manages the SaaS platform.

An Organization Administrator manages their own rental company.

Platform access must not automatically provide unrestricted access to:

```text
Rental Prices

Contracts

Financial Results

Customer Data

Machine Profitability
```

Future support-access workflows may provide temporary and audited access where necessary.

---

# 56. Mobile Navigation

The mobile application should prioritize common field workflows rather than simply copying the desktop sidebar.

A possible primary navigation structure is:

```text
Home

Machines

Map

Maintenance

More
```

The `More` area may contain:

```text
Rentals

Customers

Notifications

Settings
```

depending on permissions.

---

# 57. Mobile Home

The mobile home screen should show information relevant to the current user.

For a technician:

```text
Assigned Work Orders

Critical Faults

Maintenance Due

Nearby Machines
```

For a manager:

```text
Fleet Status

Active Rentals

Alerts

Machines Offline
```

The dashboard should therefore be permission-aware and role-aware.

---

# 58. QR Code Workflow

Machines may eventually have QR-code labels.

Example workflow:

```text
Open Scanner
      ↓
Scan Machine QR Code
      ↓
Machine Identified
      ↓
Open Machine Detail
```

This is particularly useful for:

- Service technicians.
- Rental return inspections.
- Warehouse employees.

QR codes should contain stable identifiers or safe URLs rather than sensitive machine data.

---

# 59. Responsive Design

The web interface must remain usable on:

```text
Desktop

Laptop

Tablet
```

Basic mobile browser support should also exist, even though a native mobile application is planned.

Large tables may adapt by:

- Hiding secondary columns.
- Using horizontal scrolling where necessary.
- Providing card views on small screens.

Critical information must remain accessible.

---

# 60. Tables

Tables are a major component of the management interface.

Common functionality should include:

```text
Search

Sort

Filter

Pagination

Column Selection

Saved Filters where useful
```

Large datasets must use server-side filtering and pagination rather than loading every record into the browser.

---

# 61. Forms

Forms should:

- Group related fields.
- Clearly identify mandatory information.
- Preserve entered data when reasonable.
- Display validation messages near the relevant field.
- Prevent duplicate submissions.
- Show progress for long operations.

Buttons should generally follow consistent terminology.

For example:

```text
Save

Cancel

Create

Update

Archive
```

These labels must be translated.

---

# 62. Confirmation Dialogs

Confirmation dialogs should be reserved primarily for actions with meaningful consequences.

Examples:

```text
Cancel Rental

Archive Machine

Remove Tracking Device

Delete Document

Immobilize Machine
```

Routine safe actions should not constantly interrupt users with unnecessary confirmations.

---

# 63. Destructive Actions

Destructive actions should use clear wording.

Avoid vague dialogs such as:

```text
Are you sure?
```

Prefer:

```text
Cancel Rental R-2026-0042?

This will release the currently reserved machine.

[Keep Rental]

[Cancel Rental]
```

The wording must be localized.

---

# 64. Loading States

The interface must communicate when data is being loaded.

Examples:

```text
Skeleton Content

Loading Indicator

Button Progress State
```

Users should not be left wondering whether an action was accepted.

---

# 65. Empty States

Pages with no records should provide useful guidance.

Example:

Instead of:

```text
No data
```

use:

```text
No machines have been added yet.

[Add Machine]
```

when the user has permission.

Or:

```text
No active faults.
```

when no action is required.

Empty-state text must be localized.

---

# 66. Error States

Errors should explain what happened in user-understandable language where possible.

Example:

```text
The rental could not be created because the selected machine
is already reserved during this period.
```

rather than:

```text
HTTP 409
```

Technical information may still be logged for support.

---

# 67. Success Feedback

Important successful operations should produce clear feedback.

Examples:

```text
Machine created successfully.

Rental updated.

Invitation sent.

Work order completed.
```

Remote machine commands are an exception.

A successful request to send a command must not be described as successful execution.

For example:

Correct:

```text
Immobilization request sent.
Waiting for device confirmation.
```

Incorrect:

```text
Machine immobilized successfully.
```

before acknowledgement.

---

# 68. Status Presentation

Statuses should use:

```text
Text
+
Visual indicator
```

rather than relying only on color.

For example:

```text
● ONLINE

● OFFLINE

● MAINTENANCE
```

This improves accessibility and reduces ambiguity.

---

# 69. Permission-Aware UI

The UI must adapt to permissions.

Examples:

A technician may see:

```text
Machine

Telemetry

Maintenance

Faults
```

but not:

```text
Finance
```

A rental employee may see:

```text
Customers

Rentals

Machine Availability
```

but not:

```text
Remote Device Administration
```

Permission-aware UI improves usability but does not replace backend authorization.

---

# 70. Context Preservation

When users navigate from filtered lists to detail pages and back, the application should preserve useful context where practical.

Example:

```text
Machines

Filter:
Available Scissor Lifts in Ankara

→ Open AWP-0042

→ Back
```

should ideally return to the same filtered machine list rather than resetting everything.

---

# 71. URLs and Deep Links

Important entities should have stable URLs.

Examples:

```text
/machines/{id}

/customers/{id}

/rentals/{id}

/work-orders/{id}
```

This allows:

- Bookmarking.
- Sharing internal links.
- Navigation from notifications.
- Mobile deep linking where appropriate.

Access must still be permission checked.

---

# 72. Date and Time Display

Dates and times must follow the user's locale and relevant timezone.

For example, the underlying timestamp may be stored in UTC while a Turkish user sees:

```text
06.10.2026 15:30
```

and another locale may display:

```text
Oct 6, 2026, 3:30 PM
```

The application should not hard-code a single date format.

---

# 73. Currency Display

Currency must be displayed according to:

- Monetary currency.
- User locale.

Example values may appear as:

```text
₺15.000,00

€10.500,00

$12,500.00
```

depending on currency and locale formatting rules.

Changing the interface language must not change the underlying currency of a financial transaction.

---

# 74. Number and Unit Display

Number formatting must follow locale conventions where appropriate.

Units should remain explicit.

Examples:

```text
11.9 m

350 kg

438.2 h

74%
```

Future support may allow unit-system preferences if required.

---

# 75. Accessibility

The interface should follow basic accessibility practices.

Important principles include:

- Sufficient contrast.
- Keyboard-accessible controls where practical.
- Labels for form elements.
- Status information not represented by color alone.
- Appropriate focus behavior.
- Readable text sizes.
- Clear error messages.

---

# 76. Visual Design Direction

The platform should have a clean, professional, modern industrial appearance.

Preferred characteristics:

```text
Clean

Structured

Premium

Technical

Professional

Minimal visual clutter
```

The interface should emphasize machine information, tables, maps, and operational clarity rather than decorative design.

A consistent design system should be used throughout the web and mobile applications.

---

# 77. Reusable UI Components

Common interface patterns should use shared reusable components.

Examples:

```text
Buttons

Inputs

Selects

Date Pickers

Tables

Status Badges

Cards

Dialogs

Tabs

Notifications

Machine Status Components

Permission Guards
```

Similar functionality should not be redesigned independently on every page.

---

# 78. Page Naming

Page names described in this document are semantic concepts.

For example:

```text
Machine Detail
```

does not mean the literal text `"Machine Detail"` must appear in every language.

The page title may instead be dynamically rendered.

Example:

```text
English:
Machine Details

Turkish:
Makine Detayları
```

Similarly:

```text
Rental Calendar
```

may become:

```text
Kiralama Takvimi
```

according to the active translation.

---

# 79. Button Naming

Button names must also use translation resources.

Conceptual action:

```text
action.save
```

may render:

```text
English:
Save

Turkish:
Kaydet
```

Conceptual action:

```text
machine.add
```

may render:

```text
English:
Add Machine

Turkish:
Makine Ekle
```

Codex must never create new UI components by hard-coding English button labels if a translation mechanism is available.

---

# 80. Status Translation

Internal status identifiers must remain language-independent.

For example, database/domain value:

```text
RENTED
```

must remain:

```text
RENTED
```

internally.

The user interface translates it.

Example:

```text
English:
Rented

Turkish:
Kirada
```

Similarly:

```text
MAINTENANCE
```

may display as:

```text
English:
Maintenance

Turkish:
Bakımda
```

Business logic must operate on stable status identifiers, not translated strings.

---

# 81. Translation Keys

A consistent translation-key structure should be used.

Example:

```text
navigation.dashboard

navigation.machines

navigation.rentals

navigation.customers

machine.add

machine.edit

machine.status.available

machine.status.rented

rental.create

rental.cancel

maintenance.workOrders

common.save

common.cancel

common.delete

common.search
```

Translation keys should describe meaning rather than visual position.

Avoid keys such as:

```text
button1

leftMenuText

blueLabel
```

---

# 82. Missing Translation Behavior

If a translation is missing, development and testing environments should make the missing translation obvious.

The system should not silently produce empty buttons or labels.

A defined fallback language may be used in production.

English may serve as the initial fallback language unless changed later.

---

# 83. User Journey - New Rental

A typical complete rental workflow is:

```text
User opens Rentals
        ↓
Create Rental
        ↓
Select Customer
        ↓
Select Rental Dates
        ↓
Add Equipment Requirement
        ↓
Set Commercial Terms
        ↓
Check Availability
        ↓
Assign Machine if appropriate
        ↓
Save Reservation
        ↓
Rental Start
        ↓
Machine becomes RENTED
        ↓
Rental Operation
        ↓
Rental Ends
        ↓
Machine Returned
        ↓
Inspection / Maintenance Decision
        ↓
Machine becomes AVAILABLE
```

Exact business rules are defined in:

`07-RENTAL-BUSINESS-RULES.md`

---

# 84. User Journey - Maintenance

Typical workflow:

```text
Fault / Schedule / Manual Request
        ↓
Create Work Order
        ↓
Assign Technician
        ↓
Machine may become unavailable
        ↓
Technician performs work
        ↓
Diagnosis / Parts / Notes / Photos
        ↓
Complete Work Order
        ↓
Update maintenance schedule
        ↓
Machine returned to operational state
```

---

# 85. User Journey - New SaaS Customer

Typical platform onboarding:

```text
Platform Administrator
        ↓
Create Organization
        ↓
Define Country / Currency / Language / Timezone
        ↓
Invite Initial General Manager
        ↓
Invitation Accepted
        ↓
Organization Membership Created
        ↓
General Manager Logs In
        ↓
Creates Branches
        ↓
Invites Employees
        ↓
Creates / Imports Machines
        ↓
Creates Customers
        ↓
Begins Rental Operations
```

---

# 86. User Journey - Machine Tracking Setup

Typical setup:

```text
Create Machine
        ↓
Create / Register Tracking Device
        ↓
Install Device
        ↓
Create DeviceInstallation
        ↓
Assign Decoder Profile if required
        ↓
Receive First Telemetry
        ↓
Verify GPS / CAN Signals
        ↓
Machine Tracking Active
```

---

# 87. User Journey - Remote Immobilization

Typical workflow:

```text
Open Machine
        ↓
Remote Actions
        ↓
Request Immobilization
        ↓
Permission Check
        ↓
Safety / State Validation
        ↓
Confirmation Dialog
        ↓
Command Created
        ↓
Command Sent
        ↓
Waiting for Acknowledgement
        ↓
ACKNOWLEDGED / FAILED / EXPIRED
        ↓
Audit History Updated
```

---

# 88. Future Customer Portal

A future customer-facing portal may allow rental customers to:

```text
View Active Rentals

View Rental History

Request Equipment

View Contracts

View Delivery Information

Report Problems
```

This should remain separate from the internal rental-company application.

It is not required for the initial release.

---

# 89. Initial UI Scope

The first practical version should prioritize:

```text
Login

Dashboard

Machines

Machine Detail

Map

Tracking Devices

Customers

Customer Detail

Rentals

Rental Detail

Reservations

Rental Calendar

Maintenance Work Orders

Maintenance Due

Faults

Basic Finance

Users

Roles / Permissions

Branches

Organization Settings

Notifications

Platform Organization Administration
```

Advanced reporting and highly specialized workflows may be added later.

---

# 90. UI Architecture Principles

The following rules are considered fundamental.

1. All user-facing interface text must support translation.

2. Page names and button names described in English in documentation are conceptual names, not hard-coded UI strings.

3. Internal status identifiers must remain independent from translated labels.

4. Navigation must adapt to permissions.

5. Backend authorization remains mandatory even when UI elements are hidden.

6. Financial information must not appear to unauthorized users.

7. Remote machine commands require explicit confirmation and acknowledgement states.

8. Current machine state must be clearly distinguishable from stale or last-known telemetry.

9. Related information should be accessible from the central Machine Detail page.

10. Tables must support efficient search and filtering.

11. Common UI patterns should use reusable components.

12. Desktop and mobile applications should use consistent concepts while optimizing workflows for their respective form factors.

13. Empty, loading, error, and success states must be intentionally designed.

14. The interface must preserve historical information rather than presenting overwritten relationships as if they never changed.

15. Localization must cover language, dates, numbers, currencies, statuses, and messages.

---

# 91. Related Documentation

Project definition:

`01-PROJECT-OVERVIEW.md`

System architecture:

`02-SYSTEM-ARCHITECTURE.md`

Domain model:

`03-DOMAIN-MODEL.md`

Authentication and permissions:

`05-AUTH-AND-PERMISSIONS.md`

Telemetry and IoT:

`06-TELEMETRY-IOT.md`

Rental business rules:

`07-RENTAL-BUSINESS-RULES.md`

Maintenance:

`08-MAINTENANCE.md`

Finance and analytics:

`09-FINANCE-ANALYTICS.md`

Security:

`10-SECURITY.md`

Coding standards:

`11-CODING-STANDARDS.md`