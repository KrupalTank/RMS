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



### 🏷️ Version 3.1.0 — Automated Treasury Disbursement & Mock Banking Rails (IMPS/NEFT)
* **Automated Batch Settlement Workflow:**
  * Replaced manual one-by-one checkout payment modals with an enterprise-grade **Batch Disbursement Console** in the Administrator Suite.
  * Introduced full selection control: Master "Select All" toggle (active by default) with granular row-level checkboxes to deselect individual payouts for review.
  * Added single-payout direct settlement (`Disburse Now`) bypassing stale React state closures via direct parameter injection.
* **Simulated Indian Banking Clearing Rails:**
  * Created the `POST /api/v1/rms/admin/batchBankingPayouts` endpoint supporting atomic row locking (`FOR UPDATE`) across selected payout records.
  * Integrated an interactive **Mock Banking Clearing Console** simulating NACH/IMPS clearing stages:
    1. Recipient bank account & RBI IFSC directory routing validation.
    2. IMPS network handshake and escrow fund reservation.
    3. Production-standard 12-character Indian Banking UTR generation (format: `CMS` + `YYMMDD` + 6 random digits, e.g., `CMS260902481923`).
* **Asynchronous SMTP Queue & Rate-Limiting:**
  * Transitioned settlement receipt PDF generation and email dispatch to an asynchronous background worker using `setImmediate`.
  * Implemented sequential throttling (~400ms delay between dispatches) to prevent SMTP socket saturation and resolve Gmail `421-4.3.0` temporary rate-limiting on bulk runs.
* **Database & Ledger Consistency:**
  * Updated `payouts` table schema updates to record unique gateway reference UTRs, payment mode, and settlement timestamps atomically.
  * Synchronized real-time balance metrics across Platform Retained Balances and Settled Outflows in the Transaction Ledger.


  ### 🏷️ Version 4.0.0 — In-App Dual-Mode Messaging, Disintermediation Guardrails & Automated Data Retention

#### 📌 Overview & Motivation
As the marketplace expanded, direct vendor-customer coordination became essential for clarifying equipment specifications, accessories, and physical pickup/handover logistics. However, exposing personal contact details prior to payment introduced the critical threat of **Platform Disintermediation (Platform Leakage)**—where parties bypass the platform to avoid commission fees, losing automated escrow security and verified review audits in the process. Version 4.0.0 resolves this by introducing an in-app real-time messaging engine paired with strict information masking, disintermediation regex scrubbers, and a tiered automated data retention lifecycle.

---

#### 🚨 Problems Encountered & Architectural Solutions

| Challenge / Problem | Root Cause | Engineering Solution |
| :--- | :--- | :--- |
| **Off-Platform Leakage (Disintermediation)** | Public product pages revealed vendor phone numbers and exact street addresses before booking. | **Asymmetric Information Masking:** Sanitized `getProductById` queries to withhold phone and street details until an order enters `Lock` status. On public catalog views, only generalized locality (city) is shown. |
| **Bypassing Protections in Chat** | Users could attempt to exchange phone numbers, emails, or UPI IDs directly within pre-booking chat threads. | **Server-Side Disintermediation Scrubber:** Applied regex filters on pre-booking messages to automatically redact 10-digit phone numbers, emails, and payment handles with safety warnings. |
| **Database Storage Bloat** | Storing ephemeral negotiation messages and high-volume gear inquiries indefinitely degrades database read performance. | **Tiered Data Retention Policy (TTL):**<br>• Pre-booking inquiries: Auto-purged after **3 days** of inactivity.<br>• Concluded rentals (`Returned`, `Lost`, `Cancelled`): Auto-purged after **7 days** of inactivity.<br>• Active rentals (`Lock`, `With Customer`): Retained throughout duration. Cascading foreign keys (`ON DELETE CASCADE`) ensure complete cleanup without orphaned records. |
| **Multi-Customer Chat Organization** | Vendors receiving simultaneous inquiries from multiple customers about multiple products experienced fragmented communication. | **Master-Detail Two-Pane Inbox:** Implemented a split-view inbox inside `VendorDashboard.jsx` separating isolated conversation threads (with unread counters and product thumbnails) on the left from the active messaging stream on the right. |
| **Handover Status Desynchronization** | When customers confirmed item receipt, competing socket instances and type mismatches (`string` vs `number` order IDs) caused network failures, leaving customer views stale without manual refresh. | **Unified Socket Channel & State Reflection:** Consolidated duplicate socket listeners, enforced numeric ID parsing, eliminated redundant emissions in `orderController.js`, and enabled optimistic local state updates. |

---

#### ⚙️ Technical Implementation Details

1. **Database Schema & Indexing (`PostgreSQL`):**
   * `chat_conversations`: Tracks thread participants (`customer_id`, `vendor_id`), context bindings (`product_id`, `order_id`), unread counters, and `last_message_at` timestamps. Enforces uniqueness across `(customer_id, vendor_id, product_id)`.
   * `chat_messages`: High-throughput message ledger recording message content, sender ID, read receipts, and timestamps with cascading deletion.
   * Optimized B-tree composite indexes on `(customer_id, last_message_at DESC)` and `(vendor_id, last_message_at DESC)` for sub-millisecond inbox queries.

2. **Real-Time WebSocket Architecture (`Socket.io`):**
   * Dynamic room isolation using `conversation_${conversationId}` rooms for active message delivery.
   * Private user channels (`user_${userId}`) emitting `INBOX_UPDATED` and `ORDER_STATUS_CHANGED` events to update unread badge counts across navigation bars and dashboard tabs in real time.

3. **Automated Scheduled Maintenance (`node-cron`):**
   * Configured an automated daily midnight cron job (`0 0 * * *` IST) running `purgeExpiredChats()` to evaluate conversation activity intervals against the tiered retention matrix.

4. **Frontend Components & User Experience (`React` + `Tailwind CSS`):**
   * **`ProductDetail.jsx`:** Masked logistics card showing locality with an integrated "Message Vendor" modal launcher.
   * **`CustomerOrders.jsx`:** Order-bound "Chat Vendor" triggers embedded directly into active booking cards.
   * **`ChatModal.jsx`:** Floating, collapsible messenger for customers featuring auto-scrolling message streams and expiration notices.
   * **`VendorDashboard.jsx`:** Two-pane responsive workspace with unread indicators, gear context badges, and responsive half-screen scroll containers.



🏷️ Version 5.0.0 — Physical Handshake Verification, Equipment Availability Engine & Binding PDF Legal Contracts
📌 Overview & Motivation
While earlier versions established marketplace escrow security, duration tier discounts, treasury payouts, and private messaging, real-world physical operations presented critical friction points:

Physical Handover Vulnerability: Customers could unilaterally claim equipment was received or missing without proof of physical presence.

Booking Collision Blindness: Users selected rental dates blindly on product pages without knowing if single-stock items were already booked.

Legal & Custody Exposure: Neither vendors nor customers had an official, enforceable custody agreement detailing item liability, replacement deposits, late penalty ladders, and cancellation terms during transit or possession.

Version 5.0.0 resolves these operational gaps by establishing cryptographic handshake OTP verification, a rolling 60-day availability calculation engine, and automated generation of binding PDF Rental Agreements.

🚨 Problems Encountered & Architectural Solutions

Challenge / Problem,Root Cause,Engineering Solution
Unilateral Handover Claims & Repudiation,"Customers confirmed receipt via a simple client button click (I Received This Item), allowing false claims of delivery or premature status changes without physical inspection.","Two-Way Handshake OTP Verification: Once orders enter Lock status upon payment, a secure 6-digit numeric PIN (handover_otp) is generated and visible exclusively on the customer's booking card. The vendor physically verifies the item with the customer, receives the code, and inputs it on their dashboard to transition the booking to With Customer."
Double-Booking & Checkout Drop-offs,"The catalog allowed selection of any future dates, only throwing inventory errors at cart addition or Razorpay checkout initialization.","60-Day Rolling Availability Engine: Implemented a calendar generation query using PostgreSQL generate_series and window overlap calculations (check_product_availability). It aggregates active orders (Lock, With Customer) over the next 60 days, feeding a visual availability ribbon on ProductDetail.jsx showing exact units remaining and sold-out dates."
PDF Text Collision & Coordinate Bleed,"Long product titles, multi-item table schedules, and legal policy notices overlapped vertically and horizontally in standard PDFKit renders, creating unreadable, garbled text.","Fixed Bounding Box Math & Dynamic Offsets: Refactored pdfGenerator.js with explicit coordinate partitions: strict column widths (44 to 542 pt grid), single-line title truncation with ellipsis, dedicated ASCII string sanitization (preventing character encoding corruptions), and dynamic vertical cursor tracking (currY) with automated page breaks."
Payment Verification Controller Crashes,"When transforming orders to Lock status in paymentController.js, iterating over array structures via .rows triggered runtime TypeError exceptions, risking rollback after payment capture.","Array Handling & Automatic Cart Cleanup: Standardized array responses in verifyPayment, ensured consistent WebSocket notifications (ORDER_LOCKED), and added atomic post-payment cart purging (DELETE FROM cart WHERE user_id = $1)."


⚙️ Technical Implementation Details
Database Schema & Indexing (PostgreSQL):

Added handover_otp VARCHAR(6) and handover_verified_at TIMESTAMP WITH TIME ZONE to the orders table.

Created composite B-tree index idx_orders_handover_otp on (id, handover_otp) for O(1) OTP validation.

Added composite index idx_orders_active_dates on (product_id, start_date, end_date, status) to accelerate 60-day availability calendar lookups.

Backend Services & API Endpoints (Express.js):

POST /api/v1/rms/payment/verifyPayment: Generates a cryptographically random 6-digit PIN via crypto.randomInt(100000, 1000000) and links it to locked sub-orders.

POST /api/v1/rms/vendor/verifyHandoverOtp: Atomically validates customer-provided OTPs under row-level locks (SELECT ... FOR UPDATE), transitions status to With Customer, records timestamps, and fires database payout triggers.

GET /api/v1/rms/user/productAvailability/:productId: Runs an automated 60-day availability aggregation returning date-by-date remaining inventory counts and sold-out flags.

GET /api/v1/rms/user/downloadAgreement/:groupId: Streams a digitally certified, escrow-backed Equipment Rental Agreement & Custody Certificate PDF to authorized customers and vendors.

Legal Document Generation (PDFKit):

Parties & Custody Section: Lessee details, verified city, KYC status, and Razorpay escrow custody references.

Schedule of Rented Equipment: Structured table mapping equipment titles, vendors, rental duration, daily rates, security escrow deposits, daily late fee schedules, and maximum grace return days.

Cancellation Schedule: Per-item fee deductions versus free cancellation policies based on vendor item settings.

Binding Terms & Recovery Covenants: Handover PIN verification clauses, strict return schedules, equipment condition audit stipulations, and automatic loss/forfeiture terms.

Frontend Workspaces (React + Tailwind CSS):

ProductDetail.jsx: Horizontal 60-day quick-view availability strip displaying day-by-day remaining stock badges (Full vs X left).

CustomerOrders.jsx: Replaced the legacy confirm button with a Handover Security PIN card featuring show/hide toggles, clipboard copying, and a "Rental Agreement" PDF download button.

VendorDashboard.jsx: Introduced a "Handover Equipment" modal allowing vendors to submit customer PINs directly from the orders management panel alongside agreement PDF downloads.

#### 🚨 Problems Encountered & Architectural Solutions

| Challenge / Problem | Root Cause | Engineering Solution |
| :--- | :--- | :--- |
| **Unilateral Handover Claims & Repudiation** | Customers confirmed receipt via a simple client button click (`I Received This Item`), allowing false claims of delivery or premature status changes without physical inspection. | **Two-Way Handshake OTP Verification:** Once orders enter `Lock` status upon payment, a secure 6-digit numeric PIN (`handover_otp`) is generated and visible exclusively on the customers booking card. The vendor physically verifies the item with the customer, receives the code, and inputs it on their dashboard to transition the booking to `With Customer`. |
| **Double-Booking & Checkout Drop-offs** | The catalog allowed selection of any future dates, only throwing inventory errors at cart addition or Razorpay checkout initialization. | **60-Day Rolling Availability Engine:** Implemented a calendar generation query using PostgreSQL `generate_series` and window overlap calculations (`check_product_availability`). It aggregates active orders (`Lock`, `With Customer`) over the next 60 days, feeding a visual availability ribbon on `ProductDetail.jsx` showing exact units remaining and sold-out dates. |
| **PDF Text Collision & Coordinate Bleed** | Long product titles, multi-item table schedules, and legal policy notices overlapped vertically and horizontally in standard PDFKit renders, creating unreadable, garbled text. | **Fixed Bounding Box Math & Dynamic Offsets:** Refactored `pdfGenerator.js` with explicit coordinate partitions: strict column widths (44 to 542 pt grid), single-line title truncation with ellipsis, dedicated ASCII string sanitization (preventing character encoding corruptions), and dynamic vertical cursor tracking (`currY`) with automated page breaks. |
| **Payment Verification Controller Crashes** | When transforming orders to `Lock` status in `paymentController.js`, iterating over array structures via `.rows` triggered runtime `TypeError` exceptions, risking rollback after payment capture. | **Array Handling & Automatic Cart Cleanup:** Standardized array responses in `verifyPayment`, ensured consistent WebSocket notifications (`ORDER_LOCKED`), and added atomic post-payment cart purging (`DELETE FROM cart WHERE user_id = $1`). |



🏷️ Version 6.0.0 — Zero-Intermediation Direct Gateway Architecture, Store Promotional Campaigns & Automated Annual SaaS Licensing📌 Overview & MotivationAs the platform scaled, holding marketplace escrow centrally introduced regulatory overhead, delayed vendor payouts, and created treasury balance friction. Version 6.0.0 shifts the financial architecture from a centralized platform escrow model to a Zero-Intermediation Merchant-Direct Model.Under this model:100% Direct Inflows: Vendors configure their own Razorpay payment gateway keys. Rental revenue and security deposits land instantly into the vendor’s personal Razorpay merchant account.  0% Per-Order Commission: The platform takes zero percentage on individual bookings, removing escrow payout delays entirely.  5% Annual SaaS Licensing Royalty: The platform monetizes strictly via a 5% software licensing royalty calculated on cumulative annual net rental earnings, settled automatically upon each vendor's 12-month subscription anniversary.  Self-Funded Store Promotional Campaigns: Vendors can launch localized coupon campaigns with custom redemption rules, duration thresholds, and soft-delete archiving.  


⚙️ Technical Implementation DetailsDatabase Architecture & Procedural Triggers (PostgreSQL):vendor_annual_billing: Tracks vendor annual cycles (vendor_id, billing_year, period_start, period_end, total_orders_completed, total_net_rental_earnings, platform_fee_due, payment_status, paid_at) with unique constraints on (vendor_id, billing_year).  store_coupons & coupon_redemptions: Soft-deletable promotional coupon storage supporting PERCENT and FLAT discount types, minimum order amounts, minimum rental durations, per-user limits, and lifetime redemption caps.  trg_update_annual_billing_on_return: Trigger that intercepts both 'Returned' and 'Lost' orders. Calculates 5% platform royalties exclusively on customer_paid_rent_snapshot (guaranteeing customer security deposits are 100% tax-exempt). Freezes bills marked 'PENDING' or 'PAID' and automatically routes grace-period returns into the subsequent fiscal cycle.  Scheduled Audits & Background Cron Jobs (node-cron):Midnight License Audit (0 0 * * * IST): Scans vendors whose subscription_renewal_date <= CURRENT_DATE. Runs an authoritative SUM(customer_paid_rent_snapshot) audit over completed orders, resolves paisa rounding drifts, writes final grand totals, and promotes records to 'PENDING'::billing_status_type.  Nightly Lost Order Check (0 21 * * * IST): Evaluates orders in 'With Customer' status where CURRENT_DATE > end_date + max_late_days. Marks overdue gear as 'Lost', stamps returned_to_vendor_at = CURRENT_TIMESTAMP, forfeits deposits, decrements product stock, and logs customer delinquency.  Backend Services & Controller Endpoints (Express.js):POST /api/v1/rms/vendor/updateGatewayCredentials: Encrypts vendor Razorpay Key Secrets using AES-256-GCM before saving to database.  POST /api/v1/rms/payment/createCheckoutOrder: Dynamically instantiates the vendor's decrypted Razorpay instance, verifies single-vendor cart boundaries, validates coupon limits, locks temporary inventory, and generates the payment order.  POST /api/v1/rms/vendor/createAnnualBillingOrder: Initializes an order on the platform admin's master Razorpay account for the vendor's pending 5% annual royalty fee.  POST /api/v1/rms/vendor/verifyAnnualBillingPayment: Verifies platform admin HMAC SHA-256 signatures, sets payment_status = 'PAID', stamps paid_at, and rolls the subscription forward using the fixed anniversary anchor.  GET /api/v1/rms/vendor/coupons: Fetches active and past vendor campaigns.  POST /api/v1/rms/vendor/createCoupon: Validates tiered constraints and deploys new store promo codes.  DELETE /api/v1/rms/vendor/deleteCoupon/:id: Soft-deletes coupons (is_archived = TRUE, is_active = FALSE) to safeguard historical order audits.  Frontend Workspaces & User Experience (React + Tailwind CSS):VendorDashboard.jsx:Dynamic Annual License Banner: Amber countdown banner during the 3-day grace window; turns into a red lockout warning once overdue, offering direct 1-click Razorpay settlement.  Promotions & Coupons Sub-Tab Switcher: Toggle bar separating "Active Campaigns" from "Past & Archived" promotions with counters and badges.  Payment Gateway & License Tab: Form for saving AES-256 encrypted Razorpay keys alongside historical annual billing statements.  Cart.jsx & ProductDetail.jsx:Grace-Aware Gating: Storefront remains accessible throughout the 3-day grace window; locks with an informative pause banner only after grace expiration.  Store Coupon Selector: Allows customers to select available vendor promotions with instant checks against rental duration and minimum rent thresholds.  Single-Vendor Enforcement: Modal preventing multi-vendor checkouts with a 1-click option to switch stores.  AdminDashboard.jsx:Read-Only Royalty Audit: Replaced manual payment buttons with an automated settlement audit column displaying payment timestamps and status badges.


Challenge / Problem -	Root Cause -	Engineering Solution
Multi-Vendor Cart Fragmentation

In a zero-intermediation model where funds disburse directly to vendors, checkout orders cannot split payments across multiple distinct Razorpay merchant accounts.

Single-Store Cart Enforcement: Enforced strict boundaries on cart additions (SELECT DISTINCT p.vendor_id). If a user selects equipment from a second store, an interactive modal displays the conflicting vendors and offers an atomic 1-click option to clear and switch stores.


Premature Payment Settlement & Ledger Corruption

Administrators possessed a manual "Confirm Payment" button in the admin console. Using this override mid-year marked active cycles as PAID, causing return triggers to reject subsequent orders and omit revenue from future billing audits.

Automated Gateway Settlement & Admin Decoupling: Completely removed manual payment confirmation controls from AdminDashboard.jsx. Royalties are now settled exclusively via vendor-initiated Razorpay transactions verified against administrative webhook signatures.  


Premature Storefront Lockout on Anniversary Date

JavaScript timestamp comparisons (new Date(renewal_date) < new Date()) evaluated the vendor's renewal date at midnight (00:00:00), instantly flagging the entire day as expired and locking storefronts while the midnight audit had yet to run.

Synchronized Renewal Gating: Updated product and cart checks to only trigger lockouts when a vendor's cycle has elapsed and an unsettled bill (payment_status IN ('PENDING', 'OVERDUE')) actively exists.


Operational Disruption on Day 365

Freezing storefronts immediately on the anniversary date halted rental cash flows, preventing vendors from generating the necessary revenue to clear their licensing fees.

3-Day Operational Grace Window: Implemented a non-disruptive 3-day grace period (period_end + INTERVAL '3 days'). Storefronts and checkouts remain open while an amber warning countdown alerts the vendor in their dashboard.


Fiscal Anniversary Date Drifting

Advancing licenses using CURRENT_DATE + INTERVAL '1 year' rewarded late payers with free operational days and drifted the anniversary date forward on each cycle.

Fixed-Anchor Anniversary Rollover: Transitioned to fixed-anchor renewal math: subscription_start_date = subscription_renewal_date and subscription_renewal_date = (subscription_renewal_date + INTERVAL '1 year')::DATE, guaranteeing uninterrupted, mathematically precise 365-day fiscal accounting.


Mid-Grace Period Order Contamination

Orders returned during the 3-day grace window risked modifying the finalized PENDING invoice that the vendor was actively attempting to pay.

Immutable Invoice Freezing: Configured database triggers to freeze any row marked 'PENDING' or 'PAID'. Any order returned after the cycle end date is routed into an 'ACCUMULATING' row for the subsequent cycle year without modifying the issued invoice.

### 🏷️ Version 7.0.0 — Administrative Taxonomy Control, Legal Hold-Harmless Framework & Automated Annual Licensing Engine

#### 📌 Overview & Motivation
Building on the **Zero-Intermediation Direct Gateway Model** introduced in Version 6.0.0, Version 7.0.0 focuses on administrative platform governance, vendor onboarding legal compliance, and strict product liability isolation. 

Prior to this version, individual vendors could arbitrarily create product categories, leading to category fragmentation and catalog clutter[cite: 21]. Additionally, shifting to direct vendor-to-customer payouts created a critical legal requirement: explicitly establishing that RMS functions purely as an unmediated SaaS software provider. 

Version 7.0.0 resolves these governance challenges by:
1. **Centralizing Taxonomy Governance:** Restricting category creation exclusively to platform administrators.
2. **Implementing Legal Release & Liability Waivers:** Requiring mandatory agreement to a **Product Liability Waiver & Hold-Harmless Clause** upon vendor signup.
3. **Automating Merchant Onboarding Setup:** Embedding a detailed **4-Step Direct Razorpay Merchant Integration Guide** into legally binding PDF Vendor Agreements.
4. **Hardening Database Type Safety:** Resolving custom PostgreSQL ENUM type coercion mismatches (`text versus user_role`) during user registration.

---

#### 🚨 Problems Encountered & Architectural Solutions

| Challenge / Problem | Root Cause | Engineering Solution |
| :--- | :--- | :--- |
| **Catalog Fragmentation & Arbitrary Categories**[cite: 21] | Vendors could create arbitrary product categories during item listing, resulting in duplicate categories (e.g., "Camera", "Cameras", "DSLRs") and unorganized search feeds[cite: 21]. | **Administrative Taxonomy Control:** Removed category creation controls from `VendorDashboard.jsx`[cite: 21]. Built a centralized **Add Public Category** modal in `AdminDashboard.jsx` (`POST /api/v1/rms/admin/addCategory`), enforcing single-source administrative category management[cite: 22, 25]. |
| **Platform Liability & Direct Gateway Exposure**[cite: 1, 2] | Under the zero-intermediation model where vendors handle payouts directly via their own Razorpay merchant accounts, equipment defects or injuries posed third-party liability risks to the platform[cite: 1, 2]. | **Legal Hold-Harmless & Liability Waiver:** Updated vendor signup terms and the generated PDF Vendor Agreement (`pdfGenerator.js`) to include explicit **Product Liability Waiver**, **Hold-Harmless Release**, and **Merchant Gateway Responsibility** clauses[cite: 1, 2]. |
| **Merchant Setup Friction**[cite: 2] | Vendors were unclear on how to obtain and link their personal Razorpay API Key ID and Key Secret to enable storefront checkouts[cite: 2]. | **Embedded Setup Guide in PDF Contract:** Enhanced `generateVendorAgreementPDF` in `pdfGenerator.js` with a dedicated 4-Step visual guide detailing Razorpay account creation, KYC verification, API key generation, and dashboard configuration[cite: 2]. |
| **PostgreSQL Enum Type Coercion Error (`42P08`)**[cite: 24] | In `authController.js`, parameter `$5` was passed as a plain JS string into a SQL `CASE WHEN $5 = 'vendor'` clause, causing a type mismatch against the custom database `user_role` enum (`detail: text versus user_role`)[cite: 24]. | **Explicit SQL Parameter Casting:** Refactored the `signup` insert query in `authController.js` to explicitly cast parameters (`$5::user_role` for insertion and `$5::text = 'vendor'` for conditional date evaluations)[cite: 24]. |
| **Mandatory Legacy Field Rejections** | The signup route enforced legacy `bank_account_no` and `bank_ifsc` fields, throwing validation errors during registration despite payouts moving to direct Razorpay keys. | **Validation Schema Alignment:** Removed `bank_account_no` and `bank_ifsc` from backend validation middleware (`authRoutes.js`) and controller checks (`authController.js`), aligning registration fields with the direct merchant model. |

---

#### ⚙️ Technical Implementation Details

1. **Frontend Authentication & Terms Agreement (`Signup.jsx`):**
   * Added an **RMS Zero-Intermediation & Vendor Partnership Terms** box for vendor registrations.
   * Mandates explicit checkbox acceptance covering direct payouts, 365-day licensing cycles, 5% annual net rent royalties, 3-day grace buffers, and product liability releases before enabling registration.

2. **PDF Legal Contract Generation (`pdfGenerator.js`):**
   * Refactored `generateVendorAgreementPDF` to produce a legally binding **Vendor Merchant Partnership Agreement & Product Liability Waiver**[cite: 1, 2].
   * **Clause Breakdown:**
     * **Clause 1:** Unmediated SaaS Software Infrastructure Provider Status[cite: 1, 2].
     * **Clause 2:** Absolute Product Liability Waiver & Platform Non-Liability Release[cite: 1, 2].
     * **Clause 3:** Merchant Razorpay Account Creation & Compliance Responsibility[cite: 1, 2].
     * **Clause 4:** Annual 5% SaaS Licensing Royalty & 3-Day Grace Policy[cite: 1, 2].
     * **Clause 5:** Catalog Compliance & Administrative Taxonomy Control[cite: 1, 2].
   * **Step-by-Step Setup Banner:** Renders a 4-step walkthrough for creating, verifying, and linking Razorpay API keys[cite: 2].

3. **Admin Taxonomy & Governance Console (`AdminDashboard.jsx`):**
   * Integrated a **FolderPlus** category management modal allowing platform admins to expand global product taxonomies[cite: 22, 25].
   * Vendors select from these pre-approved categories when listing inventory[cite: 21, 22].

4. **Database Parameter Handling (`authController.js`):**
   * Standardized SQL type coercion across user creation:
     ```sql
     INSERT INTO users (
       full_name, email, phone, password_hash, role, 
       address, city, pincode,
       subscription_start_date, subscription_renewal_date
     ) 
     VALUES (
       $1, $2, $3, $4, $5::user_role, $6, $7, $8,
       CASE WHEN $5::text = 'vendor' THEN CURRENT_DATE ELSE NULL END,
       CASE WHEN $5::text = 'vendor' THEN (CURRENT_DATE + INTERVAL '1 year')::DATE ELSE NULL END
     )
     ```