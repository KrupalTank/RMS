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
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // --- COLOR PALETTE ---
    const primaryColor = '#1E40AF'; // Royal Blue
    const darkTextColor = '#1F2937';
    const grayTextColor = '#4B5563';
    const lightBg = '#F3F4F6';
    const borderColor = '#E5E7EB';

    // --- HEADER BAR ---
    doc.rect(40, 40, 515, 60).fill(primaryColor);
    doc.fillColor('#FFFFFF').fontSize(18).font('Helvetica-Bold').text('RENTAL MANAGEMENT SYSTEM', 55, 52);
    doc.fontSize(10).font('Helvetica').text('Official Booking & Escrow Tax Invoice', 55, 75);

    // --- INVOICE & CUSTOMER INFO BOX ---
    doc.rect(40, 115, 515, 80).fillAndStroke('#F9FAFB', borderColor);

    // Left Column: Customer Details
    doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold').text('BILLED TO:', 55, 125);
    doc.fillColor(darkTextColor).font('Helvetica-Bold').fontSize(11).text(customer.full_name || 'Valued Customer', 55, 140);
    doc.fillColor(grayTextColor).font('Helvetica').fontSize(9)
      .text(`Email: ${customer.email || 'N/A'}`, 55, 155)
      .text(`City: ${customer.city || 'N/A'}`, 55, 168);

    // Right Column: Order & Payment Details
    const invoiceDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.fillColor(primaryColor).fontSize(10).font('Helvetica-Bold').text('INVOICE DETAILS:', 340, 125);
    doc.fillColor(grayTextColor).font('Helvetica').fontSize(9)
      .text(`Group Order ID: #${parentOrder.group_id}`, 340, 140)
      .text(`Payment ID: ${paymentDetails.razorpay_payment_id || 'N/A'}`, 340, 153)
      .text(`Invoice Date: ${invoiceDate}`, 340, 166);

    // --- TABLE HEADERS ---
    const tableTop = 215;
    doc.rect(40, tableTop, 515, 22).fill('#1E3A8A');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
    doc.text('ITEM DESCRIPTION', 50, tableTop + 6);
    doc.text('VENDOR', 190, tableTop + 6);
    doc.text('RENTAL DATES', 280, tableTop + 6);
    doc.text('QTY', 390, tableTop + 6, { width: 25, align: 'center' });
    doc.text('RENT (INR)', 425, tableTop + 6, { width: 55, align: 'right' });
    doc.text('DEPOSIT (INR)', 485, tableTop + 6, { width: 60, align: 'right' });

    // --- TABLE ROWS ---
    let y = tableTop + 22;
    let totalRent = 0;
    let totalDeposit = 0;

    subOrders.forEach((item, index) => {
      const rowBg = index % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
      doc.rect(40, y, 515, 28).fillAndStroke(rowBg, borderColor);

      const itemRent = parseFloat(item.rent_per_day_snapshot || item.rent_amount || 0) * (item.quantity || 1);
      const itemDeposit = parseFloat(item.deposit_per_item_snapshot || 0) * (item.quantity || 1);
      totalRent += itemRent;
      totalDeposit += itemDeposit;

      const dateStr = `${formatDate(item.start_date)} to ${formatDate(item.end_date)}`;

      doc.fillColor(darkTextColor).font('Helvetica-Bold').fontSize(8.5)
        .text(item.product_title || 'Rental Item', 50, y + 8, { width: 135, lineBreak: false, ellipsis: true });

      doc.font('Helvetica').fontSize(8)
        .text(item.vendor_name || 'Vendor', 190, y + 8, { width: 85, lineBreak: false, ellipsis: true })
        .text(dateStr, 280, y + 8, { width: 105, lineBreak: false, ellipsis: true });

      doc.text(String(item.quantity || 1), 390, y + 8, { width: 25, align: 'center' });
      doc.text(itemRent.toFixed(2), 425, y + 8, { width: 55, align: 'right' });
      doc.text(itemDeposit.toFixed(2), 485, y + 8, { width: 60, align: 'right' });

      y += 28;
    });

    // --- TOTALS & SUMMARY BOX ---
    const summaryTop = y + 15;
    const grandTotal = totalRent + totalDeposit;

    doc.rect(315, summaryTop, 240, 75).fillAndStroke(lightBg, borderColor);

    doc.font('Helvetica').fontSize(9).fillColor(grayTextColor);
    doc.text('Total Rental Charges:', 325, summaryTop + 10);
    doc.text(`INR ${totalRent.toFixed(2)}`, 430, summaryTop + 10, { width: 115, align: 'right' });

    doc.text('Total Security Escrow:', 325, summaryTop + 26);
    doc.text(`INR ${totalDeposit.toFixed(2)}`, 430, summaryTop + 26, { width: 115, align: 'right' });

    doc.rect(325, summaryTop + 42, 220, 1).fill('#D1D5DB');

    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(primaryColor);
    doc.text('Grand Total Paid:', 325, summaryTop + 50);
    doc.text(`INR ${grandTotal.toFixed(2)}`, 430, summaryTop + 50, { width: 115, align: 'right' });

    // --- ESCROW & LEGAL POLICY FOOTER ---
    const footerTop = 720;
    doc.rect(40, footerTop, 515, 50).fillAndStroke('#FEF3C7', '#FDE68A');
    doc.fillColor('#92400E').font('Helvetica-Bold').fontSize(8.5).text('ESCROW & REFUND POLICY NOTICE', 50, footerTop + 8);
    doc.font('Helvetica').fontSize(7.5).fillColor('#78350F').text(
      'Security deposits are held securely in platform escrow and refunded to your registered bank account upon successful return inspection by the vendor, less any agreed cancellation or late fees.',
      50,
      footerTop + 22,
      { width: 495, lineGap: 2 }
    );

    doc.fillColor('#9CA3AF').fontSize(7).text('Computer-generated tax & escrow invoice. No signature required.', 40, 785, {
      align: 'center',
      width: 515,
    });

    doc.end();
  });
}

/**
 * 2. Generates High-Quality Payment Settlement & Disbursement Slip PDF
 */
function generatePayoutSlipPDF({ recipient, payout, orderDetails }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const isRefund =
      payout.type === 'deposit_refund' ||
      payout.type === 'full_refund' ||
      payout.type === 'cancellation_refund_customer';

    const accentColor = isRefund ? '#059669' : '#D97706'; // Emerald Green for refund, Amber for vendor earnings
    const darkTextColor = '#111827';
    const grayTextColor = '#4B5563';
    const borderColor = '#E5E7EB';

    // --- HEADER ---
    doc.rect(40, 40, 515, 60).fill(accentColor);
    doc.fillColor('#FFFFFF').fontSize(17).font('Helvetica-Bold').text('PAYMENT DISBURSEMENT SLIP', 55, 52);
    doc.fontSize(10).font('Helvetica').text('Rental Management Platform Official Settlement Receipt', 55, 75);

    // --- DISBURSEMENT SUMMARY HERO CARD ---
    doc.rect(40, 115, 515, 65).fillAndStroke('#F9FAFB', borderColor);
    doc.fillColor(grayTextColor).fontSize(9).font('Helvetica').text('SETTLEMENT AMOUNT TRANSFERRED', 55, 127);
    doc.fillColor(accentColor).fontSize(22).font('Helvetica-Bold').text(`INR ${parseFloat(payout.amount).toFixed(2)}`, 55, 142);

    const cleanType = String(payout.type || 'SETTLEMENT').toUpperCase().replace(/_/g, ' ');
    doc.rect(340, 130, 200, 24).fill(accentColor);
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold').text(cleanType, 340, 137, { width: 200, align: 'center' });

    // --- SETTLEMENT SPECIFICATIONS (2-COLUMN GRID) ---
    const gridTop = 195;
    doc.rect(40, gridTop, 515, 170).fillAndStroke('#FFFFFF', borderColor);

    // Left Column: Recipient Banking Details
    doc.fillColor(accentColor).fontSize(10).font('Helvetica-Bold').text('BENEFICIARY DETAILS', 55, gridTop + 12);
    doc.fillColor(darkTextColor).font('Helvetica-Bold').fontSize(10).text(recipient.full_name || 'Account Holder', 55, gridTop + 30);

    doc.fillColor(grayTextColor).font('Helvetica').fontSize(9)
      .text(`Email: ${recipient.email || 'N/A'}`, 55, gridTop + 48)
      .text(`Bank A/C: ${recipient.bank_account_no || 'Registered Razorpay Route'}`, 55, gridTop + 64)
      .text(`IFSC Code: ${recipient.bank_ifsc || 'N/A'}`, 55, gridTop + 80);

    // Right Column: Transaction & Audit Reference
    doc.fillColor(accentColor).fontSize(10).font('Helvetica-Bold').text('TRANSACTION AUDIT', 310, gridTop + 12);
    doc.fillColor(grayTextColor).font('Helvetica').fontSize(9)
      .text(`Payout ID: #${payout.id}`, 310, gridTop + 30)
      .text(`Order Reference: #${payout.order_id}`, 310, gridTop + 48)
      .text(`Gateway Ref: ${payout.gateway_reference_id || 'RZP-DIRECT-TRANSFER'}`, 310, gridTop + 64)
      .text(`Disbursed At: ${new Date().toLocaleString('en-IN')}`, 310, gridTop + 80);

    // Bottom Divider within Grid for Order Context
    doc.rect(55, gridTop + 105, 485, 1).fill(borderColor);

    doc.fillColor(darkTextColor).font('Helvetica-Bold').fontSize(9).text('Associated Product:', 55, gridTop + 118);
    doc.fillColor(grayTextColor).font('Helvetica').fontSize(9).text(orderDetails.product_title || 'Rental Item', 165, gridTop + 118, { width: 360, lineBreak: false, ellipsis: true });

    doc.fillColor(darkTextColor).font('Helvetica-Bold').fontSize(9).text('Rental Window:', 55, gridTop + 138);
    const rentalWindow = `${formatDate(orderDetails.start_date)} to ${formatDate(orderDetails.end_date)}`;
    doc.fillColor(grayTextColor).font('Helvetica').fontSize(9).text(rentalWindow, 165, gridTop + 138);

    // --- FOOTER NOTICE ---
    doc.rect(40, 720, 515, 40).fillAndStroke('#F3F4F6', borderColor);
    doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text(
      'This is an authentic, computer-generated transaction settlement voucher issued by Rental Management System. Funds are disbursed electronically via Razorpay Payouts.',
      50,
      730,
      { width: 495, align: 'center', lineGap: 2 }
    );

    doc.end();
  });
}

module.exports = {
  generateCustomerInvoicePDF,
  generatePayoutSlipPDF,
};