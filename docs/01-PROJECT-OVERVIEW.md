# 01 - Project Overview

## Document Status

Status: Draft  
Project: Rental Management and Equipment Tracking Platform  
Primary Market: Türkiye  
Future Market: Europe and other international markets

---

# 1. Purpose of This Document

This document defines the overall purpose, scope, users, capabilities, and product direction of the Rental Management and Equipment Tracking Platform.

It is intended to provide a common understanding of what the product is before technical architecture, database design, UI design, authentication, telemetry, and business rules are defined in greater detail.

This document describes WHAT the product should do and WHY it exists.

Technical implementation details belong in the other documents under `/docs`.

---

# 2. Product Vision

The product is a multi-tenant SaaS platform for equipment rental companies.

It combines traditional rental management functions with real-time equipment tracking, machine telemetry, maintenance management, financial analysis, and eventually AI-assisted technical support.

The system will initially be developed for use within our own rental company. After the product has been validated through real-world operation, it will be offered to other rental companies as a SaaS product.

The first target market is Türkiye. The architecture and product design must nevertheless support future international expansion, including multiple languages, currencies, companies, branches, and regional requirements.

The long-term goal is to create one central system where a rental company can understand:

- What machines it owns.
- Where those machines are.
- Which machines are available, reserved, rented, under maintenance, or unavailable.
- Which customer currently has each machine.
- How much each machine earns.
- How much each machine costs.
- Whether each machine is being utilized effectively.
- Whether maintenance is due.
- Whether a machine currently has a fault.
- What the machine is physically doing.
- What actions should be taken when technical problems occur.

The platform should therefore be considered more than a rental ERP and more than a GPS tracking application.

It is intended to become an integrated rental operations, fleet intelligence, and equipment telematics platform.

---

# 3. Core Product Concept

The platform combines two major sources of information.

## 3.1 Business Information

Business information represents what the rental company believes or records about a machine.

Examples include:

- Machine ownership.
- Purchase price.
- Customer assignment.
- Reservation dates.
- Rental contract.
- Rental price.
- Rental start and end dates.
- Branch assignment.
- Maintenance schedule.
- Maintenance cost.
- Machine availability.
- Revenue.
- Expenses.

## 3.2 Physical Machine Information

Physical information represents what is actually happening on the machine.

This information may come from a GPS/telematics device connected to the machine.

Examples include:

- Current location.
- Last known location.
- GPS history.
- Device online/offline status.
- Machine active/inactive state.
- Battery State of Charge.
- Operating hours.
- Machine faults.
- CAN-bus information.
- Other supported sensor or machine data.

The value of the platform comes from combining these two types of information.

For example, the system may know that a machine is marked as available in the rental system while telemetry indicates that it currently has an active critical fault.

Another example may be that a rental contract has ended but GPS data indicates that the machine is still located at the customer's worksite.

These combinations should eventually allow the platform to produce intelligent warnings, reports, and operational insights.

---

# 4. Target Customers

The primary customers of the platform are equipment rental companies.

The initial focus is on companies renting industrial and construction equipment such as:

- Scissor lifts.
- Boom lifts.
- Forklifts.
- Telehandlers.
- Spider lifts.
- Other access equipment.
- Other industrial equipment that can benefit from rental tracking and telematics.

The system should not be designed exclusively around access platforms.

The data model and application should remain flexible enough to support additional equipment categories in the future.

---

# 5. Primary Users

Different employees within a rental company will use the platform for different purposes.

Typical users may include:

- Company owner.
- General manager.
- Rental operations manager.
- Dispatcher.
- Branch manager.
- Finance employee.
- Service manager.
- Service technician.
- Sales employee.
- Fleet manager.
- Read-only user.

Different users must have different permissions.

For example, a service technician may need access to machine location, faults, operating hours, and maintenance records while not being allowed to see machine purchase prices, rental revenues, profit, or ROI.

Similarly, remote machine immobilization must only be available to specifically authorized users.

Detailed roles and permissions will be defined separately in `05-AUTH-AND-PERMISSIONS.md`.

---

# 6. SaaS and Multi-Tenant Model

The platform will be offered as Software as a Service.

Each rental company using the platform must operate inside its own isolated organization, also referred to as a tenant.

Example:

Platform
- Rental Company A
- Rental Company B
- Rental Company C

Each organization may contain its own:

- Users.
- Branches.
- Machines.
- Customers.
- Rentals.
- Financial information.
- Maintenance records.
- Tracking devices.
- Documents.
- Reports.
- Settings.

Data belonging to one rental company must not be accessible by another rental company.

The software provider's own platform administrators must also be treated separately from customer-company administrators.

A platform administrator should not automatically receive unrestricted access to confidential financial information belonging to customer companies.

Data privacy and tenant isolation are fundamental product requirements.

---

# 7. Supported Platforms

The system will support both web and mobile use.

## 7.1 Web Application

The web application will primarily be used for:

- Dashboard and management views.
- Rental operations.
- Fleet management.
- Financial analysis.
- Customer management.
- Reports.
- Administration.
- Machine management.
- Maintenance planning.
- User management.
- Configuration.

## 7.2 Mobile Application

The mobile application will be available for both iOS and Android.

The mobile application will be particularly important for:

- Service technicians.
- Managers.
- Field employees.
- Machine location.
- Machine status.
- Fault information.
- Maintenance work.
- Notifications.
- Remote actions.
- Quick machine lookup.
- QR code scanning.
- Photos and field documentation.

Web and mobile applications should use the same backend and business rules.

---

# 8. Internationalization

The product will initially be used in Türkiye but must be designed for international use from the beginning.

The system must support multiple interface languages.

Initial languages are expected to include:

- Turkish.
- English.

Additional languages may later include European languages such as German, French, Italian, Spanish, or others according to market requirements.

Users should be able to have their own language preference.

Organizations may also have a default language.

The system should not contain interface text directly hard-coded into application components in a way that prevents translation.

The platform must also be designed with future support for multiple currencies, date formats, time zones, and regional conventions.

---

# 9. Authentication and Account Access

Both web and mobile applications will require authenticated user access.

The platform must support standard account functionality including:

- Login.
- Logout.
- Password reset.
- Forgotten password flow.
- User invitation.
- Account activation.
- Session management.

Future support may include:

- Multi-factor authentication.
- Google login.
- Microsoft login.
- Enterprise Single Sign-On.

Authentication and authorization must be handled using established security practices and must not rely on custom password or cryptography implementations.

Detailed authentication rules will be defined separately.

---

# 10. Main Product Modules

The application is expected to contain the following major product areas.

## 10.1 Dashboard

The dashboard provides a high-level overview of the rental company's fleet and business.

Typical information may include:

- Total number of machines.
- Available machines.
- Rented machines.
- Reserved machines.
- Machines under maintenance.
- Machines out of service.
- Machines currently online.
- Machines currently offline.
- Active faults.
- Maintenance due.
- Revenue for a selected period.
- Fleet utilization.
- Fleet distribution by machine category.
- Fleet distribution by working height or other technical attributes.
- Highest earning machines.
- Lowest earning machines.

The exact dashboard design will be defined in the UI/UX documentation.

---

## 10.2 Machine Management

Users must be able to create and manage machines within the fleet.

Typical machine information may include:

- Internal fleet number.
- Manufacturer.
- Model.
- Machine category.
- Serial number.
- Year.
- Working height.
- Lifting capacity.
- Purchase date.
- Purchase price.
- Currency.
- Branch.
- Current status.
- Current customer.
- Tracking device.
- Documents.
- Photos.
- Maintenance information.
- Financial information.

Machines may or may not have a tracking device installed.

The rental management functionality must therefore also work for machines without telemetry.

---

## 10.3 Tracking Device Management

Tracking devices must be managed independently from machines.

A tracking device may be:

- Installed on a machine.
- Removed from a machine.
- Replaced.
- Repaired.
- Reassigned to another machine.

The system must preserve installation history.

A tracking device may contain identifying information such as:

- Provider.
- IMEI.
- Serial number.
- Device model.
- Firmware version.
- Hardware version.
- Last communication time.

The initial tracking provider is expected to be Ruptela.

The application must nevertheless avoid becoming permanently dependent on one telemetry provider.

Provider-specific data should be translated into the platform's own normalized telemetry format.

---

# 11. Machine Telemetry

For machines equipped with compatible tracking devices, the platform should support machine telemetry.

Typical telemetry may include:

- Latitude.
- Longitude.
- Written address.
- Speed.
- Last communication time.
- Device online/offline state.
- Machine active/inactive state.
- Battery State of Charge.
- Machine operating hours.
- Fault information.
- Machine-specific CAN signals.

The exact information available depends on the machine, CAN protocol, and tracking device configuration.

The platform should therefore support different telemetry capabilities for different machine models.

The telemetry provider may decode the proprietary machine CAN protocol before transmitting data to the platform.

For the initial Ruptela integration, Ruptela may embed machine-specific CAN decoding into the tracking device firmware and transmit decoded values using its own telemetry protocol.

Our software must normalize these values before exposing them to the rest of the application.

---

# 12. Maps and Location

Users should be able to view tracked machines on a map.

The map should support:

- Current machine locations.
- Machine status.
- Machine category.
- Search.
- Filtering.
- Machine details.
- Last update time.
- Customer information where permitted.

Selecting a machine on the map should provide a quick summary and allow the user to open the full machine page.

The system should also support written location/address information where practical.

Future capabilities may include:

- Location history.
- Geofences.
- Unauthorized movement alerts.
- Branch geofences.
- Customer worksite geofences.

---

# 13. Remote Machine Control

The system is expected to support remote machine immobilization for compatible equipment.

This is a sensitive and safety-related feature.

Remote immobilization must not be treated as a simple user-interface toggle.

The system must support:

- Permission checks.
- Command creation.
- Command status.
- Device acknowledgement.
- Audit logging.
- Failure handling.
- Command timeout.
- Safe machine-side execution.

The platform should distinguish between statuses such as:

- Requested.
- Sent.
- Acknowledged.
- Failed.
- Expired.

The application must never display a machine as successfully immobilized only because a user clicked the immobilization button.

The tracker or machine must confirm the action.

Machine-side safety behavior will depend on the equipment implementation.

Detailed rules will be defined in the telemetry and security documentation.

---

# 14. Rental Management

The software will provide the core functions required to manage equipment rental operations.

Expected capabilities include:

- Customer creation.
- Customer management.
- Reservation creation.
- Rental creation.
- Machine assignment.
- Rental start date.
- Rental end date.
- Rental extension.
- Rental status.
- Machine availability.
- Delivery information.
- Collection information.
- Rental history.
- Rental pricing.
- Rental revenue.

The system should prevent invalid machine assignments such as overlapping rentals where appropriate.

The software should eventually support both short-term and long-term rental operations.

Detailed rental workflows and business rules will be defined separately.

---

# 15. Customer Management

The system will maintain customer records.

Customers may be companies or individuals depending on market requirements.

Customer records may contain:

- Company name.
- Contact persons.
- Phone numbers.
- Email addresses.
- Billing information.
- Addresses.
- Tax information.
- Notes.
- Rental history.
- Active rentals.
- Documents.

Future development may include CRM-related features, but the initial focus is on information required for rental operations.

---

# 16. Maintenance Management

The platform should allow rental companies to manage preventive and corrective maintenance.

Maintenance may be triggered by:

- Operating hours.
- Calendar intervals.
- Machine faults.
- Manual inspection.
- Technician decision.

Typical maintenance functionality may include:

- Maintenance plans.
- Scheduled maintenance.
- Upcoming maintenance.
- Maintenance history.
- Work orders.
- Technician assignment.
- Service notes.
- Spare parts.
- Maintenance cost.
- Photos.
- Documents.
- Machine downtime.

Example:

A machine may require maintenance every 500 operating hours.

If telemetry reports that the machine currently has 480 operating hours, the system may notify the service department that maintenance is due in 20 hours.

---

# 17. Fault and Error Management

The system should maintain machine fault history.

Fault information may come from:

- CAN-bus telemetry.
- Diagnostic Trouble Codes.
- Machine controllers.
- Manual technician entry.

The platform should distinguish between current faults and historical faults where the telemetry source supports this information.

Fault records may contain:

- Machine.
- Fault code.
- Fault source.
- Severity.
- First detected time.
- Last detected time.
- Active/inactive status.
- Occurrence count.
- Location.
- Supporting telemetry.

This fault history will later become an important data source for maintenance analysis and the AI technical assistant.

---

# 18. Financial Tracking

The system should allow authorized users to understand the financial performance of individual machines and the entire fleet.

Machine financial information may include:

- Purchase price.
- Purchase currency.
- Purchase date.
- Financing cost.
- Transport cost.
- Maintenance cost.
- Repair cost.
- Other operating cost.
- Rental revenue.
- Other machine-related revenue.

The platform should calculate useful indicators such as:

- Total revenue.
- Total cost.
- Profit.
- Return on Investment.
- Payback period.
- Revenue per rental day.
- Revenue per operating hour.
- Maintenance cost per operating hour.

Financial data must only be visible to users with appropriate permissions.

The exact definitions and calculation methods will be defined in `09-FINANCE-ANALYTICS.md`.

---

# 19. Utilization

Utilization is an important concept within the platform.

The system should eventually support more than one utilization measurement.

Examples include:

Rental Utilization:
The percentage of time a machine is rented during a selected period.

Physical Utilization:
The percentage of available time that the machine is physically operating according to telemetry.

Example:

A machine may be rented for 30 days but may only operate for 15 hours.

The combination of rental and physical utilization may provide valuable information for fleet planning, pricing, and customer analysis.

---

# 20. Reporting and Analytics

The system should provide reports and analytics for fleet and business performance.

Reports may eventually include:

- Revenue by machine.
- Revenue by machine category.
- Revenue by customer.
- Revenue by branch.
- Utilization by machine.
- Utilization by category.
- Maintenance cost by machine.
- Fault frequency.
- Machine downtime.
- Fleet ROI.
- Payback period.
- Fleet age.
- Machine availability.
- Rental history.

Users should be able to select reporting periods.

Future reporting may support export to formats such as PDF or spreadsheets.

---

# 21. Notifications and Alerts

The platform should support notifications generated by business or telemetry events.

Examples include:

- Low battery.
- New critical fault.
- Machine offline.
- Maintenance due.
- Machine leaving a geofence.
- Rental approaching its end date.
- Rental overdue.
- Remote command failure.

Notifications may eventually be delivered through:

- In-app notifications.
- Mobile push notifications.
- Email.
- SMS.

Notification rules should be configurable where appropriate.

---

# 22. Documents and Files

The application will need to associate documents with companies, customers, machines, rentals, and maintenance records.

Examples include:

- Machine manuals.
- Service manuals.
- Rental contracts.
- Inspection forms.
- Maintenance reports.
- Photos.
- Invoices.
- Technical documents.
- Certificates.

Files should be stored separately from the primary relational database while database records maintain their relationships and metadata.

Detailed storage architecture will be defined in the system architecture document.

---

# 23. AI Technical Assistant

An AI-assisted technical support feature is planned for a later phase.

The purpose of the AI assistant is to help technicians and service personnel understand machine problems and maintenance procedures.

The AI assistant may use information from:

- Machine manuals.
- Service manuals.
- Error-code documentation.
- Electrical documentation.
- CAN documentation.
- Maintenance procedures.
- Previous maintenance records.
- Machine fault history.

Example:

A technician opens a specific machine and asks:

"Why is this machine not lifting?"

The system may provide the AI with contextual information such as:

- Machine model.
- Serial number.
- Active fault codes.
- Controller information.
- Operating hours.
- Maintenance history.

The AI may then search the relevant technical documentation and provide troubleshooting guidance.

The AI should primarily retrieve information from approved technical documents rather than relying only on general model knowledge.

The AI feature is not required for the first release of the platform.

---

# 24. Auditability

The platform must record important user and system actions.

Examples include:

- User permission changes.
- Financial information changes.
- Machine creation.
- Machine deletion.
- Rental changes.
- Device assignment.
- Remote immobilization commands.
- Device acknowledgement.
- Maintenance changes.

Sensitive actions must be traceable to the user or system process that performed them.

Auditability is especially important for:

- Financial information.
- User permissions.
- Device management.
- Remote machine commands.

---

# 25. Product Principles

The following principles should guide product development.

## 25.1 Rental Management Must Work Without GPS

Telemetry is an important part of the product, but the rental management system must continue to work for machines that do not have tracking devices.

## 25.2 Telemetry Enhances Business Information

GPS and CAN information should improve rental, maintenance, and financial decisions rather than exist as a completely separate tracking application.

## 25.3 Machine Information Has One Central Home

Each machine should have a central machine page where users can access its relevant information.

Typical sections may include:

- Overview.
- Location.
- Telemetry.
- Rentals.
- Maintenance.
- Faults.
- Financial information.
- Documents.
- Activity history.

## 25.4 Provider Independence

The core application must not depend directly on Ruptela-specific telemetry structures.

Telemetry provider integrations must be isolated behind provider-specific adapters.

## 25.5 Multi-Tenancy From the Beginning

Tenant isolation must not be added later as an afterthought.

All tenant-owned business data must belong to an organization.

## 25.6 Permission-Based Access

Sensitive functionality must be controlled using permissions.

A simple distinction between "admin" and "user" is not sufficient.

## 25.7 Internationalization From the Beginning

Translation and regional support must be considered during initial development rather than retrofitted later.

## 25.8 Safety for Remote Commands

Remote machine commands must be treated as secure, auditable workflows with confirmed device acknowledgement.

## 25.9 Maintainability

The product is expected to grow significantly.

Code and documentation should prioritize clear module boundaries, reusable domain models, consistent naming, and understandable business logic.

## 25.10 Avoid Premature Complexity

The system should be designed for future growth without introducing unnecessary complexity before it is required.

For example, the application should not begin as a large collection of microservices if a well-structured modular architecture can support the initial product.

---

# 26. Initial Product Scope

The first practical version of the system should focus on the functions required to operate our own rental company.

The initial release should prioritize:

- Authentication.
- Organization management.
- User permissions.
- Machine management.
- Customer management.
- Basic rental management.
- Machine availability.
- Ruptela device assignment.
- GPS location.
- Basic machine telemetry.
- Map view.
- Machine status.
- Fault display.
- Maintenance tracking.
- Basic dashboard.
- Basic financial tracking.
- Audit logs.

Features that are useful but not essential to prove the core system should be implemented later.

---

# 27. Future Capabilities

Potential future capabilities include:

- Advanced pricing management.
- Online customer rental portal.
- Customer mobile application.
- Electronic contract signing.
- Digital inspection forms.
- Geofencing.
- Advanced maintenance planning.
- Spare-part inventory.
- Automated invoicing.
- Accounting software integrations.
- ERP integrations.
- CRM features.
- Payment integrations.
- Advanced fleet forecasting.
- Predictive maintenance.
- AI-assisted technical support.
- AI fleet recommendations.
- Enterprise SSO.
- Advanced reporting.
- Customer-facing tracking.
- Additional telemetry providers.
- Additional countries and languages.

These capabilities are not commitments for the initial release.

They represent possible directions the architecture should not unnecessarily prevent.

---

# 28. Definition of Success

The first version of the product should be considered successful when our own rental company can use it as the primary operational system for managing its fleet.

A successful initial product should allow management to answer questions such as:

"Which machines are currently available?"

"Which machines are currently rented?"

"Where is machine X?"

"Which customer currently has machine X?"

"How much has machine X earned?"

"What did machine X cost us?"

"When is machine X due for maintenance?"

"Does machine X currently have a fault?"

"Which machines are currently offline?"

"Which machine category has the highest utilization?"

"Which machines are generating the highest return?"

The long-term success of the product will be measured by whether the same platform can be deployed to independent rental companies without requiring custom software development for every customer.

---

# 29. Related Documentation

The following documents provide more detailed specifications for individual areas of the platform:

- `02-SYSTEM-ARCHITECTURE.md`
- `03-DOMAIN-MODEL.md`
- `04-UI-UX.md`
- `05-AUTH-AND-PERMISSIONS.md`
- `06-TELEMETRY-IOT.md`
- `07-RENTAL-BUSINESS-RULES.md`
- `08-MAINTENANCE.md`
- `09-FINANCE-ANALYTICS.md`
- `10-SECURITY.md`
- `11-CODING-STANDARDS.md`

Architecture decisions that should remain documented over time will be stored under:

`docs/decisions/`