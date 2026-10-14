# Finance and Analytics

**Document:** `09-FINANCE-ANALYTICS.md`  
**Status:** Initial Architecture Definition  
**Scope:** Machine economics, rental revenue, costs, profitability, ROI, payback, utilization, depreciation, resale value, fleet analytics, brand/model comparison, reporting, and financial permissions.

---

## 1. Purpose

The finance and analytics domain provides management-level visibility into the commercial and operational performance of machines, rentals, models, brands, branches, customers, and the overall fleet.

The platform is not initially intended to replace a statutory accounting or ERP system.

Its primary purpose is to answer operational and investment questions such as:

- How much revenue has this machine generated?
- How much has this machine cost to maintain?
- Has the machine paid back its acquisition cost?
- Which machine models are most profitable?
- Which models experience the most breakdowns?
- Which machines are commercially rented but rarely physically used?
- What is the fleet utilization rate?
- Which brands have the lowest lifetime maintenance cost?
- What is the estimated current value of the fleet?
- Should a machine be retained, replaced, or sold?

All financial calculations must have clearly defined formulas and must not be independently reimplemented differently on separate pages.

---

## 2. Financial Domain Boundaries

The platform owns management information such as:

```text
Rental Revenue
Machine Acquisition Cost
Maintenance Cost
Direct Machine Costs
Machine Profitability
Utilization
ROI
Payback
Downtime
Resale Value
Fleet Performance
```

---
An external accounting or ERP system may remain authoritative for:
- Issued Invoices
- Customer Payments
- Bank Transactions
- General Ledger
- Tax Declarations
- Official Accounting Records

Future integrations may synchronize these systems.
# 3. FinancialEntry
Where practical, financial events should be represented as structured records rather than repeatedly deriving everything from editable source fields.
Conceptually:
```
FinancialEntry
  │
  ├── organization_id
  ├── machine_id where applicable
  ├── rental_id where applicable
  ├── work_order_id where applicable
  ├── type
  ├── amount
  ├── currency
  ├── occurred_at
  └── source
```
Possible entry types may include:
- RENTAL_REVENUE
- MAINTENANCE_COST
- TRANSPORT_COST
- EXTERNAL_SERVICE_COST
- OTHER_MACHINE_COST
- ACQUISITION
- DISPOSAL

The exact database design may evolve, but analytics must retain traceability back to the source business record.
# 4. Machine Acquisition Cost

Each machine may have acquisition information such as:
- Purchase Price
- Currency
- Purchase Date
- Commissioning Date
- Import Cost
- Transport Cost
- Customs Cost
- Initial Preparation Cost
- Other Capitalized Cost

The platform should distinguish:
Purchase Price

from:
Total Acquisition Cost

A useful management calculation may be:
Total Acquisition Cost
=
Purchase Price
+ Import / Customs Costs
+ Initial Transport
+ Commissioning / Preparation Costs
+ Other Included Acquisition Costs

Organizations may choose which components are included.
Historical acquisition values must never change because of later currency movements.
# 5. Rental Revenue
Rental revenue originates from agreed commercial rental values stored in the rental domain.
Revenue analytics must use agreed historical rental pricing rather than the machine's current standard price.
Example:
Machine:
ES1012-0041

Rental Price Agreed in 2026:
25,000 TRY / month

If the standard rate later becomes:
32,000 TRY / month

the historical rental must still contribute:
25,000 TRY

according to the original commercial agreement.

# 6. Revenue Attribution to Machines
A rental may contain multiple machines and a machine may be replaced during the rental.
Revenue therefore cannot always be attributed using only:
```
Rental Total Revenue → One Machine

Revenue attribution should follow the actual machine assignments where machine-level profitability is required.
Example:
Rental Item:
1 × 12 m Scissor Lift

Rental Duration:
30 days

Agreed Revenue:
30,000 TRY

Machine A serves:
20 days

Machine B replaces it for:
10 days

A simple time-based attribution may produce:
Machine A:
20,000 TRY

Machine B:
10,000 TRY
```

The exact allocation policy should be configurable where required.

The system must retain enough information to explain how attributed revenue was calculated.

# 7. Additional Rental Charges
Not every rental charge should automatically count as machine rental revenue.

Examples:
- Delivery
- Collection
- Insurance
- Fuel
- Cleaning
- Damage
- Operator
- Late Return
- Other Charges

Analytics should distinguish:
Equipment Rental Revenue

from:
Additional Service Revenue

and:
Customer Damage Recovery

Transport charges, for example, should not artificially make a machine appear more profitable unless the organization intentionally includes them in machine profitability calculations.
# 8. Maintenance and Repair Costs
Maintenance costs may originate from the maintenance domain.
Possible components include:
Parts
Internal Labor
External Labor
External Service
Transport
Inspection
Other Technical Costs

The platform should support both:
Preventive Maintenance Cost

and:
Corrective Maintenance Cost

so users can analyze whether a machine or model requires excessive repair spending.
# 9. Other Direct Machine Costs
Future analytics may include additional costs such as:
Insurance
Registration
Battery Replacement
Tire Replacement
Telematics Subscription
SIM Cost
Storage
Cleaning
Transportation
Financing Cost
Other Direct Operating Costs

Organizations may choose which cost categories contribute to particular profitability metrics.
Cost definitions must therefore be centralized rather than hard-coded independently into dashboard components.

# 10. Lifetime Machine Revenue and Cost
For a selected machine, the platform should provide a lifetime financial summary.
Example:
Acquisition Cost:
800,000 TRY

Lifetime Rental Revenue:
1,150,000 TRY

Maintenance Cost:
145,000 TRY

Other Direct Costs:
60,000 TRY

Resale Proceeds:
Not Yet Sold

The platform must allow the user to inspect the underlying transactions that produced these totals.
# 11. Contribution Generated by a Machine
A useful management metric is machine contribution.
Initial definition:
Machine Contribution
=
Attributed Rental Revenue
- Maintenance Cost
- Other Included Direct Machine Costs

This is a management metric.
It should not automatically be labeled as statutory accounting profit.
Additional service revenue may be included or excluded according to the organization's chosen reporting policy.

# 12. Simple ROI
The platform may calculate a simple machine ROI.
Recommended initial formula:
```
Simple ROI (%)
=
Machine Contribution
÷ Total Acquisition Cost
× 100

Example:
Acquisition Cost:
1,000,000 TRY

Lifetime Contribution:
600,000 TRY

Then:
Simple ROI:
60%
```

The UI should clearly identify which ROI definition is being displayed.
Do not simply label a number ROI if multiple calculation methods exist.

# 13. Payback
Payback answers:
When did the cumulative contribution generated by the machine recover its acquisition cost?

Conceptually:
```
Cumulative Machine Contribution
        ↓
Compare Against
        ↓
Total Acquisition Cost

The payback date is the first date where:
Cumulative Contribution >= Acquisition Cost

Example:
Machine Acquired:
January 2026

Acquisition Cost:
1,000,000 TRY

Cumulative Contribution Reaches:
1,000,000 TRY

Date:
August 2028

Payback period:
Approximately 31 months
```

The system should calculate payback from historical financial events rather than merely dividing acquisition cost by the current month's revenue.

# 14. Depreciation
Depreciation must remain separate from operational machine contribution.
The platform may support management depreciation calculations such as:

Straight-Line Depreciation

but must not assume that management depreciation equals statutory or tax depreciation.
Possible inputs include:
Acquisition Cost
Useful Life
Residual Value
Depreciation Start Date

Example:
Acquisition Cost:
1,000,000 TRY

Residual Value:
200,000 TRY

Useful Life:
5 years

Management annual depreciation:
(1,000,000 - 200,000) / 5
=
160,000 TRY/year

Depreciation assumptions should be configurable and clearly identified as management analytics unless sourced from an accounting integration.

# 15. Resale Value and Machine Disposal
The platform should support:
Estimated Resale Value
Actual Sale Price
Sale Date
Sale Costs

When a machine is sold, historical rental, telemetry, maintenance, and financial information must remain preserved.
A useful lifecycle calculation may include:
```
Lifecycle Economic Result
=
Rental Contribution
+ Net Disposal Proceeds
- Acquisition Cost

where:
Net Disposal Proceeds
=
Sale Price
- Sale-Related Costs
```
The exact metric name must clearly explain its formula.
# 16. Current Machine Value
The platform may display different concepts of value, but they must not be confused.
Possible values include:
Purchase Cost
Book / Management Value
Estimated Market Value
Expected Resale Value
Actual Sale Price

These are separate fields or derived values.
An estimated market value should never silently overwrite the acquisition cost.

# 17. Commercial Utilization
Commercial utilization measures how much of an available period the machine was commercially rented.
Recommended concept:
Commercial Utilization (%)
=
Rentable Time Rented
÷ Rentable Time Available
× 100

Example:
Period:
30 days

Available for Rental:
30 days

Rented:
21 days

Commercial utilization:
70%

18. Availability-Adjusted Utilization
A machine should not necessarily be penalized for periods where it could not legally or technically be rented.
Example:
Calendar Period:
30 days

Maintenance Block:
5 days

Rentable Time:
25 days

Rented:
20 days

Availability-adjusted commercial utilization:
20 / 25 × 100
=
80%

The platform may also display raw calendar utilization:
20 / 30 × 100
=
66.7%

Both are useful, but their names must clearly distinguish them.
19. Physical Utilization
Physical utilization is different from commercial utilization.
Telemetry may show how much the machine actually operated.
Example:
Rental Period:
30 days

Machine Operating Time:
46 hours

A machine can therefore have:
High Commercial Utilization
+
Low Physical Utilization

This distinction is valuable for understanding customer usage patterns, maintenance requirements, battery behavior, and fleet sizing.
# 20. Commercial vs Physical Utilization
The platform should deliberately compare:
Commercial Utilization

with:
Physical Utilization

Example:
Machine A

Commercial Utilization:
85%

Physical Operating Utilization:
18%

This means the machine is commercially productive even though it physically operates for relatively few hours.
For rental equipment, this may be completely normal.
The system must not assume that low physical operation means poor commercial performance.

# 21. Operating Hours and Revenue per Operating Hour
Where operating-hour data is reliable:
```
Revenue per Operating Hour
=
Attributed Rental Revenue
÷ Operating Hours During Relevant Period

Example:
Rental Revenue:
300,000 TRY

Operating Hours:
240 h

Result:
1,250 TRY / operating hour
```
This metric can help compare machine categories with very different usage patterns.
# 22. Maintenance Cost per Operating Hour
Where reliable operating-hours data exists:
```
Maintenance Cost per Operating Hour
=
Maintenance Cost
÷ Operating Hours

Example:
Lifetime Maintenance Cost:
120,000 TRY

Lifetime Operating Hours:
3,000 h

Result:
40 TRY / h
```

This can become particularly useful when comparing machine models and brands.

# 23. Downtime and Reliability
Maintenance downtime should contribute to operational analytics.
Possible metrics include:
```
Total Downtime

Downtime per Year

Breakdown Count

Corrective Work Orders

Mean Time Between Failures

Mean Time To Repair

Availability Rate

Definitions must be centralized.
For example:
Technical Availability (%)
=
Available Technical Time
÷ Total Relevant Time
× 100
```

Exact reliability formulas may be refined as sufficient historical data becomes available.
# 24. Brand and Model Assessment
The platform should support aggregated analysis by:
Manufacturer

Brand

Machine Model

Machine Category

Year

Branch

Fleet Group

This is an important long-term capability because actual fleet history can support procurement decisions.
Example comparison:
12 m Electric Scissor Lifts

Brand A
Brand B
Brand C

Metrics may include:
Average Acquisition Cost
Average Rental Revenue
Average Commercial Utilization
Average Physical Utilization
Average Maintenance Cost
Maintenance Cost per Operating Hour
Corrective Repair Frequency
Average Downtime
Average Resale Value
Average Payback Period
Average ROI

The platform should make it possible to compare these values without implying that correlation automatically proves product quality.

# 25. Machine Age and Cohort Analysis
Comparisons should consider machine age and usage.
It may be misleading to compare:
Brand A:
6-year-old machines

directly with:
Brand B:
1-year-old machines

without context.
Analytics should therefore allow segmentation by:
Machine Age
Purchase Year
Operating Hours
Commissioning Year

where relevant.

# 26. Customer and Rental Analytics
Authorized users may analyze:
Revenue by Customer
Rental Days by Customer
Revenue by Rental
Revenue by Project
Rental Frequency
Average Rental Duration
Machine Categories Rented

Customer profitability may later incorporate:
Discounts
Transport
Damage
Service Costs
Collection Costs

but should not be implemented until the calculation policy is explicitly defined.
# 27. Fleet and Branch Analytics
The platform should support analytics at several levels.
Conceptually:
```
Organization
   ↓
Branch
   ↓
Category
   ↓
Model
   ↓
Machine
```
Examples include:
```
Fleet Revenue
Revenue by Branch
Utilization by Branch
Machines Out of Service
Maintenance Cost by Branch
Revenue by Category
ROI by Model
```
Filters should allow users to move between aggregated and individual-machine views.
# 28. Currency and Multi-Currency

Every monetary value must store an explicit currency.

Example:
```
25,000 TRY

1,500 EUR

1,200 USD

The platform must never add different currencies directly.
Invalid:
25,000 TRY + 1,500 EUR = 26,500
```

Where consolidated reporting across currencies is required, a conversion mechanism must be explicitly defined.
A converted amount should preserve:
Original Amount
Original Currency
Exchange Rate
Rate Date
Converted Amount
Reporting Currency

Historical conversion must not silently change when today's exchange rate changes.

# 29. Reporting Currency
An organization may define a default reporting currency.
Example:

Organization:
BADAL

Reporting Currency:
TRY

Another organization may use:
EUR

Changing the UI language does not change reporting currency.

Currency conversion and localization are separate concerns.

# 30. Historical Integrity and Snapshots
Financial history must remain reproducible.
Changing:
Standard Rental Price

Machine Model Price

Customer Rate

Exchange Rate

Maintenance Cost Estimate

Estimated Resale Value

must not silently change historical finalized transactions.
Where historical calculations depend on changing reference values, the relevant snapshot must be preserved.

# 31. Derived Metrics vs Authoritative Data

Values such as:

ROI

Payback

Utilization

Lifetime Revenue

Profitability

Cost per Operating Hour

are generally derived metrics.
They should normally be calculated from authoritative underlying records rather than manually edited.
For performance, derived values may later be:
Cached
Materialized
Pre-Aggregated

but the underlying source data remains authoritative.

# 32. Financial Permissions

Financial access must be independent from normal rental or maintenance access.
Possible permissions include:
finance.view

finance.machine_cost.view

finance.acquisition_cost.view

finance.revenue.view

finance.profitability.view

finance.analytics.view

finance.analytics.export

finance.entries.create

finance.entries.edit

finance.resale_value.edit

A technician may manage maintenance without seeing machine ROI.
A rental operator may manage reservations without seeing acquisition cost or profitability.
A General Manager may receive broader financial access.
Authorization must check permissions rather than role names.

# 33. Financial Data Exposure

Backend APIs should avoid sending unauthorized financial fields whenever possible.
Do not rely only on hiding UI components.
For example, a user without:
finance.acquisition_cost.view

should not receive:
purchase_price
total_acquisition_cost

from an API response merely because the frontend hides those values.
Financial authorization must be enforced on the server.

# 34. Dashboards
The finance and analytics dashboard may provide indicators such as:
Fleet Revenue

Current Month Revenue

Year-to-Date Revenue

Commercial Utilization

Machines With Highest Revenue

Machines With Lowest Utilization

Machines With Highest Maintenance Cost

Machines That Have Reached Payback

Machines Approaching Payback

Fleet Maintenance Cost

Average Revenue per Machine

Average ROI

Estimated Fleet Resale Value

Users should be able to filter by:
Date
Branch
Category
Model
Manufacturer
Machine
Customer
Rental Status

according to permissions.
# 35. Charts and Time-Series Analysis

Financial and operational trends should support time-based analysis.
Examples:
Monthly Rental Revenue

Monthly Utilization

Maintenance Cost Over Time

Cumulative Machine Revenue

Cumulative Machine Contribution

Payback Progress

Downtime Over Time

Operating Hours Over Time

Charts should use centralized backend calculations or shared analytics functions rather than independently reproducing financial formulas in the frontend.

# 36. Machine Financial Detail
A machine detail page should eventually provide a financial summary similar to:
Machine:
ES1012-0041

Acquisition Cost:
850,000 TRY

Lifetime Rental Revenue:
1,240,000 TRY

Maintenance Cost:
115,000 TRY

Other Direct Costs:
40,000 TRY

Contribution:
1,085,000 TRY

Simple ROI:
127.6%

Payback:
Reached

Commercial Utilization:
74%

Operating Hours:
2,840 h

Maintenance Cost / Hour:
40.49 TRY/h

Estimated Resale Value:
420,000 TRY

Each derived value should allow users to understand its calculation where practical.

# 37. Exports and Management Reports

Authorized users should be able to export financial and operational analytics as:
PDF
XLSX

Possible reports include:
Machine Financial Report

Fleet Profitability Report

Utilization Report

Maintenance Cost Report

Brand / Model Comparison

Branch Performance Report

Machine Investment Assessment

Fleet Valuation Report

PDF reports should be presentation-oriented.
XLSX exports should provide structured data suitable for further analysis.
Exported information must respect the requesting user's permissions.
Financial exports must never expose hidden acquisition cost, margin, profitability, or other restricted fields simply because an export was requested.

# 38. Machine Investment / Disposal Assessment
The platform should eventually help management evaluate whether to:
KEEP

REPAIR

RECONDITION

REPLACE

SELL

a machine.
An assessment may combine:
Machine Age
Operating Hours
Commercial Utilization
Physical Utilization
Lifetime Revenue
Maintenance Cost
Recent Repair Frequency
Downtime
Estimated Future Repair Cost
Estimated Resale Value
Current Demand

The system may provide decision support, but it should not automatically make disposal decisions.
This feature may later use AI, but AI recommendations must remain explainable and advisory.

# 39. Initial Scope
The first production version should prioritize:
- machine acquisition cost;
- historical rental revenue;
- machine-level revenue attribution;
- maintenance cost integration;
- direct machine cost categories;
- lifetime machine revenue;
- contribution calculation;
- simple ROI;
- payback calculation;
- commercial utilization;
- availability-adjusted utilization;
- telemetry-based physical utilization;
- revenue per operating hour;
- maintenance cost per operating hour;
- machine-level financial summary;
- branch/category/model aggregation;
- basic brand/model comparison;
- currency-aware calculations;
- financial permissions;
- dashboard filtering;
- PDF/XLSX reporting.
Advanced accounting functionality is not required for the initial release.

# 40. Future Capabilities
Future capabilities may include:
- accounting/ERP integration;
- invoice synchronization;
- payment status;
- customer credit analysis;
- automated exchange-rate feeds;
- detailed depreciation models;
- financing and interest costs;
- budget vs actual analysis;
- machine replacement forecasting;
- residual-value prediction;
- automated fleet valuation;
- advanced customer profitability;
- cost-center reporting;
- dynamic rental pricing;
- demand forecasting;
- AI-assisted purchasing decisions;
- AI-assisted disposal recommendations;
- predictive maintenance cost;
- fleet optimization;
- benchmarking across organizations where legally and contractually permitted.
41. Fundamental Finance and Analytics Rules
The following rules are architectural requirements:
1. Financial analytics do not replace statutory accounting.
2. Historical rental revenue uses agreed historical pricing, not current list prices.
3. Machine-level revenue must account for actual physical machine assignments.
4. Machine replacement must not destroy revenue attribution history.
5. Additional rental charges must remain distinguishable from equipment rental revenue.
6. Maintenance costs must be traceable to their source records.
7. Acquisition cost and current machine value are different concepts.
8. Resale value and actual sale price are different concepts.
9. Machine contribution must have an explicitly defined formula.
10. ROI must always identify the calculation method being used.
11. Payback must be based on cumulative historical economics, not a simplistic current-month estimate.
12. Depreciation must remain distinct from operational contribution.
13. Management depreciation must not automatically be presented as statutory depreciation.
14. Commercial utilization and physical utilization are separate metrics.
15. Availability-adjusted utilization must distinguish technical downtime from rentable time.
16. Low physical utilization does not necessarily mean poor rental performance.
17. Provider-specific telemetry data must not enter finance formulas directly.
18. Financial analytics consume normalized machine and telemetry information.
19. Different currencies must never be summed without explicit conversion.
20. Historical exchange-rate conversions must remain reproducible.
21. Changing UI language must not change currency.
22. Derived analytics should come from authoritative underlying records.
23. Financial formulas must be centrally defined.
24. Frontend components must not independently invent financial calculations.
25. Financial permissions are separate from normal rental and maintenance permissions.
26. Unauthorized financial fields should not be sent by backend APIs.
27. Financial exports must respect the same permissions as the application UI/API.
28. Machine, model, brand, branch, and fleet-level analysis should use the same underlying metric definitions.
29. Historical financial records must survive machine sale, telemetry-provider changes, branch changes, and customer changes.
30. All important financial values must use appropriate decimal handling and explicit currency.
42. Related Documents
This document should be read together with:
01-PROJECT-OVERVIEW.md
02-SYSTEM-ARCHITECTURE.md
03-DOMAIN-MODEL.md
04-UI-UX.md
05-AUTH-AND-PERMISSIONS.md
06-TELEMETRY-IOT.md
07-RENTAL-BUSINESS-RULES.md
08-MAINTENANCE.md
10-SECURITY.md
11-CODING-STANDARDS.md

Responsibility boundaries:
```
Finance / Analytics
→ management economics, profitability, ROI, utilization, fleet analysis

Rental
→ agreed commercial rental values and rental lifecycle

Maintenance
→ technical work, maintenance costs, downtime, repairs

Telemetry
→ physical operating data and normalized machine measurements

Machine Domain
→ acquisition information, machine identity, lifecycle

Accounting / ERP Integration
→ statutory accounting and external financial records

Authentication / Permissions
→ financial access control
```