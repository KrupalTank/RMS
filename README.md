# 📦 Rental Management System (RMS) — Enterprise Platform

An enterprise-grade, full-stack rental marketplace and inventory lifecycle management platform built with **React**, **Node.js/Express**, and **PostgreSQL**. The platform features automated escrow workflows, dynamic tiered pricing, loyalty streak rewards with compliance amnesty, razorpay integration, and a multi-factor recommendation engine.

---

## 📑 Version Release History & Architecture Roadmap

### 🏷️ Version 1.0.0 — Core Multi-Tier Rental Engine & Escrow Automation
* **Dynamic Tiered Pricing Engine:** Implemented inclusive day duration calculations with tier discounts (1–4 days, 5–9 days, 10+ days).
* **Multi-Tier KYC System:** Dual-deposit configuration reducing security deposits for verified customers via encrypted document submission.
* **Complete Rental Lifecycle:** Automated status state machine (`Pending_Payment` ➔ `Lock` ➔ `With Customer` ➔ `Returned` / `Lost` / `Cancelled`).
* **Automated PostgreSQL Escrow Triggers:**
  * Auto-disbursal of net rent to vendors upon customer handover.
  * Instant security deposit refunds upon undamaged return inspection.
  * Late fee deductions and damage/loss deposit forfeiture automation.
* **Financial Payouts & Proof Engine:** Razorpay payout generation, manual reference reconciliation, and automated settlement PDF generation.

---

### 🏷️ Version 2.0.0 — Loyalty Privilege Program & Vendor Compliance Framework
* **Loyalty Rental Privilege Program:**
  * Customers earn exclusive **10% Loyalty Discount Cards** upon completing 8 consecutive on-time, undamaged returns.
  * Multi-coupon assignment support allowing 1 distinct voucher per cart item during multi-item checkouts.
  * Complete financial isolation: Loyalty discounts are absorbed solely by platform commission without diminishing vendor payouts.
* **Customer Delinquency & Streak Pause Policy:**
  * Delinquent customers (`late_returns_count > 0`) have their milestone accrual **paused** (streak is preserved, not reset to 0).
  * Existing earned vouchers remain fully usable for checkout.
  * UI banner displays compliance warnings with direct support amnesty contact integration.
* **Administrator 1-Chance Pardon Audit System:**
  * Created dedicated `customer_pardon_history` audit table recording admin ID, timestamp, pardoned count, and justification.
  * Admins can grant 1-chance pardons in the Admin Suite, resetting active violations to 0 and resuming paused streak accrual.
* **Mandatory Vendor 10% Commission Contract:**
  * Enforced mandatory 10% platform commission agreement checkbox during vendor onboarding.
  * Automated delivery of legally binding commission terms and escrow guarantees in vendor welcome emails.
* **Transaction Ledger & Financial Reconciliation:**
  * Comprehensive administrator ledger tracking Inflows, Settled Outflows, Pending Outflows, and Net Retained Balances.
  * Inclusion of `Lost` orders into platform commission calculations to reflect earned service revenue.

---

### 🏷️ Version 3.0.0 — Multi-Factor Rental Recommendation Engine
* **Content & Locality-Based Similarity Engine (`getSimilarProducts`):**
  * Weighted multi-variable scoring model combining:
    $$\text{Score} = \text{Category Match (40 pts)} + \text{Locality Match (30 pts)} + \text{Price Proximity (20 pts)} + \text{Rating Boost (10 pts)}$$
  * Displayed via a horizontal carousel on `ProductDetail.jsx` for related gear and substitutes.
* **Association Rule Mining ("Frequently Rented Together"):**
  * Real-time co-occurrence mining across shared `group_id` / `parent_order` transactions in PostgreSQL.
  * 1-Click quick-add bundle bar in `Cart.jsx` with inherited booking date ranges.
* **Personalized Rental Feed ("Recommended For You"):**
  * Profile-tailored feed in `Catalog.jsx` leveraging historical customer booking categories, local city inventory, and top review ratings.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS, Lucide Icons | Responsive SPA, interactive carousels, real-time dashboards |
| **Backend** | Node.js, Express.js | RESTful APIs, JWT authentication, business logic |
| **Database** | PostgreSQL | Relational storage, ACID transactions, procedural triggers |
| **Payments** | Razorpay Node SDK & Checkout API | Customer payment capture, payout verification |
| **Media & PDF** | ImageKit SDK, PDFKit | Encrypted document storage, automated invoice & payout slip generation |
| **Communication** | Nodemailer (SMTP) | Automated transactional, legal, and settlement notifications |

---

## 🗄️ Database Architecture & Key Schemas

```sql
-- Loyalty Coupon Pool Table
CREATE TABLE coupons (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(50) UNIQUE NOT NULL,
    discount_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'REDEEMED', 'EXPIRED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Dedicated Customer Pardon History Audit Ledger
CREATE TABLE customer_pardon_history (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    admin_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    violations_pardoned INT NOT NULL CHECK (violations_pardoned > 0),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Financial Payouts Ledger
CREATE TABLE payouts (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id),
    group_id INT REFERENCES parent_order(id),
    recipient_id INT NOT NULL REFERENCES users(id),
    amount NUMERIC(10,2) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'vendor_rent', 'deposit_refund', 'cancellation_fee_vendor', etc.
    gateway_reference_id VARCHAR(100),
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);



🔌 API Reference Guide
1. Recommendations (v3.0)
GET /api/v1/rms/user/recommendations/similar/:productId — Fetch content & locality-scored similar items.

POST /api/v1/rms/user/recommendations/frequentlyRentedTogether — Fetch co-occurring rental items based on current cart IDs.

GET /api/v1/rms/user/recommendations/forYou — Fetch personalized catalog feed based on rental history.

2. Customer & Loyalty (v2.0)
GET /api/v1/rms/user/myCoupons — Retrieve available vouchers, active streak, and delinquency status.

POST /api/v1/rms/payment/createCheckoutOrder — Initialize Razorpay order with multi-coupon payload.

POST /api/v1/rms/user/addToCart — Add/configure rental item duration and quantity.

3. Administrator Suite (v2.0)
GET /api/v1/rms/admin/transactionLedger — Summary of gross collections, settled outflows, and retained platform earnings.

GET /api/v1/rms/admin/delinquentUsers — Retrieve delinquent accounts with historical pardon audits.

POST /api/v1/rms/admin/pardonDelinquentUser — Grant 1-chance loyalty amnesty and resume streak accrual.

POST /api/v1/rms/admin/recordPayoutReference — Verify transaction with Razorpay API and record settlement.

🚀 Getting Started & Local Setup
1. Prerequisites
Node.js (v18.x or higher)

PostgreSQL (v14.x or higher)

Razorpay Developer Account & ImageKit Account

2. Backend Installation
cd RMS/Backend
npm install

Create a .env file in RMS/Backend:
PORT=5000
DATABASE_URL=postgresql://postgres:password@localhost:5432/rms_db
JWT_SECRET=your_jwt_super_secret_key
COOKIE_SECRET=your_cookie_secret_key
CLIENT_URL=http://localhost:5173

RAZORPAY_KEY_ID=rzp_test_xxxx
RAZORPAY_KEY_SECRET=xxxx

IMAGEKIT_PUBLIC_KEY=xxxx
IMAGEKIT_PRIVATE_KEY=xxxx
IMAGEKIT_URL_ENDPOINT=[https://ik.imagekit.io/xxxx](https://ik.imagekit.io/xxxx)

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=586
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_app_password
EMAIL_FROM="RMS Platform <noreply@rms.com>"
ContactMe=support@rms.com

PLATFORM_COMMISSION_PERCENT=10
LOYALTY_THRESHOLD_ORDERS=8


Start the backend server:
npm run dev
# Server runs on http://localhost:5000

3. Frontend Installation
cd RMS/Frontend
npm install

Create a .env file in RMS/Frontend:
VITE_API_BASE_URL=http://localhost:5000/api/v1/rms
VITE_RAZORPAY_KEY_ID=rzp_test_xxxx

Start the frontend client:
npm run dev
# Vite client runs on http://localhost:5173

🛡️ License
Distributed under the MIT License. Developed for enterprise equipment rental management.