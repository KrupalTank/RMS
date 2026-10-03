// utils/pdfGenerator.js
const PDFDocument = require('pdfkit');

/**
 * Helper to clean dates into clean YYYY-MM-DD strings
 */
const formatDate = (d) => {
  if (!d) return 'N/A';
  if (typeof d === 'string') {
    const match = d.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return String(d);
  return dateObj.toISOString().split('T')[0];
};

/**
 * 1. Generates High-Quality Rental Booking & Escrow Customer Invoice PDF
 */
function generateCustomerInvoicePDF({ customer, parentOrder, subOrders, paymentDetails }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // --- COLOR PALETTE (Clean Corporate Slate & Royal Indigo) ---
    const primaryHeader = '#1E1B4B'; // Deep Indigo (High Contrast Dark Background)
    const brandBlue = '#2563EB';     // Accent Blue
    const textDark = '#0F172A';       // Slate 900
    const textMuted = '#475569';      // Slate 600
    const lightCardBg = '#F8FAFC';    // Slate 50
    const borderCard = '#CBD5E1';     // Slate 300
    const discountGreen = '#047857';  // Emerald Green for loyalty discount

    // --- HEADER BAR ---
    doc.rect(36, 36, 523, 62).fill(primaryHeader);
    doc.fillColor('#FFFFFF').fontSize(16).font('Helvetica-Bold').text('RENTAL MANAGEMENT SYSTEM', 50, 48);
    doc.fillColor('#93C5FD').fontSize(9.5).font('Helvetica').text('Official Booking Tax & Escrow Deposit Invoice', 50, 70);

    // --- INVOICE & CUSTOMER INFO BOX ---
    doc.rect(36, 110, 523, 76).fillAndStroke(lightCardBg, borderCard);

    // Left Column: Customer Info
    doc.fillColor(brandBlue).fontSize(9).font('Helvetica-Bold').text('BILLED TO', 50, 118);
    doc.fillColor(textDark).fontSize(10.5).font('Helvetica-Bold').text(customer.full_name || 'Valued Customer', 50, 131);
    doc.fillColor(textMuted).fontSize(8.5).font('Helvetica')
      .text(`Email: ${customer.email || 'N/A'}`, 50, 146)
      .text(`City: ${customer.city || 'N/A'}`, 50, 159);

    // Right Column: Order & Transaction Identifiers
    const invoiceDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.fillColor(brandBlue).fontSize(9).font('Helvetica-Bold').text('TRANSACTION RECEIPT', 340, 118);
    doc.fillColor(textMuted).fontSize(8.5).font('Helvetica')
      .text(`Group Order ID: #${parentOrder.group_id}`, 340, 131)
      .text(`Payment ID: ${paymentDetails.razorpay_payment_id || 'N/A'}`, 340, 145)
      .text(`Invoice Date: ${invoiceDate}`, 340, 159);

    // --- TABLE HEADERS ---
    const tableTop = 198;
    doc.rect(36, tableTop, 523, 22).fill('#334155'); // Slate 700 Header
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
    doc.text('ITEM DESCRIPTION', 44, tableTop + 7);
    doc.text('VENDOR', 160, tableTop + 7);
    doc.text('DATES (DAYS)', 236, tableTop + 7);
    doc.text('QTY', 332, tableTop + 7, { width: 22, align: 'center' });
    doc.text('RENT (INR)', 360, tableTop + 7, { width: 56, align: 'right' });
    doc.text('DISCOUNT', 422, tableTop + 7, { width: 50, align: 'right' });
    doc.text('DEPOSIT (INR)', 478, tableTop + 7, { width: 73, align: 'right' });

    // --- TABLE ROWS ---
    let y = tableTop + 22;
    let sumGrossRent = 0;
    let sumDiscount = 0;
    let sumPaidRent = 0;
    let sumDeposit = 0;

    subOrders.forEach((item, index) => {
      const rowBg = index % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      doc.rect(36, y, 523, 26).fillAndStroke(rowBg, '#E2E8F0');

      const start = new Date(item.start_date);
      const end = new Date(item.end_date);
      const totalDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;

      const grossRent = parseFloat(item.gross_rent_snapshot || (parseFloat(item.rent_per_day_snapshot || 0) * item.quantity * totalDays));
      const discount = parseFloat(item.discount_amount_snapshot || 0);
      const paidRent = parseFloat(item.customer_paid_rent_snapshot || (grossRent - discount));
      const deposit = parseFloat(item.deposit_per_item_snapshot || 0) * item.quantity;

      sumGrossRent += grossRent;
      sumDiscount += discount;
      sumPaidRent += paidRent;
      sumDeposit += deposit;

      const dateSummary = `${formatDate(item.start_date)} (${totalDays}d)`;

      // Item Title
      doc.fillColor(textDark).font('Helvetica-Bold').fontSize(8)
        .text(item.product_title || 'Rental Equipment', 44, y + 8, { width: 112, lineBreak: false, ellipsis: true });

      // Vendor Name
      doc.font('Helvetica').fontSize(7.5).fillColor(textMuted)
        .text(item.vendor_name || 'Verified Vendor', 160, y + 8, { width: 72, lineBreak: false, ellipsis: true })
        .text(dateSummary, 236, y + 8, { width: 92, lineBreak: false, ellipsis: true });

      // Qty
      doc.text(String(item.quantity || 1), 332, y + 8, { width: 22, align: 'center' });

      // Gross Rent
      doc.text(grossRent.toFixed(2), 360, y + 8, { width: 56, align: 'right' });

      // Discount column
      if (discount > 0) {
        doc.fillColor(discountGreen).font('Helvetica-Bold')
          .text(`-${discount.toFixed(2)}`, 422, y + 8, { width: 50, align: 'right' });
      } else {
        doc.fillColor(textMuted).font('Helvetica')
          .text('₹0.00', 422, y + 8, { width: 50, align: 'right' });
      }

      // Escrow Deposit
      doc.fillColor(textDark).font('Helvetica')
        .text(deposit.toFixed(2), 478, y + 8, { width: 73, align: 'right' });

      y += 26;
    });

    // --- TOTALS & SUMMARY CARD ---
    const summaryTop = y + 14;
    const grandTotalPaid = sumPaidRent + sumDeposit;

    doc.rect(295, summaryTop, 264, sumDiscount > 0 ? 88 : 74).fillAndStroke('#F1F5F9', borderCard);

    let currY = summaryTop + 8;
    doc.font('Helvetica').fontSize(8.5).fillColor(textMuted);
    doc.text('Gross Rental Charges:', 307, currY);
    doc.text(`INR ${sumGrossRent.toFixed(2)}`, 430, currY, { width: 120, align: 'right' });

    if (sumDiscount > 0) {
      currY += 15;
      doc.fillColor(discountGreen).font('Helvetica-Bold');
      doc.text('Loyalty Milestone Discount:', 307, currY);
      doc.text(`- INR ${sumDiscount.toFixed(2)}`, 430, currY, { width: 120, align: 'right' });
    }

    currY += 15;
    doc.fillColor(textMuted).font('Helvetica');
    doc.text('Refundable Escrow Deposit:', 307, currY);
    doc.text(`INR ${sumDeposit.toFixed(2)}`, 430, currY, { width: 120, align: 'right' });

    currY += 15;
    doc.rect(307, currY, 240, 1).fill('#CBD5E1');

    currY += 6;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(brandBlue);
    doc.text('Total Invoiced Amount Paid:', 307, currY);
    doc.text(`INR ${grandTotalPaid.toFixed(2)}`, 430, currY, { width: 120, align: 'right' });

    // --- ESCROW & LEGAL POLICY NOTICE FOOTER ---
    const footerTop = 715;
    doc.rect(36, footerTop, 523, 52).fillAndStroke('#FEF3C7', '#FDE68A');
    doc.fillColor('#92400E').font('Helvetica-Bold').fontSize(8).text('ESCROW & SECURITY POLICY NOTICE', 46, footerTop + 7);
    doc.font('Helvetica').fontSize(7.5).fillColor('#78350F').text(
      'Security deposits are securely held in platform escrow. Upon on-time return and condition verification by the vendor, refundable deposits are released back to your original source account via Razorpay.',
      46,
      footerTop + 20,
      { width: 503, lineGap: 1.5 }
    );

    doc.fillColor('#94A3B8').fontSize(7).text('Authentic computer-generated invoice. No signature required.', 36, 782, {
      align: 'center',
      width: 523,
    });

    doc.end();
  });
}

/**
 * 2. Generates High-Quality Payment Settlement & Disbursement Slip PDF
 */
function generatePayoutSlipPDF({ recipient, payout, orderDetails }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const isRefund =
      payout.type === 'deposit_refund' ||
      payout.type === 'full_refund' ||
      payout.type === 'cancellation_refund_customer';

    // Theme Color: Deep Emerald for Customer Refund, Deep Warm Amber/Slate for Vendor Net Income
    const heroBg = isRefund ? '#065F46' : '#0F172A';
    const accentColor = isRefund ? '#059669' : '#D97706';
    const textDark = '#0F172A';
    const textMuted = '#475569';
    const borderCard = '#CBD5E1';

    // --- HEADER ---
    doc.rect(36, 36, 523, 62).fill(heroBg);
    doc.fillColor('#FFFFFF').fontSize(16).font('Helvetica-Bold').text('PAYMENT DISBURSEMENT SLIP', 50, 48);
    doc.fillColor(isRefund ? '#A7F3D0' : '#FDE68A').fontSize(9.5).font('Helvetica').text(
      isRefund ? 'Customer Escrow Refund & Reimbursement Voucher' : 'Vendor Rental Income & Settlement Voucher',
      50,
      70
    );

    // --- HERO AMOUNT DISPLAY ---
    doc.rect(36, 110, 523, 66).fillAndStroke('#F8FAFC', borderCard);
    doc.fillColor(textMuted).fontSize(8.5).font('Helvetica-Bold').text('NET AMOUNT DISBURSED', 50, 122);
    doc.fillColor(accentColor).fontSize(20).font('Helvetica-Bold').text(`INR ${parseFloat(payout.amount).toFixed(2)}`, 50, 137);

    const cleanType = String(payout.type || 'SETTLEMENT').toUpperCase().replace(/_/g, ' ');
    doc.rect(330, 126, 215, 26).fill(accentColor);
    doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold').text(cleanType, 330, 134, { width: 215, align: 'center' });

    // --- 2-COLUMN SETTLEMENT AUDIT GRID ---
    const gridTop = 188;
    doc.rect(36, gridTop, 523, 168).fillAndStroke('#FFFFFF', borderCard);

    // Left Column: Beneficiary Bank Details
    doc.fillColor(accentColor).fontSize(9.5).font('Helvetica-Bold').text('BENEFICIARY DETAILS', 50, gridTop + 12);
    doc.fillColor(textDark).font('Helvetica-Bold').fontSize(10).text(recipient.full_name || 'Account Holder', 50, gridTop + 28);

    doc.fillColor(textMuted).font('Helvetica').fontSize(8.5)
      .text(`Email: ${recipient.email || 'N/A'}`, 50, gridTop + 45)
      .text(`Bank A/C: ${recipient.bank_account_no || 'Registered Razorpay Route'}`, 50, gridTop + 60)
      .text(`IFSC Code: ${recipient.bank_ifsc || 'N/A'}`, 50, gridTop + 75);

    // Right Column: Transaction Traceability
    doc.fillColor(accentColor).fontSize(9.5).font('Helvetica-Bold').text('TRANSACTION AUDIT', 320, gridTop + 12);
    doc.fillColor(textMuted).font('Helvetica').fontSize(8.5)
      .text(`Payout ID: #${payout.id}`, 320, gridTop + 28)
      .text(`Order Reference: #${payout.order_id}`, 320, gridTop + 45)
      .text(`Razorpay Ref: ${payout.gateway_reference_id || 'RZP-DIRECT-TRANSFER'}`, 320, gridTop + 60)
      .text(`Processed At: ${new Date().toLocaleString('en-IN')}`, 320, gridTop + 75);

    // Inner Grid Divider
    doc.rect(48, gridTop + 100, 499, 1).fill('#E2E8F0');

    // Associated Product & Window
    doc.fillColor(textDark).font('Helvetica-Bold').fontSize(8.5).text('Rental Equipment:', 50, gridTop + 112);
    doc.fillColor(textMuted).font('Helvetica').fontSize(8.5).text(
      orderDetails.product_title || 'Rental Item',
      160,
      gridTop + 112,
      { width: 380, lineBreak: false, ellipsis: true }
    );

    doc.fillColor(textDark).font('Helvetica-Bold').fontSize(8.5).text('Rental Window:', 50, gridTop + 132);
    const rentalWindow = `${formatDate(orderDetails.start_date)} to ${formatDate(orderDetails.end_date)}`;
    doc.fillColor(textMuted).font('Helvetica').fontSize(8.5).text(rentalWindow, 160, gridTop + 132);

    // --- FOOTER ---
    doc.rect(36, 715, 523, 44).fillAndStroke('#F1F5F9', borderCard);
    doc.fillColor('#64748B').font('Helvetica').fontSize(7.5).text(
      'This document confirms electronic fund transfer processed through Razorpay for Rental Management System. All records are cryptographically stored for financial compliance.',
      46,
      726,
      { width: 503, align: 'center', lineGap: 1.5 }
    );

    doc.end();
  });
}

/**
 * Helper to strip non-ASCII / problematic glyphs that break standard PDF fonts
 */
const sanitizeText = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/[^\x20-\x7E]/g, '') // Strips inverted exclamations (¡) and non-ASCII artifacts
    .trim();
};

/**
 * 3. Generates Legally Binding Equipment Rental Agreement & Custody Certificate PDF
 * Strict coordinate layout with absolute non-overlapping column bounds.
 */
function generateRentalAgreementPDF({ customer, parentOrder, subOrders }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4', autoFirstPage: true });
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // --- COLOR PALETTE ---
    const primaryNavy = '#0F172A';   // Slate 900
    const accentIndigo = '#4338CA';  // Indigo 700
    const textDark = '#1E293B';      // Slate 800
    const textMuted = '#475569';     // Slate 600
    const borderGray = '#CBD5E1';    // Slate 300
    const bgLight = '#F8FAFC';       // Slate 50

    // --- 1. HEADER BLOCK ---
    doc.rect(36, 36, 523, 62).fill(primaryNavy);

    // Left Title Block
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11)
      .text('EQUIPMENT RENTAL AGREEMENT', 48, 46, { width: 290, lineBreak: false })
      .fontSize(9.5)
      .text('& CUSTODY CERTIFICATE', 48, 60, { width: 290, lineBreak: false });

    doc.fillColor('#93C5FD').font('Helvetica').fontSize(8)
      .text('Official Binding Agreement • Escrow Backed', 48, 74, { width: 290, lineBreak: false });

    // Right Metadata Block
    const generatedDate = new Date().toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
      .text(`AGREEMENT ID: RMS-AGR-${parentOrder.group_id}`, 345, 46, { width: 200, align: 'right' });
    doc.fillColor('#CBD5E1').font('Helvetica').fontSize(7.5)
      .text(`ISSUED: ${generatedDate}`, 345, 60, { width: 200, align: 'right' })
      .text(`GROUP BOOKING: #${parentOrder.group_id}`, 345, 72, { width: 200, align: 'right' });

    let currY = 108;

    // --- 2. CONTRACTING PARTIES CARD ---
    const partiesCardHeight = 72;
    doc.rect(36, currY, 523, partiesCardHeight).fillAndStroke(bgLight, borderGray);

    // Left Column: Lessee / Customer Details
    doc.fillColor(accentIndigo).font('Helvetica-Bold').fontSize(8).text('LESSEE / CUSTOMER DETAILS', 48, currY + 8);
    doc.fillColor(textDark).font('Helvetica-Bold').fontSize(9).text(sanitizeText(customer.full_name) || 'Registered Customer', 48, currY + 20, { width: 250, lineBreak: false, ellipsis: true });
    doc.fillColor(textMuted).font('Helvetica').fontSize(7.5)
      .text(`Email: ${sanitizeText(customer.email) || 'N/A'}`, 48, currY + 33, { width: 250, lineBreak: false, ellipsis: true })
      .text(`City: ${sanitizeText(customer.city) || 'N/A'}  •  KYC Status: ${(customer.kyc_status || 'VERIFIED').toUpperCase()}`, 48, currY + 45, { width: 250, lineBreak: false, ellipsis: true });

    // Right Column: Escrow & Jurisdiction
    doc.fillColor(accentIndigo).font('Helvetica-Bold').fontSize(8).text('SECURITY & JURISDICTION', 320, currY + 8);
    doc.fillColor(textMuted).font('Helvetica').fontSize(7.5)
      .text(`Escrow Custody: Razorpay Treasury Node`, 320, currY + 20)
      .text(`Settlement Rails: Automated IMPS Clearing`, 320, currY + 33)
      .text(`Legal Status: ACTIVE BINDING COVENANT`, 320, currY + 45);

    // Ensure 20pt buffer so Section 1 header never collides with this card
    currY += partiesCardHeight + 20;

    // --- 3. SCHEDULE OF RENTED ASSETS (TABLE) ---
    doc.fillColor(primaryNavy).font('Helvetica-Bold').fontSize(9).text('1. SCHEDULE OF RENTED EQUIPMENT & CHARGES', 36, currY);
    currY += 14;

    // Table Header
    doc.rect(36, currY, 523, 18).fill('#334155');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(6.5);
    doc.text('EQUIPMENT & VENDOR', 44, currY + 5, { width: 150 });
    doc.text('RENTAL WINDOW', 200, currY + 5, { width: 90 });
    doc.text('QTY', 295, currY + 5, { width: 24, align: 'center' });
    doc.text('DAILY RENT', 324, currY + 5, { width: 48, align: 'right' });
    doc.text('ESCROW DEPOSIT', 378, currY + 5, { width: 56, align: 'right' });
    doc.text('LATE FEE/DAY', 440, currY + 5, { width: 50, align: 'right' });
    doc.text('MAX LATE', 496, currY + 5, { width: 46, align: 'center' });
    currY += 18;

    let totalEscrow = 0;
    let totalRent = 0;

    subOrders.forEach((item, index) => {
      const rowHeight = 26;
      const rowBg = index % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      doc.rect(36, currY, 523, rowHeight).fillAndStroke(rowBg, '#E2E8F0');

      const start = new Date(item.start_date);
      const end = new Date(item.end_date);
      const days = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;
      const rentPaid = parseFloat(item.customer_paid_rent_snapshot || 0);
      const deposit = parseFloat(item.deposit_per_item_snapshot || 0) * item.quantity;
      const lateFee = parseFloat(item.late_fee_per_day_snapshot || 0);

      totalRent += rentPaid;
      totalEscrow += deposit;

      // Col 1: Title, Vendor, and Conditional Serial / Asset Tag
      doc.fillColor(textDark).font('Helvetica-Bold').fontSize(7)
        .text(sanitizeText(item.product_title) || 'Equipment', 44, currY + 3, { width: 150, lineBreak: false, ellipsis: true });

      if (item.assigned_serial_number) {
        // High-value / tracked asset with an assigned serial
        doc.fillColor(accentIndigo).font('Helvetica-Bold').fontSize(6)
          .text(`Unit Tag: ${sanitizeText(item.assigned_serial_number)}`, 44, currY + 12, { width: 150, lineBreak: false, ellipsis: true });

        doc.fillColor(textMuted).font('Helvetica').fontSize(5.8)
          .text(`Vendor: ${sanitizeText(item.vendor_name) || 'Partner'} (${sanitizeText(item.vendor_city) || 'Surat'})`, 44, currY + 19, { width: 150, lineBreak: false, ellipsis: true });
      } else {
        // Items without serial numbers (clothes, tools, generic stock)
        // Center the vendor information cleanly without misleading "Pending" tags
        doc.fillColor(textMuted).font('Helvetica').fontSize(6)
          .text(`Vendor: ${sanitizeText(item.vendor_name) || 'Partner'} (${sanitizeText(item.vendor_city) || 'Surat'})`, 44, currY + 13, { width: 150, lineBreak: false, ellipsis: true });

        doc.fillColor(textMuted).font('Helvetica').fontSize(5.5)
          .text('Type: Standard Bulk / Unserialized Asset', 44, currY + 20, { width: 150, lineBreak: false, ellipsis: true });
      }
      // Col 2: Window
      doc.fillColor(textDark).font('Helvetica').fontSize(6.5)
        .text(`${formatDate(item.start_date)} to ${formatDate(item.end_date)} (${days}d)`, 200, currY + 9, { width: 90, lineBreak: false });

      // Col 3: Qty
      doc.text(String(item.quantity), 295, currY + 9, { width: 24, align: 'center' });

      // Col 4: Daily Rent
      doc.text(`INR ${parseFloat(item.rent_per_day_snapshot).toFixed(0)}/d`, 324, currY + 9, { width: 48, align: 'right' });

      // Col 5: Escrow Deposit
      doc.text(`INR ${deposit.toFixed(0)}`, 378, currY + 9, { width: 56, align: 'right' });

      // Col 6: Late Fee
      doc.text(`INR ${lateFee.toFixed(0)}/d`, 440, currY + 9, { width: 50, align: 'right' });

      // Col 7: Max Late Days
      doc.text(`${item.max_late_days}d`, 496, currY + 9, { width: 46, align: 'center' });

      currY += rowHeight;
    });

    // Summary Totals Strip
    doc.rect(36, currY, 523, 18).fill('#EEF2F6');
    doc.fillColor(textDark).font('Helvetica-Bold').fontSize(7.5);
    doc.text('TOTAL VALUES IN CUSTODY:', 44, currY + 5);
    doc.text(`Total Rent Paid: INR ${totalRent.toFixed(2)}`, 240, currY + 5);
    doc.text(`Total Escrow Held: INR ${totalEscrow.toFixed(2)}`, 390, currY + 5, { width: 155, align: 'right' });
    currY += 26;

    // --- 4. ITEM-WISE CANCELLATION POLICIES ---
    doc.fillColor(primaryNavy).font('Helvetica-Bold').fontSize(9).text('2. INDIVIDUAL CANCELLATION POLICIES', 36, currY);
    currY += 12;

    subOrders.forEach((item) => {
      const fee = parseFloat(item.cancellation_fee_snapshot || 0);
      const policyRowHeight = 20;
      doc.rect(36, currY, 523, policyRowHeight).fillAndStroke('#FAFAFA', '#E2E8F0');

      doc.fillColor(textDark).font('Helvetica-Bold').fontSize(7)
        .text(`• ${sanitizeText(item.product_title)}:`, 44, currY + 5, { width: 170, lineBreak: false, ellipsis: true });

      doc.fillColor(textMuted).font('Helvetica').fontSize(6.8);
      if (fee > 0) {
        doc.text(`INR ${fee.toFixed(2)} / item fee deducted from deposit if cancelled before physical handover.`, 220, currY + 5, { width: 330, lineBreak: false });
      } else {
        doc.text('100% Free Cancellation: Full rent and deposit refunded if cancelled before physical handover.', 220, currY + 5, { width: 330, lineBreak: false });
      }
      currY += policyRowHeight + 3;
    });

    currY += 8;

    // --- 5. STANDARD BINDING TERMS & CONDITIONS ---
    doc.fillColor(primaryNavy).font('Helvetica-Bold').fontSize(9).text('3. GENERAL TERMS & ESCROW RECOVERY COVENANTS', 36, currY);
    currY += 12;

    const terms = [
      'A. Handshake Verification: Physical possession transfers only when the Lessee inspects equipment and furnishes the secure 6-digit Handover PIN to the Lessor.',
      'B. Strict Return Schedule: Equipment must be returned by the scheduled End Date. Late returns incur contractual daily late fees, deducted automatically from escrow.',
      'C. Lost Status & Forfeiture: Exceeding maximum allowed late days marks equipment as "Lost", resulting in complete escrow deposit forfeiture to the vendor.',
      'D. Condition Audit: Returns are inspected on-site. Damaged items forfeit the security deposit to cover repairs pursuant to platform terms.',
      'E. Legal Jurisdiction: The platform acts as a neutral payment escrow agent. Unresolved disputes remain subject to local civil jurisdiction.',
    ];

    doc.rect(36, currY, 523, 70).fillAndStroke(bgLight, borderGray);
    let termY = currY + 5;
    doc.fillColor(textMuted).font('Helvetica').fontSize(6.5);
    terms.forEach((t) => {
      doc.text(t, 44, termY, { width: 507, lineBreak: false });
      termY += 12;
    });
    currY += 78;

    // --- 6. SIGNATURE & SEAL FOOTER ---
    doc.rect(36, currY, 523, 32).fillAndStroke('#F1F5F9', borderGray);
    doc.fillColor(textDark).font('Helvetica-Bold').fontSize(7)
      .text('DIGITALLY EXECUTED & CERTIFIED BY RMS ESCROW RAILS', 44, currY + 6);
    doc.fillColor(textMuted).font('Helvetica').fontSize(6)
      .text('Cryptographically generated upon successful payment verification. Valid without physical handwritten signatures under the Information Technology Act.', 44, currY + 17, { width: 507, lineBreak: false });

    doc.end();
  });
}

/**
 * 4. Generates Formal Vendor Merchant & Hold-Harmless Partnership Agreement PDF
 */
function generateVendorAgreementPDF({ vendor, acceptedAt }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4', autoFirstPage: true });
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const primaryNavy = '#0F172A';   // Slate 900
    const emeraldGreen = '#047857'; // Emerald 700
    const textDark = '#1E293B';      // Slate 800
    const textMuted = '#475569';     // Slate 600
    const borderGray = '#CBD5E1';    // Slate 300
    const bgLight = '#F8FAFC';       // Slate 50

    // --- HEADER BAR ---
    doc.rect(36, 36, 523, 62).fill(primaryNavy);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12)
      .text('VENDOR MERCHANT PARTNERSHIP AGREEMENT', 48, 46, { width: 320, lineBreak: false })
      .fontSize(9)
      .text('& PRODUCT LIABILITY WAIVER / SAAS LICENSING CONTRACT', 48, 60, { width: 320, lineBreak: false });

    doc.fillColor('#34D399').font('Helvetica').fontSize(8)
      .text('Official Platform Software Licensing Contract • Version 7.0', 48, 74, { width: 320, lineBreak: false });

    const acceptedDateStr = new Date(acceptedAt || Date.now()).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
      .text(`CONTRACT ID: RMS-VND-${vendor.id || 'REG'}`, 345, 46, { width: 200, align: 'right' });
    doc.fillColor('#CBD5E1').font('Helvetica').fontSize(7.5)
      .text(`EXECUTED: ${acceptedDateStr}`, 345, 60, { width: 200, align: 'right' })
      .text(`MODEL: 0% CUT DIRECT GATEWAY`, 345, 72, { width: 200, align: 'right' });

    let currY = 108;

    // --- MERCHANT IDENTIFICATION CARD ---
    const merchantCardHeight = 60;
    doc.rect(36, currY, 523, merchantCardHeight).fillAndStroke(bgLight, borderGray);

    doc.fillColor(emeraldGreen).font('Helvetica-Bold').fontSize(8).text('REGISTERED MERCHANT / LESSOR', 48, currY + 8);
    doc.fillColor(textDark).font('Helvetica-Bold').fontSize(9).text(sanitizeText(vendor.full_name) || 'Registered Merchant', 48, currY + 20, { width: 250, lineBreak: false, ellipsis: true });
    doc.fillColor(textMuted).font('Helvetica').fontSize(7.5)
      .text(`Email: ${sanitizeText(vendor.email) || 'N/A'}`, 48, currY + 33, { width: 250, lineBreak: false, ellipsis: true })
      .text(`Phone: ${sanitizeText(vendor.phone) || 'N/A'}  •  City: ${sanitizeText(vendor.city) || 'N/A'}`, 48, currY + 44, { width: 250, lineBreak: false, ellipsis: true });

    doc.fillColor(emeraldGreen).font('Helvetica-Bold').fontSize(8).text('SOFTWARE LICENSING CYCLE', 320, currY + 8);
    const startDateStr = formatDate(vendor.subscription_start_date || new Date());
    const renewalDateStr = formatDate(vendor.subscription_renewal_date || new Date(Date.now() + 365*24*60*60*1000));
    doc.fillColor(textMuted).font('Helvetica').fontSize(7.5)
      .text(`Cycle Start: ${startDateStr}`, 320, currY + 20)
      .text(`Cycle Maturity: ${renewalDateStr} (365 Days)`, 320, currY + 33)
      .text(`Royalty Rate: 5% Annual Net Rental Earnings`, 320, currY + 44);

    currY += merchantCardHeight + 14;

    // --- COVENANTS & LEGAL CLAUSES ---
    doc.fillColor(primaryNavy).font('Helvetica-Bold').fontSize(9).text('TERMS, PRODUCT LIABILITY WAIVER & COVENANTS', 36, currY);
    currY += 12;

    const sections = [
      {
        title: '1. Software Infrastructure Provider Status & Zero-Intermediation Model',
        body: 'Rental Management System (RMS) operates exclusively as an unmediated software technology platform provider. RMS does not take custody of equipment, does not manage physical handovers, and does not hold booking money or security deposits in central escrow. 100% of customer rental fees and security deposits land directly into the Merchant’s personal Razorpay merchant account.'
      },
      {
        title: '2. Absolute Product Liability Waiver & Platform Non-Liability Release',
        body: 'The Merchant explicitly warrants that all listed items are safe, functional, legal, and well-maintained. The Merchant releases and holds RMS, its developers, and parent entity completely harmless from any legal, civil, or financial claims arising from product defects, equipment breakdown, structural failure, personal injury, property loss, theft, customer delinquency, or hazardous usage during the rental lifecycle.'
      },
      {
        title: '3. Merchant Razorpay Account Creation & Compliance Responsibility',
        body: 'The Merchant is strictly responsible for creating, configuring, verifying (KYC), and maintaining their independent Razorpay Merchant account. RMS acts solely as a technical routing interface and bears zero liability for Razorpay account suspensions, payment holds, customer chargebacks, or bank refund disputes.'
      },
      {
        title: '4. Annual 5% SaaS Licensing Royalty & 3-Day Grace Policy',
        body: 'Monetization operates on a 5% software licensing royalty calculated on cumulative annual net rental revenue at cycle maturity (365 days). Security deposits and cancelled bookings are 100% royalty-exempt. Upon cycle maturity, the Merchant receives a 3-day grace period to settle the statement before storefront checkouts are temporarily paused.'
      },
      {
        title: '5. Catalog Compliance & Administrative Taxonomy Control',
        body: 'The Merchant warrants that all listed equipment strictly adheres to local laws and falls within public product categories created by platform administrators. RMS reserves the right to delist non-compliant assets without prior notice.'
      }
    ];

    sections.forEach((sec) => {
      doc.rect(36, currY, 523, 54).fillAndStroke(bgLight, borderGray);
      doc.fillColor(emeraldGreen).font('Helvetica-Bold').fontSize(7.5).text(sec.title, 44, currY + 5);
      doc.fillColor(textMuted).font('Helvetica').fontSize(6.8).text(sec.body, 44, currY + 16, { width: 507, lineGap: 1.2 });
      currY += 58;
    });

    currY += 4;

    // --- STEP-BY-STEP RAZORPAY MERCHANT SETUP GUIDE ---
    doc.rect(36, currY, 523, 68).fillAndStroke('#ECFDF5', '#A7F3D0');
    doc.fillColor('#065F46').font('Helvetica-Bold').fontSize(8)
      .text('GUIDE: HOW TO CREATE & LINK YOUR DIRECT RAZORPAY MERCHANT ACCOUNT', 44, currY + 6);

    const steps = [
      'Step 1: Sign up for a business account at https://dashboard.razorpay.com and complete your identity/bank KYC.',
      'Step 2: Log in to your Razorpay Dashboard, navigate to Account & Settings -> API Keys, and click "Generate Key".',
      'Step 3: Copy your Key ID (e.g. rzp_live_XXXX) and Key Secret (stored securely in memory).',
      'Step 4: Log in to RMS -> Vendor Dashboard -> "Payment Gateway & License" tab, enter both keys, and click Save.'
    ];

    let stepY = currY + 18;
    steps.forEach((step) => {
      doc.fillColor('#047857').font('Helvetica').fontSize(6.8).text(step, 44, stepY, { width: 507, lineBreak: false });
      stepY += 11;
    });

    currY += 74;

    // --- SIGNATURE & EXECUTION FOOTER ---
    doc.rect(36, currY, 523, 34).fillAndStroke('#F1F5F9', borderGray);
    doc.fillColor(textDark).font('Helvetica-Bold').fontSize(7.5)
      .text('ELECTRONICALLY ACCEPTED & CERTIFIED UPON REGISTRATION', 44, currY + 6);
    doc.fillColor(textMuted).font('Helvetica').fontSize(6.5)
      .text(`Accepted by ${sanitizeText(vendor.full_name)} (${vendor.email}) on ${acceptedDateStr}. Valid without physical handwritten signatures pursuant to the Information Technology Act.`, 44, currY + 18, { width: 507, lineBreak: false });

    doc.end();
  });
}


module.exports = {
  generateCustomerInvoicePDF,
  generatePayoutSlipPDF,
  generateRentalAgreementPDF,
  generateVendorAgreementPDF,
};