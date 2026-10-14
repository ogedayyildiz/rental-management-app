# Maintenance

**Document:** `08-MAINTENANCE.md`  
**Status:** Initial Architecture Definition  
**Scope:** Preventive maintenance, corrective maintenance, inspections, work orders, technical machine state, telemetry integration, rental integration, maintenance costs, and service history.

---

## 1. Purpose

The maintenance domain is responsible for the technical service lifecycle of machines.

It must support:

- preventive maintenance;
- corrective maintenance;
- inspections;
- breakdown handling;
- machine service restrictions;
- maintenance history;
- technician work;
- parts and labor recording;
- maintenance costs;
- telemetry-triggered maintenance recommendations.

Maintenance must remain independent from:

- rental state;
- telemetry connectivity state;
- machine operational state;
- financial analytics.

These domains may interact, but they must not be merged.

---

## 2. Separation of Machine States

A machine can simultaneously have different states in different domains.

Example:

```text
Rental State:
NOT_RENTED

Service State:
MAINTENANCE_REQUIRED

Connectivity State:
ONLINE

Operational State:
STOPPED

```
These states must remain separate.
Another example:
Rental State:
RENTED

Service State:
NORMAL

Connectivity State:
OFFLINE

Operational State:
UNKNOWN

An offline tracking device does not automatically mean that the machine has a maintenance problem.
# 3. Core Maintenance Model
The conceptual maintenance structure is:
```
Machine
  │
  ├── MachineMaintenancePlan
  │        │
  │        ▼
  │   MaintenancePlan
  │
  ├── WorkOrder
  │
  ├── Inspection
  │
  ├── Maintenance History
  │
  └── Service Restrictions

Telemetry may feed measurements and faults into this domain:
Telemetry
   │
   ├── Operating Hours
   ├── Fault Events
   ├── Battery Information
   └── Other Measurements
          │
          ▼
Maintenance Domain
```

However, telemetry does not own maintenance decisions.

# 4. MaintenancePlan
A MaintenancePlan defines a reusable maintenance requirement.

Examples:
250-Hour Service

500-Hour Service

Annual Safety Inspection

Battery Inspection Every 6 Months

Hydraulic Filter Replacement Every 1,000 Hours

A MaintenancePlan may be associated with:
- machine model;
- machine category;
- manufacturer recommendation;
- organization-specific maintenance policy.
# 5. MachineMaintenancePlan
A MachineMaintenancePlan applies a MaintenancePlan to one specific machine.
Conceptually:
```
MaintenancePlan
      ↓
MachineMaintenancePlan
      ↓
Machine
```


This allows the same generic maintenance rule to be applied differently to individual machines.
Example:
MaintenancePlan:
250-Hour Service

Machine:
ES1012-0041

Last Service:
1,000 hours

Next Due:
1,250 hours

# 6. Preventive Maintenance Types

Preventive maintenance must support:
```
1.Usage-Based

Example:
Every 250 operating hours

2.Calendar-Based

Example:
Every 12 months

3.Combined
Example:

Every 500 operating hours

OR

Every 12 months

Whichever occurs first
```
The system must support all three models.

# 7. Operating-Hour Based Maintenance

Where reliable operating-hour telemetry exists, maintenance calculations may use the normalized machine operating-hours signal.
```
Example:
Last Service:
1,000 h

Service Interval:
250 h

Next Service:
1,250 h

Current Machine Hours:
1,223 h

The system may derive:
Remaining:
27 h
```
# 8. Manual Operating-Hour Readings
Machines without telemetry must still support maintenance.

Authorized users must be able to manually enter:

Machine Operating Hours:
1,223 h

Manual readings should record:
- machine_id
- reading
- recorded_at
- entered_at
- entered_by
- source
- notes

Corrections must be auditable.

# 9. Telemetry Measurement Source
Maintenance must never read provider-specific fields such as:

- ruptela.fmio_183
- xtellio.parameter_45


Instead, maintenance consumes normalized telemetry such as:

- operating_hours
- battery_soc
- battery_voltage

The telemetry domain determines which provider or device is authoritative.
# 10. Multiple Telemetry Sources
A machine may receive operating hours from:

- Ruptela

- Xtellio

- OEM telematics

- Machine controller

- Manual reading

The maintenance module must not independently decide which provider wins.
The normalized telemetry source-resolution logic defined in 06-TELEMETRY-IOT.md determines the current authoritative telemetry value.


# 11. Provider Changes
Changing telemetry provider must not reset maintenance history.

Example:
Machine:
ES1012-0041

2026:
Ruptela

2027:
Xtellio

Its maintenance history remains attached to:
Machine

not to:
TrackingDevice

or:
TelemetryProvider

# 12. Maintenance Due Conditions


Maintenance requirements may have derived conditions such as:

- UPCOMING
- DUE
- OVERDUE

These should normally be calculated from the maintenance plan rather than manually edited.

Example:
Next Service:
1,250 h

Current:
1,240 h

Warning Threshold:
25 h

Result:
UPCOMING

# 13. Warning Thresholds
Maintenance plans may define advance warnings.
```
Examples:
25 operating hours before service

14 days before inspection expiry

500 km before service

7 days before calibration
```
Warning rules should be configurable per MaintenancePlan.

# 14. Maintenance Due Does Not Always Mean Unavailable
A maintenance requirement becoming due must not universally block the machine.
```
For example:

Oil Service:
5 hours overdue

may produce a warning.
Whereas:
Mandatory Safety Inspection:
Expired

may result in:
SERVICE_BLOCKED
```
Blocking behavior must therefore be explicit.

# 15. Maintenance Severity / Operational Impact

A maintenance requirement may conceptually be:
```
INFORMATIONAL

WARNING

RENTAL_BLOCKING

SAFETY_CRITICAL
```

Exact naming may evolve, but the concept must exist.
Safety-critical restrictions must not be bypassed through normal rental permissions.

# 16. Service State

The machine should have a technical/service state separate from its rental state.

Possible internal values may include:
```
NORMAL

MAINTENANCE_DUE

MAINTENANCE_REQUIRED

INSPECTION_REQUIRED

OUT_OF_SERVICE

SERVICE_BLOCKED
```

These identifiers are internal.
User-facing labels must use translation keys.

# 17. Derived Service State

Service state should be derived where possible from:

- maintenance requirements;
- open blocking work orders;
- mandatory inspections;
- technical service blocks;
- authorized technical decisions.

Avoid relying on a single manually edited boolean such as:
needs_service = true

as the entire maintenance model.
# 18. WorkOrder
A WorkOrder represents an actionable maintenance activity for a machine.
Initial types should include:
```
PREVENTIVE

CORRECTIVE

INSPECTION

OTHER
```

Future types may be added without redesigning the model.
# 19. Work Order Number
Every work order should have:
Internal immutable ID
+
Human-readable work order number

Example:
WO-2026-000184

The exact numbering scheme may be configurable by organization.
# 20. Work Order Lifecycle
The initial recommended lifecycle is:
```
DRAFT
  ↓
OPEN
  ↓
PLANNED
  ↓
IN_PROGRESS
  ↓
COMPLETED
```

Additional states may include:
```
WAITING

CANCELLED
```

# 21. Work Order Status Meaning
```
DRAFT
The work order is incomplete or still being prepared.
OPEN
The maintenance issue has been accepted and requires action.
PLANNED
The work has been scheduled.
IN_PROGRESS
Technical work is currently being performed.
WAITING
The work cannot continue because of a dependency.
Examples:
Waiting for parts

Waiting for customer access

Waiting for external supplier

Waiting for approval

COMPLETED
The technical work has been completed.
CANCELLED
The work order has intentionally been closed without completion.
Cancellation must preserve history.
```
# 22. Work Order Creation Sources
A work order may originate from:
Manual technician entry

Preventive maintenance schedule

Telemetry fault

Machine breakdown

Rental return inspection

Operator report

Customer report

Periodic inspection

Other technical finding

The source should be preserved.
Example:
source = TELEMETRY_FAULT

or:
source = RETURN_INSPECTION

# 23. Preventive Work Orders
When scheduled maintenance becomes due, the platform may:
- notify maintenance users;
- create a maintenance recommendation;
- create a draft work order;
- create an open work order.
The exact behavior may be configurable by organization.
The system must avoid repeatedly creating duplicate work orders for the same maintenance requirement.

# 24. Corrective Work Orders
Corrective maintenance addresses an actual problem.
Examples:
Machine does not lift

Battery does not charge

Hydraulic leakage

Drive motor fault

Emergency stop circuit fault

CAN communication fault

Platform leveling problem

Corrective work orders should distinguish between the originally reported symptom and the diagnosed root cause.
# 25. Reported Symptom vs Root Cause
Do not overwrite:
Reported Problem:
Machine will not lift

with:
Root Cause:
Platform gate safety switch failure

Both are valuable historical information.
Recommended concepts:
reported_issue
diagnosis
root_cause
corrective_action

# 26. Work Order Technical Information
A work order may contain:
Reported issue
Symptoms
Diagnosis
Root cause
Corrective action
Technician notes
Fault codes
Operating-hour readings
Photos
Documents
Parts
Labor
External services
Costs
Downtime
Final result

Not every field needs to be mandatory.
# 27. Telemetry Faults
Telemetry faults belong primarily to the telemetry domain.
Conceptually:
```
FaultDefinition
      ↓
FaultEvent
      ↓
Possible Maintenance Action
      ↓
WorkOrder
```
A fault may trigger:
- a notification;
- a maintenance recommendation;
- a draft work order;
- an open work order;
- a service restriction.
# 28. Fault Disappearance Does Not Mean Repair
This rule is critical:
Fault no longer active
≠
Machine repaired

A CAN error may disappear because:
- ignition was cycled;
- a connection temporarily recovered;
- the controller cleared the code;
- the problem became intermittent.
Only the maintenance workflow can determine that repair work is completed.
# 29. Fault History
Cleared faults must remain historically visible.
Example:
Fault:
Low Battery Voltage

Started:
10 Oct 14:02

Cleared:
10 Oct 14:16

The historical event must remain even after the machine becomes healthy.
# 30. Fault-to-Work-Order Relationships
Avoid assuming:
1 Fault = 1 Work Order

A work order may address multiple faults.
Likewise, one recurring fault may result in several work orders over time.
The relationship should support these scenarios.
# 31. Machine Technical Blocking
Authorized maintenance users must be able to place a machine in a technical block.
Example:
Machine:
ES1012-0041

State:
OUT_OF_SERVICE

Reason:
Hydraulic hose damaged

The block must record:
reason
created_by
created_at
related_work_order

where applicable.
# 32. Removing a Technical Block
Technical release must also be explicit and auditable.
Record:
released_by
released_at
release_reason
related_work_order

A normal rental user must not be able to remove a safety-critical maintenance block.
# 33. Open Work Order Does Not Always Mean Blocked
Not every work order should prevent rental.
Example:
Work Order:
Replace damaged sticker

may remain open while the machine continues operating.
Whereas:
Work Order:
Repair failed emergency lowering system

should block operation.
Operational impact must therefore be separate from work-order status.
# 34. Work Order Completion
Completing a work order should record:
completed_at
completed_by
final_operating_hours
work_performed
final_condition
technical_release
notes

Completing one work order must not automatically make the machine available if other blocks remain.
# 35. Maintenance History
Completed maintenance records must be preserved permanently.
Do not overwrite an old work order when the machine is serviced again.
Example:
WO-2026-000120
250 h Preventive Service
Completed at 1,010 h

WO-2026-000184
250 h Preventive Service
Completed at 1,262 h

## 35.1 Machine Maintenance Record Export

Authorized users must be able to export the maintenance and technical history of a selected machine as a professional PDF report and as a structured XLSX file. This capability is important not only for internal maintenance management but also for machine valuation, fleet and brand assessment, warranty discussions, technical due diligence, audits, and second-hand equipment sales.

The export should be generated for a specific `Machine` rather than for a telemetry device or provider, so the complete technical history remains continuous even if tracking devices, telemetry providers, branches, customers, or rental assignments have changed during the machine's lifetime.

A machine maintenance export may include:

- machine fleet number;
- manufacturer;
- model;
- serial number;
- year of manufacture where available;
- acquisition or commissioning date where permitted;
- current operating hours;
- operating-hour history;
- current technical/service state;
- active maintenance plans;
- next scheduled maintenance;
- completed preventive maintenance;
- completed corrective maintenance;
- inspections and inspection results;
- work-order numbers;
- work-order dates;
- reported problems;
- diagnoses;
- root causes;
- corrective actions;
- parts replaced;
- relevant meter readings;
- downtime;
- linked fault history;
- maintenance location;
- technician or service provider where appropriate;
- attached certificate/document references;
- current unresolved technical issues.

The PDF version should be designed as a human-readable machine service-history report suitable for sharing with management, assessors, dealers, manufacturers, or prospective second-hand buyers.

Conceptually:

```text
Machine Identification
        ↓
Current Technical Summary
        ↓
Current Operating Hours
        ↓
Maintenance Plan / Upcoming Service
        ↓
Chronological Maintenance History
        ↓
Inspection History
        ↓
Major Fault / Repair History
        ↓
Current Open Technical Issues
        ↓
Report Generation Information
```
The XLSX version should provide structured records that can be filtered, sorted, compared, or imported into another analytical system. Where useful, separate sheets may be used for:

- Machine Summary

- Maintenance History

- Work Orders

- Inspections

- Fault History

- Parts

- Operating-Hour Readings

- Downtime

- Costs

The exact XLSX structure may evolve, but exported data must preserve stable identifiers and clear units.
The system should support different export profiles because not every report recipient should receive the same information.

Recommended export profiles include:
- INTERNAL_FULL
- TECHNICAL_HISTORY
- RESALE

INTERNAL_FULL may include all information that the requesting user has permission to access, including internal maintenance costs and detailed technician information.

TECHNICAL_HISTORY should focus on service, repairs, inspections, operating hours, faults, parts replaced, and technical condition while excluding unrelated sensitive commercial information.

RESALE should generate a professional second-hand machine history that may be shared externally while excluding sensitive information such as:
```
Customer names

Rental prices

Machine profitability

Supplier purchase prices

Internal margins

Confidential technician notes

Internal management comments
```

Export permissions must follow the normal authorization model. A user must never gain access to hidden financial or sensitive information merely because it appears in an exported report.
Possible permissions may include:
maintenance.export
maintenance.export_internal
maintenance.export_costs

The backend must determine which fields the requesting user is authorized to export.
Every generated report should contain report metadata such as:
Machine Identifier
Report Period
Generated At
Generated By
Current Meter Reading
Organization
Report Type

The PDF should clearly indicate that the report represents information recorded in the platform as of the report generation time.
Where operating hours, faults, or other values originate from telemetry, the export may identify them as telemetry-derived without exposing provider-specific protocol details unless needed for technical analysis.
Generating an export must not modify maintenance history.
For auditability, important exports may record:
machine_id
generated_by
generated_at
export_type
date_range
export_profile

Future versions may support digitally signed reports, QR-based report verification, externally shareable secure links, manufacturer-specific service books, standardized used-equipment condition reports, and aggregated exports that compare maintenance performance across machines, models, manufacturers, or fleet categories.

Both remain in machine history.
# 36. Preventive Maintenance Completion
Completing scheduled maintenance must update the next maintenance requirement.
Example:
Interval:
250 h

Service completed at:
1,030 h

The next service may be:
1,280 h

if the policy calculates from actual completion.
# 37. Maintenance Interval Calculation Policy
Different organizations or manufacturers may calculate the next interval differently.
Possible rules include:
Next due from actual completion reading

Next due from originally scheduled threshold

Next due from calendar schedule

Whichever occurs first

The MaintenancePlan should define the applicable rule.

# 38. Calendar Maintenance Completion
Example:
Annual Inspection Due:
1 January 2027

Actually Performed:
15 January 2027

The next due date might be:
1 January 2028

or:
15 January 2028

depending on policy.
Do not hard-code one interpretation.

# 39. Combined Maintenance Rules
Example:
500 hours
OR
12 months

Whichever comes first

The system must independently evaluate both thresholds.

# 40. Maintenance Plan Changes
Changing a MaintenancePlan must not rewrite historical maintenance records.
Example:
Old policy:
Service every 250 h

New policy:
Service every 300 h

Past services must continue to reflect the policy applicable when they were performed.
Versioning may be required when rules change materially.

# 41. Maintenance Plan Versioning
A future implementation may represent:
ES1012 Preventive Plan v1

ES1012 Preventive Plan v2

Machines can transition to newer rules while historical work orders retain their original context.

# 42. Machine Model Maintenance Templates
Machine models may have recommended maintenance plans.
Example:
Machine Model:
ES1012

Recommended Plans:
250 h General Service
500 h Hydraulic Inspection
12-Month Safety Inspection
6-Month Battery Inspection

When a new machine is added, applicable plans may be suggested automatically.

# 43. Machine-Specific Overrides
Authorized users may adjust maintenance rules for an individual machine where necessary.
Examples:
Different service interval

Different initial meter baseline

Different inspection date

Temporary maintenance suspension

Additional custom maintenance plan

Overrides must be auditable.

# 44. Existing / Used Machine Onboarding
The system must support machines added with existing history.
Example:
Machine Current Hours:
2,450 h

Last Known Service:
2,250 h

Next Planned Service:
2,500 h

It must not require the platform to have recorded every service since zero hours.

# 45. Unknown Historical Maintenance
A machine may be added with incomplete service history.
Example:
Current Hours:
2,450 h

Last Service:
Unknown

An authorized user may establish a baseline:
Next Service:
2,500 h

without fabricating historical work orders.

# 46. Imported Maintenance History
Historical records imported from another system may be identified as imported data.
Example:
source = IMPORTED

This allows distinction between:
Native platform work order

and:
Historical imported maintenance record

# 47. Rental Return Inspection
The rental domain owns:
Machine returned from customer

The maintenance domain owns:
Technical condition after return

These must remain separate.

# 48. Return Inspection Flow
Recommended flow:
```
Rental Return
      ↓
Return Inspection Required
      ↓
Inspection Work Order
      ↓
Pass / Issue Found
```
If inspection passes:
```
Machine technically cleared

If a problem is found:
Corrective Work Order
      ↓
Machine remains unavailable
```

# 49. Return Inspection Does Not Complete Rental Automatically
Maintenance inspection completion must not automatically complete a commercial rental.
Likewise, completing the rental does not mean the machine passed its technical inspection.
The two workflows interact but remain independent.

# 50. Damage Found During Return

Return inspection may identify damage.
Example:
Rental:
R-2026-0042

Machine:
ES1012-0041

Damage:
Bent platform gate

The platform may link:
Rental
Machine
Inspection Work Order
Corrective Work Order
Photos
Repair Cost
Customer Charge

Commercial responsibility remains in the rental/finance domains.

# 51. Inspection Work Orders
Inspection should be supported as a work-order type.
Examples:
Return Inspection

Pre-Delivery Inspection

Annual Safety Inspection

Post-Repair Inspection

Commissioning Inspection

Periodic Inspection

# 52. Inspection Checklists
Future inspection support should allow structured checklists.
Potential checklist results:
PASS

FAIL

NOT_APPLICABLE

Checklist items may contain:
Measurement
Comment
Photo
Signature

Do not model inspections only as one large text field.

# 53. Mandatory Inspections
Certain inspections may have expiry dates.
Example:
Annual Safety Inspection

Valid Until:
12 March 2027

Expiry may generate:
INSPECTION_REQUIRED

or:
SERVICE_BLOCKED

depending on policy.
# 54. Pre-Delivery Inspection

Before a machine is dispatched, an organization may require a technical pre-delivery inspection.
Conceptually:
```
Machine Assigned to Rental
      ↓
Pre-Delivery Inspection
      ↓
Technically Ready
      ↓
Dispatch
```

Completing the inspection must not automatically start the rental.

# 55. Rental and Maintenance Scheduling
Maintenance and rental scheduling must be aware of each other.
Example:
Machine:
ES1012-0041

Maintenance Planned:
15–16 Nov

Rental Reservation:
15–20 Nov

The system must expose this conflict.

# 56. Planned Maintenance Availability Block
A maintenance event may block a future availability period.
Example:
Maintenance:
20 Nov 08:00
to
20 Nov 17:00

Rental availability calculations should consider this period if the maintenance is blocking.
# 57. Maintenance Must Not Duplicate Rental Scheduling
The maintenance system should not maintain its own copy of rental reservations.
Likewise, the rental system should not copy maintenance records.
Each domain remains authoritative for its own data and exposes required information through defined interfaces.
# 58. Maintenance Suggestions Around Rentals
The system may suggest:
Machine has maintenance due in 15 hours.

Rental starts tomorrow for 30 days.

Consider servicing before dispatch.

But the system must not automatically cancel or move customer rentals.
# 59. Maintenance Location
Maintenance may occur at:
Company workshop

Customer site

Branch workshop

External service company

Manufacturer facility

Other location

Work orders should be able to record service location.
# 60. Technician Assignment
A work order may be assigned to:
Internal technician

Maintenance manager

Multiple technicians

External service provider

The first version may focus on internal users while remaining extensible.
# 61. Labor Recording

Maintenance labor may record:

- Technician
- Description
- Date
- Hours
- Internal Cost
- External Cost

Cost visibility must respect permissions.
# 62. Parts Used
Work orders should support parts usage.
Example:
Part:
Hydraulic Filter

Part Number:
HF-1024

Quantity:
1

Unit Cost:
450 TRY

The initial version does not need to become a full warehouse-management system.

# 63. Future Parts Inventory
The architecture should remain capable of integration with:

- Parts inventory

- Purchasing

- Suppliers

- ERP

- Automatic stock reduction

- Parts reservation

without redesigning maintenance history.

# 64. External Service Costs
Work orders may include external services such as:

Third-party repair

Calibration

Hydraulic hose fabrication

Machining

Transportation

Inspection fee

External technician

These should be recorded separately from internal labor where possible.

# 65. Maintenance Cost Categories
Maintenance cost may conceptually include:

- PARTS

- LABOR

- EXTERNAL_SERVICE

- TRANSPORT

- OTHER

The finance document will define how these contribute to profitability analytics.

# 66. Currency and Decimal Rules
Every maintenance cost must have explicit currency.
Example:
850 TRY

or:
120 EUR

Financial calculations must use appropriate decimal handling and must not rely on JavaScript floating-point arithmetic for authoritative values.

# 67. Maintenance Cost Permissions
Not every maintenance user should see cost information.
For example, a technician may see:

- Replace hydraulic hose
- Part required
- Service instructions

without seeing:

- Machine Purchase Price
- Rental Revenue
- Profit
- ROI
- Supplier Margin

Relevant permissions may include:
- maintenance.costs.view
- maintenance.costs.edit

# 68. Warranty
Future versions may record whether maintenance is:

WARRANTY

CUSTOMER_CHARGEABLE

SUPPLIER_COVERED

MANUFACTURER_COVERED

INTERNAL_COST

Warranty processing should remain separate from normal work-order completion.

# 69. Maintenance Documents
Maintenance may contain documents such as:

- Service Report

- Inspection Certificate

- External Repair Invoice

- Calibration Certificate

- Warranty Document

- Photos

- Technical Manual

- Repair Instruction

- Signed Form

The shared document infrastructure should be used.

# 70. Maintenance Manuals and AI

The future AI assistant may use machine manuals, error-code documentation, and maintenance history to help technicians.

Example:

Fault:
E204

AI suggestion:
Check platform gate switch circuit and connector X12.

AI suggestions must remain advisory.
They must not automatically:
Complete Work Orders

Clear Safety Blocks

Change Machine State

Execute Remote Commands

# 71. Machine Manuals

Technical manuals should be associated with:

Manufacturer

Machine Model

Document Version

Language

The platform should support multiple manuals and revisions.

# 72. AI Grounding

AI maintenance responses should be grounded in available technical documentation where possible.

The system should distinguish:
Manufacturer documentation

Organization-specific technical notes

Historical maintenance data

AI inference

Future AI architecture will define this in greater detail.
# 73. Downtime
Machine downtime should be distinguishable from technician labor time.

Example:

Machine Out of Service:
4 days

Actual Technician Labor:
3.5 hours

This distinction is useful for later reliability analysis.
# 74. Downtime Start and End

Downtime may be derived from technical blocks or explicitly recorded depending on the workflow.
Potential values include:
downtime_started_at

downtime_ended_at

Do not assume work-order creation time always equals downtime start.
# 75. Maintenance Analytics
Future analytics may include:

Total Maintenance Cost

Maintenance Cost per Machine

Maintenance Cost per Operating Hour

Breakdown Count

Preventive vs Corrective Ratio

Downtime

Mean Time Between Failures

Mean Time To Repair

Recurring Faults

Maintenance Compliance

Inspection Compliance

Exact formulas will be defined centrally in the analytics documentation.
# 76. Recurring Fault Analysis

The platform should preserve enough history to detect repeated technical problems.

Example:
Machine:
ES1012-0041

Fault:
Drive Motor Overtemperature

Occurrences:
7 in 60 days

Historical faults and work orders must not be collapsed into only the current state.

# 77. Search

Maintenance search should support:

Work Order Number

Machine Fleet Number

Serial Number

Model

Fault Code

Technician

Work Order Status

Maintenance Type

Branch

Date

Related Rental

All search results must respect tenant and permission boundaries.

# 78. Maintenance Dashboard

Useful dashboard indicators may include:

Machines Out of Service

Open Corrective Work Orders

Maintenance Due Soon

Overdue Maintenance

Inspections Expiring Soon

Pending Return Inspections

Work Orders Waiting for Parts

Recent Critical Faults

Recurring Faults

Planned Maintenance This Week

# 79. Notifications
Maintenance notifications may include:
```
Service due soon

Service overdue

Inspection expiring

Critical fault received

Work order assigned

Machine placed out of service

Return inspection pending

Work order waiting too long

Maintenance completed

Notification rules may be organization-specific.
```
# 80. Audit Trail

Important maintenance actions must be audited.
```
Examples:
Maintenance Plan Created

Maintenance Plan Changed

Schedule Overridden

Operating-Hour Reading Corrected

Work Order Created

Work Order Assigned

Work Order Started

Work Order Completed

Work Order Cancelled

Machine Blocked

Machine Released

Inspection Passed

Inspection Failed

Cost Changed
```
# 81. Completed Work Order Editing

Completed work orders should not be freely editable.

If a correction is required, the platform should preserve audit history through:

Controlled Amendment

Reopening

Correction Record

rather than silently replacing historical information.

# 82. Idempotency
Maintenance actions should tolerate repeated requests where appropriate.

Examples:

Complete Work Order

Create Preventive Work Order

Apply Service Block

Remove Service Block

Add Part Usage

Repeated network requests must not create duplicate technical history.

# 83. Maintenance Permissions

Permissions should be capability-based.
Possible permissions include:
```
maintenance.view

maintenance.create

maintenance.edit

maintenance.plan

maintenance.assign

maintenance.start

maintenance.complete

maintenance.cancel

maintenance.block_machine

maintenance.release_machine

maintenance.override_schedule

maintenance.readings.edit

maintenance.costs.view

maintenance.costs.edit

maintenance.plans.manage

inspections.perform
```
# 84. Roles Are Not Hard-Coded

The application must never assume:

Only Service Manager can perform maintenance actions.

One organization may have:
Service Manager

while another may have:
Operations Manager

with the same permissions.
Authorization must check permissions, not role names.

# 85. Tenant Isolation

All maintenance records belong to an organization.
This includes:

MaintenancePlan

MachineMaintenancePlan

WorkOrder

Inspection

Service Block

Labor

Parts

Costs

Notes

Documents

Cross-tenant access is forbidden unless explicitly provided by a future audited platform-support mechanism.
# 86. Branches

Maintenance should support branch-aware operations.

Example:

Machine:
ES1012-0041

Current Branch:
Ankara

Work Order:
Performed at Istanbul Service Center

Machine branch and service location are related but not necessarily identical.
# 87. Historical Persistence
Maintenance history must remain attached to the machine even if:

Branch Changes

Tracking Device Changes

Telemetry Provider Changes

Customer Changes

Machine Is Sold

Machine Is Decommissioned

Historical technical records must remain accessible to authorized users.
# 88. Record Deletion
Important maintenance records should generally not be physically deleted.

Use:

CANCELLED

ARCHIVED

VOIDED

or another appropriate historical mechanism instead.
Hard deletion should be exceptional.
# 89. Time Handling
Maintenance timestamps should follow the platform-wide time rules.

Recommended storage:
UTC

Display uses the appropriate organization/user timezone.
Examples:
```
planned_start_at

actual_start_at

completed_at

reading_recorded_at
```
# 90. Units
Technical measurements must have clear units.
Examples:
Operating Hours:
h

Battery Voltage:
V

Temperature:
°C

Pressure:
bar

Canonical storage rules should prevent ambiguity.
# 91. Localization
Internal identifiers remain language-independent.

Example:
MAINTENANCE_REQUIRED

User-facing strings use translations.
Example:
English:
Maintenance Required

Turkish:
Bakım Gerekli

All:

- Pages
- Buttons
- Statuses
- Warnings
- Notifications
- Form Labels
- Maintenance Types


must follow the application's i18n system.
# 92. Backend Authority

The backend is authoritative for:
- Maintenance Status

- Service Blocks

- Maintenance Due Calculations

- Work Order Transitions

- Permissions

- Inspection Results

- Technical Release

- Cost Changes

- Schedule Overrides

The frontend may provide immediate warnings but cannot be the only validation layer.
# 93. Initial Maintenance Workflow

The recommended default preventive flow is:
```
Maintenance Plan
      ↓
Machine Maintenance Schedule
      ↓
Upcoming
      ↓
Due
      ↓
Work Order Created
      ↓
Planned
      ↓
In Progress
      ↓
Completed
      ↓
Next Maintenance Calculated
```

# 94. Initial Corrective Workflow

The recommended corrective flow is:
```
Problem Reported / Fault Detected
      ↓
Technical Review
      ↓
Work Order
      ↓
Machine Blocked if Required
      ↓
Diagnosis
      ↓
Repair
      ↓
Inspection / Test
      ↓
Work Order Completed
      ↓
Machine Released if Safe
```
# 95. Example Preventive Maintenance
Example:
Machine:
ES1012-0041

Plan:
250-Hour Preventive Service

Last Service:
1,000 h

Warning Threshold:
25 h

Current Hours:
1,228 h

System derives:
UPCOMING

At:
1,250 h

the maintenance becomes:
DUE

A work order may then be created.
If service is completed at:
1,263 h

and the plan calculates from actual completion:
Next Due:
1,513 h

# 96. Example Corrective Maintenance
Example:
Machine:
ES1012-0057

Telemetry Fault:
Drive Controller Error

Rental:
ACTIVE

The system may:
```
Create Critical Fault Notification
      ↓
Create/Open Work Order
      ↓
Maintenance User Reviews Machine

The machine may then be placed:
OUT_OF_SERVICE

The rental team may decide to replace the machine.
The maintenance team diagnoses:
Damaged motor cable

After repair and testing:
Work Order:
COMPLETED

Technical Block:
REMOVED
```
The telemetry fault disappearing alone would not have completed this workflow.
# 97. Initial Scope
The first production version should prioritize:
- reusable MaintenancePlans;
- MachineMaintenancePlans;
- operating-hour based maintenance;
- calendar-based maintenance;
- combined maintenance rules;
- warning thresholds;
- maintenance due calculations;
- manual operating-hour readings;
- normalized telemetry operating-hour integration;
- preventive work orders;
- corrective work orders;
- inspection work orders;
- work-order scheduling;
- work-order lifecycle;
- technical machine blocking;
- technical release;
- telemetry fault links;
- return inspection integration;
- rental availability integration;
- parts recording;
- labor recording;
- external service cost recording;
- photos and documents;
- maintenance history;
- permissions;
- audit history;
- notifications;
- branch-aware views.
# 98. Future Capabilities
Future maintenance functionality may include:
- spare-parts inventory;
- purchasing;
- supplier management;
- automatic stock consumption;
- external workshop portals;
- technician mobile workflows;
- detailed inspection checklists;
- electronic signatures;
- QR/barcode parts handling;
- warranty claims;
- service campaigns;
- manufacturer recalls;
- predictive maintenance;
- AI-assisted fault diagnosis;
- recurring-failure detection;
- service route optimization;
- technician workload planning;
- component-level service history;
- OEM maintenance integrations;
- automated service recommendations.
# 99. Fundamental Maintenance Rules
The following rules are architectural requirements:
1. Maintenance history belongs to the machine, not the telemetry device.
2. Maintenance must function without telemetry.
3. Telemetry supplies measurements and fault information but does not own maintenance decisions.
4. Rental state, service state, connectivity state, and operational state remain separate.
5. MaintenancePlans define reusable maintenance requirements.
6. MachineMaintenancePlans apply those requirements to specific machines.
7. Usage-based maintenance must be supported.
8. Calendar-based maintenance must be supported.
9. Combined maintenance rules must be supported.
10. Manual meter readings must be supported.
11. Manual reading corrections must be auditable.
12. Provider-specific telemetry fields must never enter maintenance business logic.
13. Provider changes must not reset maintenance schedules.
14. Maintenance due does not automatically mean machine unavailable.
15. Blocking behavior must be explicit.
16. Safety-critical blocks cannot be bypassed through normal rental permissions.
17. Open work orders do not universally mean rental blocked.
18. Reported symptoms and diagnosed root causes are different concepts.
19. Fault disappearance does not mean machine repair.
20. Cleared faults remain historically visible.
21. Fault-to-work-order relationships must not assume one-to-one mapping.
22. Work-order history must be preserved.
23. Completed work orders must not be silently overwritten.
24. Maintenance completion must update future maintenance schedules according to defined plan rules.
25. Changing a maintenance plan must not rewrite history.
26. Existing machines may enter the system with incomplete historical maintenance data.
27. Return inspection links rental and maintenance without merging the domains.
28. Maintenance and rental schedules must detect conflicts.
29. Maintenance must not duplicate rental scheduling data.
30. Technical release does not automatically complete a rental.
31. Completing a rental does not automatically technically release a machine.
32. Parts, labor, external services, downtime, and other costs should remain distinguishable.
33. Sensitive maintenance costs require permissions.
34. Maintenance records remain attached to the machine across branch or provider changes.
35. Important maintenance actions must be auditable.
36. Backend validation is authoritative.
37. Permissions are capability-based, not dependent on fixed role names.
38. Tenant isolation is mandatory.
39. Important maintenance history should not be physically deleted.
40. Internal identifiers remain language-independent.
41. All user-facing maintenance terminology must use translation keys.
100. Related Documents
This document should be read together with:
01-PROJECT-OVERVIEW.md
02-SYSTEM-ARCHITECTURE.md
03-DOMAIN-MODEL.md
04-UI-UX.md
05-AUTH-AND-PERMISSIONS.md
06-TELEMETRY-IOT.md
07-RENTAL-BUSINESS-RULES.md
09-FINANCE-ANALYTICS.md
10-SECURITY.md
11-CODING-STANDARDS.md

Responsibility boundaries:
Maintenance
→ service schedules, technical work, inspections, machine technical restrictions

Telemetry
→ physical measurements, device connectivity, faults, normalized machine signals

Rental
→ commercial rental lifecycle, reservations, assignments, returns

Finance / Analytics
→ profitability, ROI, cost analysis, utilization metrics

Authentication / Permissions
→ authorization

UI / UX
→ presentation and interaction