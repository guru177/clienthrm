# Grocery Benefit Program Implementation Plan

## 1. Overview
The Grocery Benefit Program provides new employees with free groceries during their first month of employment. From the second month onwards, employees receive groceries at a subsidized rate. This document outlines the technical implementation and management of this feature within the current HRM system.

## 2. Database Schema Changes (Postgres)

We will need to track benefit enrollments and transactions.

### `employee_benefits` Table
Tracks the active benefits for an employee.
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key to users)
- `benefit_type` (VARCHAR - e.g., 'GROCERY')
- `start_date` (DATE) - Usually the employee's join date
- `status` (VARCHAR - 'ACTIVE', 'INACTIVE')

### `grocery_allocations` Table
Tracks monthly allocations and usage.
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key)
- `allocation_month` (DATE - e.g., '2023-10-01')
- `is_free_month` (BOOLEAN) - True if it's the employee's first month
- `total_allowance` (DECIMAL) - Maximum limit allowed
- `used_amount` (DECIMAL)
- `subsidy_percentage` (INTEGER) - 100 for first month, e.g., 50 for subsequent months

## 3. Backend Implementation (Rust)

### Benefit Logic Module
Create a service to determine an employee's eligibility and discount tier based on their joining date compared to the current date.

```rust
// Conceptual logic for backend/src/services/benefit_service.rs
pub enum BenefitTier {
    FreeMonth,
    Subsidized(u8), // e.g., Subsidized(50) for 50%
}

pub fn calculate_grocery_benefit_tier(join_date: chrono::NaiveDate, current_date: chrono::NaiveDate, config_subsidy_pct: u8) -> BenefitTier {
    let months_difference = (current_date.year() - join_date.year()) * 12 + current_date.month() as i32 - join_date.month() as i32;
    
    if months_difference == 0 {
        BenefitTier::FreeMonth
    } else {
        BenefitTier::Subsidized(config_subsidy_pct)
    }
}
```

### API Endpoints
- `GET /api/benefits/grocery/status`: Returns current benefit status and remaining allowance for the logged-in user.
- `POST /api/benefits/grocery/claim`: Submits a grocery request or receipt. Calculates cost based on the active benefit tier (Free vs Subsidized).
- `GET /api/admin/benefits/grocery`: Admin endpoint to view all grocery benefit usage. Secure this using `rbac.rs`.

### Scheduled Job
A background worker (e.g., using `tokio` cron) to run at the start of each month to generate the `grocery_allocations` records for all active employees.

## 4. Frontend Implementation (React/TSX)

### Employee Portal
- **Dashboard Widget**: Display the current status dynamically.
  - *Month 1*: "🎉 100% Free Groceries for your first month! Ends on [Date]"
  - *Month 2+*: "🛒 50% Grocery Subsidy Active. Remaining Allowance: $X"
- **Claim Page**: A UI for employees to submit receipts or order packages. It should clearly show the employee's out-of-pocket cost vs. company coverage.

### Admin Portal
- **Benefit Management**: Extend `user-table.tsx` or create a new table (`grocery-benefits-table.tsx`) to show benefit enrollment and monthly usage.
- **System Settings Modal**: Extend `plan-form-modal.tsx` or similar to allow HR to configure the standard subsidy percentage and maximum allowance limits without developer intervention.

## 5. System Management & Operations

### Lifecycle Management
- **Onboarding**: When a new user is created in the system, automatically insert a record into `employee_benefits` with their join date.
- **Offboarding**: If an employee is deactivated or leaves, their `employee_benefits` status should automatically flip to 'INACTIVE'.

### Financial Reporting
Provide a monthly CSV export for the finance team detailing:
1. The total cost of "Free Month" groceries for new hires.
2. The total cost of "Subsidized" groceries for existing employees.
3. Tax implications (depending on local laws, these benefits might be treated as taxable income).
