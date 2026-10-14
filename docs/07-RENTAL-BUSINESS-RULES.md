# Rental Business Rules

**Document:** `07-RENTAL-BUSINESS-RULES.md`  
**Status:** Initial Architecture Definition  
**Scope:** Rental lifecycle, reservations, machine allocation, pricing, availability, extensions, replacements, returns, transport, conflicts, and related business rules.

---

## 1. Purpose

This document defines the business rules governing equipment rental operations in the platform.

The rental domain must support both:

- simple rental companies that assign a specific machine immediately;
- larger rental companies that reserve equipment by category or model before deciding which physical machine will be delivered.

The rental system must remain independent from telemetry.

Telemetry may provide useful information such as:

- machine location;
- operating hours;
- machine activity;
- battery state;
- fault information;
- estimated utilization.

However, telemetry must never automatically create, start, extend, terminate, or legally complete a rental.

Rental lifecycle changes are business actions performed by authorized users.

---

## 2. Core Rental Model

The platform must not model a rental as simply:

```text
Rental
  ↓
Machine
```
A rental may contain:
- multiple machines;
- multiple equipment requirements;
- machines that are assigned later;
- replacement machines;
- partially returned equipment;
- different pricing arrangements;
- transport and additional charges.
The conceptual structure is:
```
Customer
   │
   ▼
Rental
   │
   ▼
RentalItem
   │
   ├── Requested Category
   ├── Requested Model
   ├── Quantity
   ├── Pricing
   └── Rental Period
          │
          ▼
RentalMachineAssignment
          │
          ▼
Physical Machine
```
This separation between the commercial rental requirement and the physical machine assignment is fundamental.

---

# 3. Rental Aggregate
Rental represents the commercial rental agreement or rental transaction with a customer.

Example:
```
Rental Number:
R-2026-0042

Customer:
ABC Construction

Rental Period:
10 November 2026
to
30 November 2026

Items:
2 × 12 m Electric Scissor Lift

Delivery:
Customer Site A

Status:
RESERVED
```

A rental may contain one or more RentalItem records.
A rental may eventually have one or more physical machines assigned to each item.

---

# 4. Rental Number
Every rental must have a unique human-readable rental number.
Example:
```
R-2026-000001
R-2026-000002
R-2026-000003
```
The exact numbering format may be configurable by organization.
The database must also use an internal immutable identifier independent of the human-readable rental number.
```
Example:
id = UUID
rental_number = R-2026-000042
```
---

# 5. Rental Lifecycle
The initial rental lifecycle is:
```
DRAFT
  ↓
QUOTED
  ↓
RESERVED
  ↓
ACTIVE
  ↓
COMPLETED

A rental may also become:
CANCELLED
```
where permitted by the business rules.
The initial canonical rental statuses are:

- DRAFT
- QUOTED
- RESERVED
- ACTIVE
- COMPLETED
- CANCELLED

These internal status identifiers must remain language-independent.
User-facing labels must use translation keys.
Example:

RENTAL_STATUS_RESERVED

may appear as:

English:
Reserved

Turkish:
Rezerve

# 6. DRAFT
DRAFT represents a rental that is still being prepared.
A draft may contain incomplete information.
Examples:
- customer selected but no dates yet;
- dates selected but pricing incomplete;
- equipment requirements being added;
- transport information not confirmed;
- internal preparation still underway.
A draft does not reserve machine availability unless explicitly converted to a reservation.
Draft rentals must not prevent machines from being assigned to other confirmed rentals.
# 7. QUOTED
QUOTED means that commercial terms have been prepared for the customer.
The quote may contain:
- equipment;
- quantity;
- rental period;
- rental rates;
- transport;
- collection;
- insurance;
- cleaning;
- additional charges;
- discounts;
- taxes;
- customer-specific terms.

A quoted rental does not automatically reserve equipment.
Organizations may later choose to introduce a configurable temporary quotation hold, but this is not required for the initial version.
# 8. RESERVED
RESERVED means the customer has a confirmed future rental requirement.
A reservation may exist before exact physical machines have been selected.
Example:
Customer:
ABC Construction

Requirement:


- 3 × 12 m Electric Scissor Lift

Period:

- 01 December – 20 December

Physical Machines:

- Not yet assigned

This must be supported.
A reserved rental must affect future availability and capacity planning.


# 9. Reservation by Category or Model
The system must allow reservation based on:
- exact machine;
- machine model;
- machine category;
- equipment specification.
Examples:
```
Exact Machine:
ES1012-0047

or:
Model:
Galen ES1012
Quantity:
2

or:
Category:
12 m Electric Scissor Lift
Quantity:
3
```
The physical machine may be assigned later.
This is necessary because rental companies often confirm the commercial requirement before deciding which exact fleet unit will be delivered.
# 10. Rental Item
A RentalItem represents an equipment requirement inside a rental.
Example:
Rental:
R-2026-0042

Rental Item:
12 m Electric Scissor Lift

Quantity:
2

Rate:
25,000 TRY / month

A RentalItem may reference:
- category;
- model;
- requested specifications;
- quantity;
- pricing;
- planned start;
- planned end.
It does not necessarily reference a physical machine.
# 11. Multiple Rental Items
One rental may contain different equipment types.
Example:
Rental R-2026-0042

Item 1:
2 × 12 m Electric Scissor Lift

Item 2:
1 × 20 m Articulated Boom Lift

Item 3:
1 × 5 t Forklift

Each item may have its own:
- quantity;
- rate;
- pricing unit;
- planned period;
- assignments;
- return status.
# 12. Physical Machine Assignment
Physical machines must be associated through RentalMachineAssignment.
Conceptually:
```
Rental
   ↓
RentalItem
   ↓
RentalMachineAssignment
   ↓
Machine
```
This allows physical machines to be assigned or replaced without changing the original commercial RentalItem.

# 13. Assignment Timing
Machine assignment may happen:
- when the reservation is created;
- shortly before delivery;
- during rental preparation;
- when the machine is dispatched.
The system must not require exact machine assignment at the beginning of the rental process.

# 14. Assignment History
Machine assignments must preserve history.
Do not overwrite the original assignment when a machine is replaced.

Example:
```
Rental Item:
1 × ES1012

Assignment 1:
ES1012-0041
10 Nov → 17 Nov

Assignment 2:
ES1012-0062
17 Nov → 30 Nov
```
The system must preserve the fact that both machines participated in the same rental.
# 15. Machine Replacement During Rental
A physical machine may be replaced during an active rental without creating a new rental.

Example:
```
Rental:
R-2026-0042

Original Machine:
ES1012-0041

Reason:
Hydraulic fault

Replacement:
ES1012-0062

The rental remains:
ACTIVE
```
The original assignment is ended and the replacement assignment begins.
Replacement history must include:
- original machine;
- replacement machine;
- replacement date/time;
- user;
- reason;
- optional notes;
- associated fault/work order where applicable.

# 16. Replacement Reasons
Replacement reasons may include:

- BREAKDOWN
- CUSTOMER_REQUEST
- SCHEDULE_CHANGE
- MACHINE_UPGRADE
- MACHINE_DOWNGRADE
- TRANSPORT_ISSUE
- PLANNED_MAINTENANCE
- OTHER

These internal identifiers must remain language-independent.
Organizations may add descriptive notes.

# 17. ACTIVE Rental
A rental becomes ACTIVE when the equipment has entered the actual rental period and the organization confirms that the rental has started.
Starting a rental is an explicit business action.
Examples:
- equipment delivered to site;
- customer collected equipment;
- handover completed;
- contract activated.
Telemetry must not automatically set a rental to ACTIVE.

# 18. Planned Dates and Actual Dates
The system must distinguish between planned and actual dates.
Examples:
```
planned_start_at
planned_end_at

actual_start_at
actual_end_at
```
This distinction is important.
Example:
```
Planned Start:
10 November 08:00

Actual Start:
10 November 13:40
```
Historical reporting must preserve both.

# 19. Contractual Dates and Machine Assignment Dates
The rental-level dates represent the overall commercial agreement.
Individual machine assignments may have different actual times.
Example:
```
Rental:
01 Nov – 30 Nov

Machine A:
01 Nov – 30 Nov

Machine B:
05 Nov – 20 Nov

Machine C replacement:
20 Nov – 30 Nov
```
The architecture must support this without changing historical records.

# 20. Rental Extension
An active or reserved rental may be extended.
Before approving an extension, the platform must check for future conflicts.
Example:
Current Rental:
```
Machine ES1012-0041
01 Nov – 15 Nov

Requested Extension:
Until 25 Nov

Future Reservation:
ES1012-0041
20 Nov – 30 Nov
```
The system must warn the user that the extension conflicts with the future reservation.

# 21. Extension Conflict Handling
When a conflict exists, the user may choose an appropriate business solution.
Examples:
- reject the extension;
- assign another machine to the future rental;
- replace the current customer's machine;
- replace the future customer's planned machine;
- shorten the extension;
- manually override where permitted.
The platform must not silently create overlapping assignments.

# 22. Manual Conflict Override
Certain authorized users may override scheduling conflicts.
An override must require:
Reason
User
Timestamp
Affected Rental
Affected Machine

The override must create an audit event.
Permission example:
rentals.conflict_override

# 23. Partial Return
A rental containing multiple machines must support partial returns.
Example:
```
Rental:
5 Machines

Returned:
2 Machines

Still Rented:
3 Machines

The rental remains:
ACTIVE
```
until all required rental items and machine assignments have been resolved.
Each machine assignment must therefore have its own assignment and return history.
# 24. Rental Completion
A rental may become COMPLETED only when the commercial rental operation has been concluded.
Normally this requires:
- all rented equipment returned or otherwise resolved;
- active assignments ended;
- return information recorded;
- any required commercial closure completed.
Machine inspection or maintenance may continue after the rental itself has been completed.

# 25. Return Process
Returning a machine is separate from completing the entire rental.
A return should record:
```
Returned Machine
Return Date and Time
Return Branch / Location
Operating Hours if available
Battery State if relevant
Fuel Level if relevant
Visible Damage
Customer Notes
Internal Notes
Photos
Returned Accessories
Responsible User
```
Not every field is mandatory for every machine category.

# 26. Return Inspection
A returned machine must not necessarily become immediately rentable.
The platform should support a return inspection process.
Conceptually:
```
Customer Return
      ↓
Machine Returned
      ↓
Return Inspection
      ↓
Machine Cleared
      ↓
AVAILABLE
```
or:
```
Customer Return
      ↓
Return Inspection
      ↓
Problem Found
      ↓
SERVICE_REQUIRED
      ↓
Maintenance / Repair
      ↓
AVAILABLE
```
27. Rental State and Service State Are Separate
Machine rental state must not be confused with machine service state.
Example:
```
Rental State:
NOT_RENTED

Service State:
MAINTENANCE_REQUIRED

This machine is not currently rented, but it is also not available.
Similarly:
Rental State:
RENTED

Service State:
NORMAL
```
is possible.

Separate state dimensions must be maintained.
# 28. Availability Is Derived
The system must not store a simplistic authoritative boolean such as:
is_available = true

as the sole availability mechanism.
Availability should be derived from several factors.
Examples:
- machine lifecycle state;
- rental assignment;
- reservation;
- service state;
- maintenance block;
- inspection block;
- internal hold;
- branch transfer;
- machine status.
Conceptually:
```
Machine
   │
   ├── Rental State
   ├── Reservation State
   ├── Service State
   ├── Lifecycle State
   └── Operational Restrictions
          │
          ▼
     Derived Availability
```
# 29. Availability Period
Availability is time-dependent.
A machine may be:
Available Today
Unavailable Next Week
Available Again Next Month

The system must therefore calculate availability for requested periods.
Example:
Requested Period:
10–20 December

The system must check whether the machine has:
- active rental;
- reserved rental;
- maintenance block;
- transfer;
- other scheduling conflict;
during that period.
# 30. Category-Level Availability
Because reservations may occur before exact machine assignment, the system must also support capacity planning.
Example:
Fleet:
10 × 12 m Scissor Lift

Existing Reservations:
6 units

Requested Reservation:
3 units

Remaining planned capacity:
1 unit

This calculation may be based on:
- category;
- model;
- branch;
- requested period.
Capacity calculations must not require exact machines to have already been assigned.
# 31. Branch-Aware Availability
Where organizations use branches, availability must consider the relevant branch.
Example:
Ankara Branch:
5 ES1012

Istanbul Branch:
4 ES1012

A reservation for Ankara should not automatically treat Istanbul machines as locally available.
Cross-branch transfer may be possible but must be treated as an explicit operational decision.
# 32. Branch Transfer
Machines may move between branches.
A planned branch transfer may temporarily block rental availability.
Example:
Machine:
ES1012-0041

Current Branch:
Ankara

Transfer:
Ankara → Istanbul

Transfer Date:
15 November

Rental assignments must consider planned transfers.
Future logistics functionality may expand this area.

# 33. Pricing Model
The initial rental system must support:

- AILY
- WEEKLY
- MONTHLY
- FIXED_PERIOD
- MANUAL

Pricing must allow negotiated customer-specific amounts.

The platform must not assume that every company calculates rental prices using the same formula.
# 34. Price Snapshot
Rental prices must be stored as a snapshot when agreed.
Example:
```
A machine's standard monthly price today may be:
25,000 TRY

Six months later it may become:
30,000 TRY

A historical rental must continue to show:
25,000 TRY
```
Therefore, changing the current machine/model price must not modify historical rentals.

# 35. Standard Rate vs Negotiated Rate
The system may suggest a standard rate.
```
Example:
Standard Monthly Rate:
30,000 TRY

The authorized user may negotiate:
Agreed Monthly Rate:
27,500 TRY

Both may be preserved for commercial analysis.
Example fields:
standard_rate_snapshot
agreed_rate
discount_amount
discount_percentage
```
Exact physical schema will be defined later.
# 36. Currency
Every monetary amount must have an explicit currency.
Examples:
- 25,000 TRY
- 1,200 EUR
- 1,500 USD

Never infer currency solely from organization location.
Currency is not changed when the user changes application language.
# 37. Decimal Precision
Financial values must never rely on JavaScript floating-point arithmetic for authoritative calculations.
Use:
- PostgreSQL numeric;
- decimal arithmetic;
- or integer minor units where appropriate.
Exact implementation is defined in the finance architecture.
# 38. Additional Charges
A rental may contain charges beyond machine rental.

Examples:
- DELIVERY
- COLLECTION
- INSURANCE
- CLEANING
- DAMAGE
- FUEL
- BATTERY_CHARGING
- OPERATOR
- ACCESSORY
- LATE_RETURN
- OTHER

These should be represented as structured rental charges rather than merged into a free-text total.

# 39. Transport
Delivery and collection must be supported as part of the rental workflow.
Rental transport information may include:

- Delivery Required
- Collection Required
- Delivery Address
- Collection Address
- Planned Delivery Time
- Actual Delivery Time
- Planned Collection Time
- Actual Collection Time
- Transport Charge
- Driver
- Vehicle
- Transport Notes

Transport logistics may later become a larger separate module.
The initial architecture should not prevent that evolution.

# 40. Customer Site
A rental may occur at a customer location different from the customer's registered company address.

Example:

Customer:
ABC Construction

Registered Address:
Istanbul

Rental Site:
Ankara Factory Project

The rental must therefore store or reference the relevant worksite/delivery address.

# 41. Address Snapshot
When important for historical contracts, address information should be preserved as a snapshot.
If the customer later changes their registered address, historical rental documents must still represent the address used at the time of the rental.
# 42. Collection and Delivery Status
Transport status should be separate from rental status.
Example transport statuses may include:
```
NOT_REQUIRED
PLANNED
READY
IN_TRANSIT
DELIVERED
COLLECTION_PLANNED
COLLECTED
CANCELLED

A rental may therefore be:
Rental Status:
RESERVED

Delivery Status:
PLANNED

or:
Rental Status:
ACTIVE

Delivery Status:
DELIVERED
```
# 43. Rental Cancellation
A rental may be cancelled before completion when permitted.

Cancellation must preserve the record.

Do not delete the rental.

Record:
- cancelled_at
- cancelled_by
- cancellation_reason

Future commercial rules may support cancellation fees.
# 44. Cancelled Reservations and Availability
When a reserved rental is cancelled, its capacity and machine assignments must be released unless another business block exists.
Cancellation must not erase historical assignment records.
# 45. Late Return
If the planned end time has passed while equipment remains rented, the system should identify the rental as overdue.
Example derived condition:
Rental Status:
ACTIVE

planned_end_at:
10 November 17:00

Current Time:
11 November 09:00

Derived:
OVERDUE

OVERDUE should initially be treated as a derived operational condition rather than necessarily becoming a new core rental lifecycle status.
# 46. Rental Extension vs Late Return
An extension is an authorized change to the rental period.
A late return is a machine remaining rented beyond the agreed end without the planned period having been formally extended.
These must be distinguished.
# 47. Rental Pricing After Extension
An extension may change the commercial price.
The system must preserve:
- original period;
- original agreed pricing;
- extension period;
- extension pricing;
- user who approved it;
- approval time.
The exact calculation method may differ between organizations.
The software must not assume that extending a monthly rental by three days always means:
monthly_rate / 30 × 3

unless that pricing rule has been explicitly configured.
# 48. Flexible Pricing Rules
Different rental companies may use different pricing policies.
Examples:
- exact calendar day pricing;
- 30-day month;
- weekly rate;
- weekend-inclusive pricing;
- weekend-excluded pricing;
- minimum rental period;
- negotiated fixed amount;
- monthly renewal;
- custom customer contract rate.
The platform architecture must allow organization-specific pricing configuration.
Initial versions may use simpler manually agreed rates while preserving the ability to introduce more advanced rate engines later.

# 49. Reservations and Pricing
Creating a reservation should preserve the commercial rate agreed for that reservation.
Changing the standard price later must not retroactively modify the reservation.

# 50. Customer-Specific Pricing

Future versions may support customer price agreements.

Example:
Customer:
ABC Construction

12 m Scissor Lift:
24,000 TRY/month

General Rate:
30,000 TRY/month

The rental may automatically suggest the customer-specific rate, but the final agreed amount must still be stored as a snapshot.
# 51. Discounts

Discounts may be:
- percentage;
- fixed amount;
- item-level;
- rental-level.

Authorized permissions should control who may apply discounts beyond configured thresholds.

Example:
- rentals.discount.apply
- rentals.discount.override_limit

# 52. Taxes

Tax treatment must not be hard-coded into the rental domain.

Rental amounts should preserve:
- net amount;
- applicable tax information;
- tax amount where needed;
- gross amount.

Accounting and invoicing requirements may later be integrated with external ERP/accounting systems.
# 53. Accounting Boundary

The rental platform does not initially need to become a full accounting system.

The rental domain owns:
- agreed rental prices;
- rental charges;
- discounts;
- commercial totals;
- rental revenue attribution.

Accounting systems may own:
- invoice issuance;
- payment collection;
- general ledger;
- tax declarations;
- statutory accounting.

Future integrations may synchronize these areas.
# 54. Contract Documents
A rental may have associated documents.

Examples:
```
Quotation
Rental Contract
Delivery Form
Return Form
Inspection Report
Customer Purchase Order
Signed Agreement
Damage Report
Photos
```
Documents are managed through the shared document system.
# 55. Contract Version History
Replacing a contract document must not erase historical versions where legal or operational history matters.
Future implementation may support:
Contract Version 1
Contract Version 2
Signed Contract

# 56. Customer Purchase Order
A rental may optionally reference:
Customer PO Number
Customer Reference
Project Code
Cost Center

These are common commercial references and should not require free-text notes only.
# 57. Rental Notes
The system should distinguish structured business fields from notes.
Notes may include:
Internal Notes
Customer-Facing Notes
Delivery Notes
Return Notes
Commercial Notes

Sensitive internal notes must not automatically appear in customer-facing documents.
# 58. Machine Eligibility
A machine should not normally be assignable if its lifecycle or service state makes it unsuitable.
Examples:
DECOMMISSIONED
SOLD
OUT_OF_SERVICE
MAINTENANCE_BLOCKED
RETURN_INSPECTION_REQUIRED

Authorized users may override certain conditions where organizational policy permits.
Critical safety/service blocks must not be bypassed merely through normal rental permissions.
# 59. Machine Availability Warning
The UI must clearly explain why a machine cannot be assigned.
Do not show only:
Unavailable

Show the reason where the user has permission.
Examples:
Reserved until 20 Nov

Active rental R-2026-0038

Preventive maintenance scheduled

Return inspection pending

Transferred to Istanbul Branch

# 60. Assignment Conflict Detection
Before creating or changing a physical machine assignment, the backend must validate the requested time range.
Conflict validation must not rely only on frontend checks.
The backend is authoritative.
# 61. Concurrent Changes
Two users may attempt to assign the same machine at approximately the same time.
The backend must prevent both assignments from being accepted if their periods conflict.
Database transactions and concurrency controls must preserve scheduling integrity.
# 62. Machine Reservation Hold
Temporary UI selection must not automatically become a confirmed reservation.
If temporary holds are introduced later, they must:
- have an expiry;
- identify the holding user/session;
- automatically release;
- remain separate from confirmed reservations.
# 63. Rental Permissions
Rental actions must use permissions rather than role names.

Examples:
```
rentals.view
rentals.create
rentals.edit
rentals.quote
rentals.reserve
rentals.start
rentals.extend
rentals.complete
rentals.cancel
rentals.assign_machine
rentals.replace_machine
rentals.return_machine
rentals.conflict_override
rentals.discount.apply
rentals.pricing.view
rentals.pricing.edit
```

Roles are collections of permissions.

The backend must enforce permissions.
# 64. Financial Visibility

A user may be allowed to operate rentals without seeing sensitive financial values.

Example:
```
Operations User:
Can see machine, customer, dates, delivery

Cannot see:
Purchase cost
Profit
Margin
ROI
```

Rental operational access and financial access must remain separate.
# 65. Audit Trail
Important rental actions must create audit records.

Examples:
- Rental created
- Quote issued
- Reservation confirmed
- Dates changed
- Machine assigned
- Machine removed
- Machine replaced
- Rental started
- Rental extended
- Price changed
- Discount applied
- Conflict overridden
- Machine returned
- Rental completed
- Rental cancelled


Audit records should include:
- organization_id
- user_id
- action
- entity_type
- entity_id
- timestamp
- before
- after

reason where applicable


Sensitive audit data must respect access permissions.
# 66. Notifications
Rental events may generate notifications.
Examples:
Rental starting tomorrow

Rental ending tomorrow

Rental overdue

Machine not yet assigned

Future reservation conflict

Delivery due today

Collection due today

Machine replacement required

Return inspection pending

Notification preferences may be organization-specific and user-specific.
# 67. Rental Calendar
The rental calendar is a visualization of rental and reservation data.
It must not maintain a separate authoritative scheduling database.
The calendar should derive information from:
- rentals;
- rental items;
- assignments;
- reservations;
- maintenance blocks;
- branch transfers where relevant.
# 68. Calendar Views
Useful calendar views may include:
- By Machine
- By Category
- By Model
- By Branch
- By Customer
- By Rental

Future capacity planning may visualize unassigned category/model reservations as demand blocks.
# 69. Telemetry and Rentals
Telemetry can enrich rental operations.

Examples:
- Current location
- Operating hours
- Machine activity
- Battery state
- Faults
- Utilization

However:

Telemetry state != Rental state

- A machine physically moving does not mean the rental started.
- A machine stopping does not mean the rental ended.
- A device becoming offline does not mean the machine was returned.
- A machine appearing at the depot through GPS does not automatically complete the rental.
# 70. Telemetry-Assisted Suggestions
The software may make suggestions based on telemetry.
Example:
```
Machine ES1012-0041 appears to have returned to Ankara Depot.

Rental R-2026-0042 is still ACTIVE.

Would you like to begin the return process?
```

The system may assist the user, but an authorized user must confirm the rental action.

# 71. Operating Hours at Rental Start and End
Where telemetry provides reliable operating hours, the system may automatically capture suggested readings.
Example:
Start:
428.3 h

Return:
512.7 h

Rental Usage:
84.4 h

These readings must preserve source information.
Manual correction may be allowed with audit history.
# 72. Physical Utilization vs Rental Utilization
Rental utilization and physical machine utilization are different metrics.
Example:
Rental Duration:
30 days

Machine physically operated:
48 hours

Both are useful.
Rental utilization is derived from rental periods.
Physical utilization may be derived from telemetry/operating hours.
The finance and analytics modules will define the final formulas.
# 73. Fault During Rental
A telemetry fault does not automatically terminate or replace the rental.
A fault may create:
- notification;
- maintenance recommendation;
- work order;
- service block;
- replacement recommendation.
Authorized users determine the commercial rental action.
# 74. Maintenance During Rental
A machine may require service while rented.
Possible outcomes include:
- service performed at customer site;
- machine temporarily unavailable;
- machine replaced;
- rental continues;
- rental period adjusted.
Maintenance and rental records must remain linked but separate.
# 75. Work Order Link
A replacement or service event may reference a maintenance work order.
Example:
Rental:
R-2026-0042

Machine:
ES1012-0041

Replacement Reason:
BREAKDOWN

Work Order:
WO-2026-0184

This provides traceability between commercial and technical operations.
# 76. Damage
Return inspection may identify damage.

Damage information may include:

- Description
- Photos
- Estimated Cost
- Responsible Party
- Chargeable to Customer
- Associated Rental
- Associated Machine
- Associated Work Order

Damage charge handling will integrate with rental charges and finance.
# 77. Accessories
Future versions should support rental accessories.
Examples:
Charger
Extension Cable
Harness
Key
Remote Controller
Fork Extensions
Battery Charger
Spare Battery

Accessories may eventually be:
- individually tracked;
- quantity-based;
- chargeable;
- required to be returned.
The initial architecture must avoid preventing this future capability.
# 78. Reservation Capacity
An unassigned reservation consumes planned fleet capacity.
Example:
```
Category:
12 m Scissor Lift

Fleet available for period:
8

Confirmed unassigned reservations:
5

New request:
4
```

The system should warn:

Demand exceeds planned fleet capacity by 1 unit.

An authorized user may still accept the reservation if the organization expects to:
- purchase equipment;
- transfer equipment;
- sub-rent equipment;
- receive returned equipment;
- use another compatible model.
# 79. Compatible Equipment
Future versions may allow compatible models/categories to satisfy a reservation.
Example:
Requested:
12 m Electric Scissor Lift

Possible:
Galen ES1012
Alternative:
Equivalent approved 12 m model

Substitution must not happen silently.
The assigned machine must always be visible.
# 80. Sub-Rental / Rent-to-Rent
The initial platform may later support externally sourced equipment.
Conceptually:
```
Customer Rental
      ↓
Rental Item
      ↓
Externally Sourced Machine
```

This should remain a future capability unless explicitly included in the initial implementation.

The core domain should not assume every rented machine is permanently owned by the rental company.
# 81. Rental Source
Future equipment sourcing may distinguish:
OWN_FLEET
EXTERNAL_RENTAL
PARTNER_FLEET
OTHER

This is not required for the initial release but should remain architecturally possible.
# 82. Machine Purchase and Sale
Machine acquisition and disposal belong primarily to machine/finance domains.
A machine sold or decommissioned must no longer be assigned to new rentals after the effective date.
Historical rentals must remain visible.
# 83. Deleted Records
Important rental records should normally be archived or cancelled rather than physically deleted.
Examples:
Rental
Assignment
Replacement
Return
Charge

Hard deletion should be restricted to exceptional administrative or development scenarios.
# 84. Timezones
Rental timestamps must be stored consistently.
Recommended storage:
UTC

Presentation uses the relevant organization/user timezone.
The organization must have a configured default timezone.
Example:
Europe/Istanbul

# 85. Date-Only vs Date-Time Rentals
Some rental businesses think in calendar dates while others require exact delivery times.
The system should support date-time precision internally.
The UI may simplify this depending on organization workflow.
Example:
01 Nov 2026 08:00
to
30 Nov 2026 17:00

# 86. Organization-Specific Rules
Different rental companies may use different workflows.
Therefore, avoid hard-coding assumptions such as:
All rentals require quotations.

All returns require inspection.

All reservations require exact machines.

All customers use monthly pricing.

The architecture should allow configuration over time.
Initial sensible defaults may be provided.

# 87. Initial Recommended Workflow
The default workflow for the initial product is:
```
Create Customer
      ↓
Create Rental
      ↓
Add Rental Items
      ↓
Set Planned Dates
      ↓
Set Pricing
      ↓
Create Quote if required
      ↓
Confirm Reservation
      ↓
Assign Physical Machines
      ↓
Plan Delivery / Collection
      ↓
Start Rental
      ↓
Operate Rental
      │
      ├── Extend if required
      ├── Replace machine if required
      └── Add charges / notes
      ↓
Return Machine(s)
      ↓
Return Inspection
      ↓
Release Machine or Send to Maintenance
      ↓
Complete Rental
```

# 88. Example Rental Scenario
Example:
```
Customer:
ABC Construction

Rental:
R-2026-0042

Period:
01 Nov – 30 Nov

Requirement:
2 × 12 m Electric Scissor Lift

Rate:
25,000 TRY/month each

At reservation:
Physical Machines:
Not assigned

On 30 October:
Machine 1:
ES1012-0041

Machine 2:
ES1012-0057

On 1 November:
Rental becomes ACTIVE.

On 12 November:
ES1012-0041 develops a fault.

Rental remains:
ACTIVE

Assignment history becomes:
ES1012-0041
01 Nov – 12 Nov

ES1012-0062
12 Nov – 30 Nov

On 20 November:
Customer asks to keep ES1012-0057 until 10 December.

The system detects:
ES1012-0057 has another reservation from 05 December.

The user must resolve the conflict.
On 30 November:
ES1012-0062 returned.

The other machine remains active if its extension is approved.
The rental therefore remains:
ACTIVE

until all equipment is returned/resolved.
After return inspection:
ES1012-0062:
AVAILABLE

ES1012-0057:
Still rented

When the final machine is returned and commercial closure is complete:
Rental:
COMPLETED
```
# 89. Backend Authority
All critical business rules must be enforced by the backend.
The frontend may provide early warnings and validation, but the backend remains authoritative for:
- permissions;
- availability;
- date conflicts;
- machine assignment;
- pricing changes;
- lifecycle transitions;
- cancellation;
- completion;
- overrides.
Never rely only on UI validation.
# 90. Rental State Transition Validation
Not every transition should be allowed.
Examples:
```
DRAFT → QUOTED
Allowed

QUOTED → RESERVED
Allowed

RESERVED → ACTIVE
Allowed

ACTIVE → COMPLETED
Allowed

DRAFT → CANCELLED
Allowed

RESERVED → CANCELLED
Allowed

Invalid example:
COMPLETED → ACTIVE
```

This should not normally be allowed.

Corrections to completed rentals should use controlled amendment/reopening processes if introduced later.
# 91. State Transition Reasons

Certain transitions may require reasons.

Examples:

- Cancellation
- Conflict Override
- Completed Rental Reopening
- Machine Replacement
- Manual Date Override
- Pricing Override

These reasons must be retained in audit history.
# 92. Idempotency
Important business actions should be designed to tolerate accidental repeated requests.

Example:

A user double-clicks:
Start Rental

The system must not create duplicate start events or duplicate assignments.
The same principle applies to:
- return;
- replacement;
- extension;
- cancellation;
- completion;
- charge creation where appropriate.
# 93. Tenant Isolation

Every rental record belongs to an organization.
Examples include:
- Rental
- RentalItem
- RentalMachineAssignment
- RentalCharge
- Rental Documents
- Rental Notes

Users must never access another organization's rental information unless explicitly authorized through a future platform-level support mechanism.
# 94. Search

Rental search should support common business identifiers.

Examples:
- Rental Number
- Customer Name
- Machine Fleet Number
- Machine Serial Number
 - Project Name
- Customer PO
- Date
- Branch
- Status

Search authorization must still respect tenant and permission boundaries.
# 95. Rental Dashboard Indicators
Useful operational metrics may include:

Active Rentals

Reservations Starting Soon

Rentals Ending Soon

Overdue Rentals

Unassigned Reservations

Machines Due for Collection

Machines Due for Delivery

Return Inspections Pending

Reservation Conflicts

Financial dashboard metrics belong to the finance/analytics domain.
# 96. Initial Scope
The first production version should prioritize:
- rental creation;
- customer assignment;
- multiple RentalItems;
- reservation by category/model;
- physical machine assignment;
- multi-machine rentals;
- lifecycle management;
- delivery and collection information;
- daily/weekly/monthly/manual pricing;
- price snapshots;
- extensions;
- conflict detection;
- replacements;
- partial returns;
- return inspection;
- availability calculations;
- additional rental charges;
- rental documents;
- audit history;
- notifications;
- branch-aware scheduling;
- permission-based access.
# 97. Future Capabilities
Possible future expansion includes:
- customer self-service portal;
- online rental reservations;
- automatic quotations;
- advanced price matrix;
- dynamic pricing;
- customer-specific price agreements;
- payment collection;
- credit limits;
- invoicing integration;
- ERP integration;
- CRM integration;
- route optimization;
- transport fleet management;
- subcontracted transport;
- sub-rental / rent-to-rent;
- accessory inventory;
- electronic signatures;
- digital handover;
- automated damage comparison using images;
- contract renewal workflows;
- machine substitution rules;
- AI-assisted fleet allocation;
- predictive rental demand;
- predictive availability;
- automated customer reminders.
# 98. Fundamental Rental Rules
The following rules are architectural requirements:
1. A rental may contain multiple RentalItems.
2. A RentalItem represents a commercial equipment requirement, not necessarily a physical machine.
3. Exact machines may be assigned after the reservation is created.
4. Reservations may be made by category or model.
5. Physical machine assignment history must be preserved.
6. A machine may be replaced during a rental without creating a new rental.
7. Replacement must not overwrite the original assignment.
8. Multiple machines may belong to the same rental.
9. Partial returns must be supported.
10. Rental completion must not require every machine to have identical return times.
11. Planned dates and actual dates must remain separate.
12. Rental-level dates and machine-assignment dates are separate concepts.
13. Extensions must check future conflicts.
14. Scheduling conflicts must not be silently accepted.
15. Manual overrides require permission, reason, and audit history.
16. Availability is derived and time-dependent.
17. Availability must consider rental, reservation, maintenance, lifecycle, and operational restrictions.
18. Category/model reservations must consume planned capacity even before exact machine assignment.
19. Return does not automatically mean immediate availability.
20. Machines may require return inspection or maintenance before becoming available.
21. Rental state and service state must remain separate.
22. Pricing must support daily, weekly, monthly, fixed-period, and manually negotiated arrangements.
23. Agreed pricing must be preserved as a historical snapshot.
24. Historical rental prices must not change when standard prices change.
25. Every monetary amount must have an explicit currency.
26. Transport may be part of the rental workflow.
27. Delivery/collection status is separate from rental status.
28. Cancellation preserves history.
29. Overdue status may be derived from planned end time rather than replacing the core rental lifecycle.
30. Telemetry must never automatically start or complete a rental.
31. Telemetry may suggest business actions but authorized users must confirm them.
32. Machine movement does not define rental state.
33. Device connectivity does not define rental state.
34. Fault events do not automatically end rentals.
35. Maintenance and rental domains must remain linked but independent.
36. Backend validation is authoritative.
37. Permission checks must use permissions, not role names.
38. Operational rental permissions must remain separate from sensitive financial permissions.
39. Important rental changes must be auditable.
40. Tenant data must remain isolated.
41. Important rental history should not be physically deleted.
42. Internal status identifiers must remain language-independent.
43. All user-facing rental terminology must use translation keys.
44. Rental rules must support different organization workflows without requiring separate application codebases.
# 99. Related Documents


This document should be read together with:

01-PROJECT-OVERVIEW.md

02-SYSTEM-ARCHITECTURE.md

03-DOMAIN-MODEL.md

04-UI-UX.md

05-AUTH-AND-PERMISSIONS.md

06-TELEMETRY-IOT.md

08-MAINTENANCE.md

09-FINANCE-ANALYTICS.md

10-SECURITY.md

11-CODING-STANDARDS.md


Where responsibilities overlap:

Rental Business Rules
→ owns rental lifecycle and commercial equipment scheduling

Maintenance
→ owns service rules and work orders

Telemetry
→ owns physical machine telemetry and device data

Finance
→ owns financial analytics and profitability calculations

Authentication and Permissions
→ owns authorization

UI/UX
→ owns presentation and user interaction patterns