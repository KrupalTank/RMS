// services/emailService.js
const transporter = require('../config/email');
const { generateCustomerInvoicePDF, generatePayoutSlipPDF } = require('../utils/pdfGenerator');

/**
 * 1. Sends booking confirmation & PDF receipt to customer
 */
async function sendBookingConfirmationEmail({ customer, parentOrder, subOrders, paymentDetails }) {
  try {
    const pdfBuffer = await generateCustomerInvoicePDF({
      customer,
      parentOrder,
      subOrders,
      paymentDetails,
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: customer.email,
      subject: `Order Confirmation & Receipt - #${parentOrder.group_id}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #2563EB;">Your Rental Booking is Confirmed!</h2>
          <p>Hi <b>${customer.full_name}</b>,</p>
          <p>Thank you for renting with us. Your payment has been verified, and your items are now reserved.</p>
          <p><b>Group Order ID:</b> #${parentOrder.group_id}<br/>
             <b>Payment Reference:</b> ${paymentDetails.razorpay_payment_id}</p>
          <p>Please find your detailed tax & escrow deposit invoice attached to this email.</p>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p style="font-size: 12px; color: #777;">Rental Management System Support Team</p>
        </div>
      `,
      attachments: [
        {
          filename: `Invoice_Group_${parentOrder.group_id}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Customer invoice sent to ${customer.email}`);
  } catch (error) {
    console.error('⚠️ Failed to send booking confirmation email:', error.message);
  }
}

/**
 * 2. Sends Payout Settlement slip to Vendor or Customer
 */
async function sendPayoutSettlementEmail({ recipient, payout, orderDetails }) {
  try {
    const pdfBuffer = await generatePayoutSlipPDF({
      recipient,
      payout,
      orderDetails,
    });

    const isCustomerRefund =
      payout.type === 'deposit_refund' ||
      payout.type === 'full_refund' ||
      payout.type === 'cancellation_refund_customer';

    const subject = isCustomerRefund
      ? `Refund Settlement Disbursed - Order #${payout.order_id}`
      : `Disbursal Settlement Disbursed - Order #${payout.order_id}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: recipient.email,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #059669;">Payment Disbursed Successfully</h2>
          <p>Hi <b>${recipient.full_name}</b>,</p>
          <p>A payment of <b>₹${parseFloat(payout.amount).toFixed(2)}</b> has been settled and transferred.</p>
          <p><b>Transaction Reference:</b> ${payout.gateway_reference_id}<br/>
             <b>Order ID:</b> #${payout.order_id}<br/>
             <b>Payment Type:</b> ${payout.type.toUpperCase()}</p>
          <p>Your official settlement slip is attached below.</p>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p style="font-size: 12px; color: #777;">Rental Management System Accounts Team</p>
        </div>
      `,
      attachments: [
        {
          filename: `Payout_Slip_${payout.id}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Payout settlement slip sent to ${recipient.email}`);
  } catch (error) {
    console.error('⚠️ Failed to send payout settlement email:', error.message);
  }
}

/**
 * 3. Sends Welcome Email on Successful Signup
 */
async function sendWelcomeEmail({ user }) {
  try {
    const isVendor = user?.role === 'vendor';
    const roleText = (user?.role || 'customer').toUpperCase();

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: isVendor
        ? 'Welcome Vendor Partner - RMS Partnership & Commission Agreement'
        : 'Welcome to RMS - Account Created Successfully!',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 24px; background-color: #ffffff;">
          <h2 style="color: ${isVendor ? '#059669' : '#2563EB'}; margin-top: 0;">
            ${isVendor ? 'Welcome to RMS Vendor Partner Network' : `Welcome to Rental Management System, ${user.full_name || 'Member'}!`}
          </h2>
          <p>Your account has been registered successfully. You can now ${isVendor ? 'list products in the catalog and manage bookings' : 'explore rental equipment'}.</p>
          
          <div style="background-color: #F3F4F6; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #E5E7EB; font-size: 13px;">
            <p style="margin: 4px 0;"><b>Registered Name:</b> ${user.full_name}</p>
            <p style="margin: 4px 0;"><b>Account Role:</b> ${roleText}</p>
            <p style="margin: 4px 0;"><b>Registered Email:</b> ${user.email}</p>
            <p style="margin: 4px 0;"><b>City:</b> ${user.city || 'N/A'}</p>
          </div>

          ${
            isVendor
              ? `
          <div style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 6px; padding: 16px; margin: 20px 0;">
            <h4 style="margin: 0 0 8px 0; color: #065F46; font-size: 14px;">📜 Partner Commission & Settlement Agreement</h4>
            <p style="margin: 4px 0; font-size: 12px; color: #047857;">• <b>10% Platform Commission:</b> Deducted from gross rental income upon product handover to customer.</p>
            <p style="margin: 4px 0; font-size: 12px; color: #047857;">• <b>90% Net Payout:</b> Transferred directly to your registered bank account via electronic transfer.</p>
            <p style="margin: 4px 0; font-size: 12px; color: #047857;">• <b>0% Escrow Fee:</b> Customer security deposits are 100% untouched and protected in platform escrow.</p>
          </div>
          `
              : '<p style="font-size: 13px; color: #4B5563;">Complete your KYC verification in your profile to enjoy lower security deposit requirements.</p>'
          }
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6B7280; text-align: center;">Rental Management System Team</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Welcome email sent to ${user.email}`);
  } catch (error) {
    console.error('⚠️ Failed to send welcome email:', error.message);
  }
}
/**
 * 4. Sends KYC Submission Confirmation Email
 */
async function sendKycSubmissionEmail({ user, kycRequest }) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'KYC Documents Submitted for Verification - RMS',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px;">
          <h2 style="color: #2563EB; margin-top: 0;">KYC Submission Received</h2>
          <p>Hi <b>${user.full_name}</b>,</p>
          <p>Your KYC verification request has been successfully submitted and encrypted in our secure vault. A KYC officer will review your documents shortly.</p>
          
          <div style="background-color: #F3F4F6; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 4px 0;"><b>Request ID:</b> #${kycRequest.id}</p>
            <p style="margin: 4px 0;"><b>Current Status:</b> <span style="color: #D97706; font-weight: bold;">PENDING REVIEW</span></p>
            <p style="margin: 4px 0;"><b>Submitted At:</b> ${new Date(kycRequest.submitted_at || Date.now()).toLocaleString('en-IN')}</p>
          </div>

          <p>Verified users enjoy reduced security deposit requirements and faster rental approvals!</p>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6B7280; text-align: center;">Rental Management System Verification Team</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 KYC submission confirmation sent to ${user.email}`);
  } catch (error) {
    console.error('⚠️ Failed to send KYC submission email:', error.message);
  }
}

/**
 * 5. Sends KYC Decision Review Email (Verified or Rejected)
 */
async function sendKycReviewEmail({ user, decision, rejectionReason }) {
  try {
    const isApproved = decision === 'verified';
    const titleColor = isApproved ? '#059669' : '#DC2626';
    const statusText = isApproved ? 'APPROVED' : 'REJECTED';

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `KYC Verification Update: ${statusText} - RMS`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px;">
          <h2 style="color: ${titleColor}; margin-top: 0;">KYC Verification ${statusText}</h2>
          <p>Hi <b>${user.full_name}</b>,</p>
          <p>Your KYC verification request has been evaluated by our verification team.</p>
          
          <div style="background-color: #F3F4F6; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 4px 0;"><b>Final Status:</b> <span style="color: ${titleColor}; font-weight: bold;">${statusText}</span></p>
            ${
              !isApproved && rejectionReason
                ? `<p style="margin: 4px 0; color: #DC2626;"><b>Reason for Rejection:</b> ${rejectionReason}</p>`
                : '<p style="margin: 4px 0; color: #059669;">Your account is now fully verified. You are eligible for lower deposit tiers!</p>'
            }
          </div>

          ${
            !isApproved
              ? '<p>You can re-upload clearer identity documents by visiting your profile settings on the platform.</p>'
              : '<p>Thank you for completing your verification.</p>'
          }
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6B7280; text-align: center;">Rental Management System Verification Team</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 KYC review email sent to ${user.email}`);
  } catch (error) {
    console.error('⚠️ Failed to send KYC review email:', error.message);
  }
}

/**
 * 6. Sends Password Reset Email with Token Link
 */
async function sendPasswordResetEmail({ user, resetUrl }) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'Password Reset Request - RMS',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px;">
          <h2 style="color: #2563EB; margin-top: 0;">Password Reset Request</h2>
          <p>Hi <b>${user.full_name}</b>,</p>
          <p>We received a request to reset the password for your Rental Management System account.</p>
          <p>Click the button below to set a new password. This link is valid for <b>15 minutes</b> only:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #2563EB; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>

          <p style="font-size: 13px; color: #6B7280;">If the button above doesn't work, copy and paste this link into your browser:<br/>
            <a href="${resetUrl}" style="color: #2563EB; word-break: break-all;">${resetUrl}</a>
          </p>

          <p style="color: #DC2626; font-size: 13px;">If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6B7280; text-align: center;">Rental Management System Security Team</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Password reset email sent to ${user.email}`);
  } catch (error) {
    console.error('⚠️ Failed to send password reset email:', error.message);
  }
}

/**
 * 7. Sends Confirmation Notice on Successful Password Reset
 */
async function sendPasswordResetSuccessEmail({ user }) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'Your RMS Password Has Been Changed',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px;">
          <h2 style="color: #059669; margin-top: 0;">Password Changed Successfully</h2>
          <p>Hi <b>${user.full_name}</b>,</p>
          <p>This is a confirmation that the password for your account (<b>${user.email}</b>) was successfully updated.</p>
          <p style="color: #DC2626; font-size: 13px;">If you did not make this change, please contact platform administrators immediately.</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6B7280; text-align: center;">Rental Management System Security Team</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Password change confirmation sent to ${user.email}`);
  } catch (error) {
    console.error('⚠️ Failed to send password reset success email:', error.message);
  }
}

/**
 * 8. Sends Customer Cancellation & Refund Breakdown Email
 */
// Inside sendCustomerCancellationEmail in RMS/Backend/services/emailService.js

async function sendCustomerCancellationEmail({
  to,
  customerName,
  productTitle,
  orderId,
  cancelledBy,
  grossRent = 0,
  discountAmount = 0,
  actualPaidRent = 0,
  totalDeposit = 0,
  cancellationFeeDeducted = 0,
  refundAmount = 0,
}) {
  try {
    const isCancelledByCustomer = cancelledBy === 'customer';

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to,
      subject: `Booking Cancelled: #${orderId} - ${productTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 24px; background-color: #111827; color: #F9FAFB;">
          <h2 style="color: #F87171; margin-top: 0; font-size: 20px;">Rental Booking Cancelled</h2>
          <p style="color: #E5E7EB;">Hi <b>${customerName || 'Customer'}</b>,</p>
          <p style="color: #9CA3AF;">Your booking for <b>${productTitle}</b> (Order #${orderId}) has been cancelled by ${isCancelledByCustomer ? 'you' : 'the vendor'}.</p>
          
          <div style="background-color: #1F2937; border: 1px solid #374151; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <h4 style="margin: 0 0 12px 0; color: #E5E7EB; font-size: 14px; border-bottom: 1px solid #374151; pb-2;">Refund & Deduction Breakdown</h4>
            
            <table style="width: 100%; font-size: 13px; color: #D1D5DB; border-collapse: collapse;">
              <tr>
                <td style="padding: 4px 0;">Gross Listed Rent:</td>
                <td style="text-align: right; font-weight: bold; color: #F9FAFB;">₹${grossRent.toFixed(2)}</td>
              </tr>
              ${
                discountAmount > 0
                  ? `<tr>
                      <td style="padding: 4px 0; color: #34D399;">Loyalty Voucher Applied:</td>
                      <td style="text-align: right; font-weight: bold; color: #34D399;">- ₹${discountAmount.toFixed(2)}</td>
                    </tr>`
                  : ''
              }
              <tr>
                <td style="padding: 4px 0;">Actual Rental Fee Paid (100% Refundable):</td>
                <td style="text-align: right; font-weight: bold; color: #F9FAFB;">₹${actualPaidRent.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;">Security Escrow Deposit:</td>
                <td style="text-align: right; font-weight: bold; color: #F9FAFB;">₹${totalDeposit.toFixed(2)}</td>
              </tr>
              ${
                cancellationFeeDeducted > 0
                  ? `<tr>
                      <td style="padding: 4px 0; color: #F87171;">Vendor Cancellation Fee Deducted:</td>
                      <td style="text-align: right; font-weight: bold; color: #F87171;">- ₹${cancellationFeeDeducted.toFixed(2)}</td>
                    </tr>`
                  : ''
              }
              <tr style="border-top: 1px solid #374151;">
                <td style="padding: 10px 0 0 0; font-weight: bold; color: #34D399; font-size: 14px;">Total Refund Disbursed to You:</td>
                <td style="padding: 10px 0 0 0; text-align: right; font-weight: bold; color: #34D399; font-size: 15px;">₹${refundAmount.toFixed(2)}</td>
              </tr>
            </table>
          </div>

          <p style="font-size: 12px; color: #9CA3AF;">Refunds are credited to your registered bank account via electronic transfer within standard banking windows.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Failed to send cancellation email:', error);
  }
}

/**
 * 9. Sends Vendor Cancellation Notice & Compensation Fee Notice
 */
async function sendVendorCancellationEmail({
  to,
  vendorName,
  productTitle,
  orderId,
  quantity,
  cancellationCompensation,
}) {
  try {
    const hasCompensation = parseFloat(cancellationCompensation) > 0;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to,
      subject: `Order #${orderId} Cancelled by Customer - RMS`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px;">
          <h2 style="color: #D97706; margin-top: 0;">Customer Cancelled Booking</h2>
          <p>Hi <b>${vendorName}</b>,</p>
          <p>The customer has cancelled their reservation for <b>${productTitle}</b> (Order <b>#${orderId}</b>, Quantity: <b>${quantity} unit(s)</b>).</p>
          
          <div style="background-color: #F9FAFB; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #E5E7EB;">
            <h4 style="margin-top: 0; color: #374151; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px;">Inventory & Settlement Details</h4>
            <p style="margin: 6px 0; font-size: 13px;"><b>Reserved Stock Released:</b> ${quantity} unit(s) are now back in your available inventory.</p>
            ${
              hasCompensation
                ? `<p style="margin: 6px 0; font-size: 14px; font-weight: bold; color: #059669;"><b>Cancellation Fee Compensation to You:</b> ₹${parseFloat(cancellationCompensation).toFixed(2)}</p>`
                : '<p style="margin: 6px 0; font-size: 13px; color: #6B7280;">No cancellation fee was configured for this product.</p>'
            }
          </div>

          ${
            hasCompensation
              ? '<p style="font-size: 13px; color: #4B5563;">A payout ledger has been registered in the system to transfer this cancellation fee to your registered bank account.</p>'
              : ''
          }
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6B7280; text-align: center;">Rental Management System Vendor Operations</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Vendor cancellation notice sent to ${to}`);
  } catch (error) {
    console.error('⚠️ Failed to send vendor cancellation notice email:', error.message);
  }
}

/**
 * 10. Sends Security Deposit Forfeiture Email (Damaged Item or Expired Return)
 */
async function sendDepositForfeitureEmail({
  to,
  customerName,
  productTitle,
  vendorName,
  orderId,
  forfeitedAmount,
  reason,
}) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to,
      subject: `Notice of Escrow Deposit Forfeiture - Order #${orderId}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px;">
          <h2 style="color: #DC2626; margin-top: 0;">Security Deposit Forfeiture Notice</h2>
          <p>Hi <b>${customerName}</b>,</p>
          <p>This email is to notify you regarding the security deposit for your rental of <b>${productTitle}</b> (Order <b>#${orderId}</b>) from vendor <b>${vendorName}</b>.</p>
          
          <div style="background-color: #FEF2F2; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #FEE2E2;">
            <p style="margin: 4px 0; color: #991B1B;"><b>Forfeited Deposit Amount:</b> <span style="font-size: 16px; font-weight: bold;">₹${parseFloat(forfeitedAmount).toFixed(2)}</span></p>
            <p style="margin: 4px 0; color: #991B1B;"><b>Reason:</b> ${reason}</p>
          </div>

          <p style="font-size: 13px; color: #4B5563;">In accordance with our platform terms, the security deposit held in escrow has been transferred to the vendor to cover equipment replacement or repair costs.</p>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6B7280; text-align: center;">Rental Management System Trust & Safety</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Deposit forfeiture notice sent to ${to}`);
  } catch (error) {
    console.error('⚠️ Failed to send deposit forfeiture email:', error.message);
  }
}

/**
 * 11. Sends Account Suspension Notice Email with Audit & Proof Breakdown
 */
async function sendAccountBlockedEmail({
  to,
  userName,
  reason,
  paymentDetails,
  groupId,
  refundAmount,
}) {
  try {
    const contactEmail = process.env.ContactMe || 'support@rms.com';

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to,
      subject: 'Important: Your RMS Account Has Been Suspended (Payment Refund Notice)',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px;">
          <h2 style="color: #DC2626; margin-top: 0;">Account Suspension & Refund Notice</h2>
          <p>Hi <b>${userName || 'Valued User'}</b>,</p>
          <p>This is to inform you that your Rental Management System account has been <b>suspended by administration</b>.</p>
          
          <div style="background-color: #FEF2F2; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #FEE2E2;">
            <p style="margin: 4px 0; color: #991B1B; font-size: 13px;">
              <b>Reason / Status:</b> ${reason || 'Account flagged for administrative or delinquency review.'}
            </p>
            <p style="margin: 4px 0; color: #4B5563; font-size: 12px;">
              • Active rentals currently in your possession remain valid for return as per scheduled end dates.<br/>
              • New checkout requests are disabled.
            </p>
          </div>

          ${
            paymentDetails
              ? `
          <div style="background-color: #F9FAFB; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #E5E7EB;">
            <h4 style="margin-top: 0; color: #374151; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px;">
              Receipt & In-Flight Payment Proof
            </h4>
            <p style="margin: 4px 0; font-size: 13px;"><b>Group Order ID:</b> #${groupId || 'N/A'}</p>
            <p style="margin: 4px 0; font-size: 13px;"><b>Razorpay Payment ID:</b> <code>${paymentDetails.razorpay_payment_id || 'N/A'}</code></p>
            <p style="margin: 4px 0; font-size: 13px;"><b>Razorpay Order ID:</b> <code>${paymentDetails.razorpay_order_id || 'N/A'}</code></p>
            <p style="margin: 4px 0; font-size: 14px; font-weight: bold; color: #059669;">
              <b>100% Refund Disbursal Scheduled:</b> ₹${parseFloat(refundAmount || 0).toFixed(2)}
            </p>
            <p style="margin: 6px 0 0 0; font-size: 11px; color: #6B7280;">
              Our automated payout ledger has scheduled a complete refund for this transaction.
            </p>
          </div>
          `
              : ''
          }

          <div style="background-color: #F3F4F6; padding: 12px 15px; border-radius: 6px; border: 1px solid #E5E7EB; font-size: 13px;">
            <p style="margin: 0; color: #374151;">
              <b>Need clarification or wish to resolve this suspension?</b><br/>
              Contact our compliance representative directly at: 
              <a href="mailto:${contactEmail}" style="color: #2563EB; font-weight: bold; text-decoration: underline;">${contactEmail}</a>
            </p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6B7280; text-align: center;">Rental Management System Trust & Safety</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Account block refund notice sent to ${to}`);
  } catch (error) {
    console.error('⚠️ Failed to send account block email:', error.message);
  }
}

/**
 * 12. Sends Milestone Reward Email when Customer Unlocks a 10% Discount Coupon Card
 */
async function sendCouponUnlockedEmail({ to, userName, couponCode, discountPercent = 10 }) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to,
      subject: '🎉 Congratulations! You Unlocked a 10% Rental Privilege Voucher - RMS',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px;">
          <h2 style="color: #059669; margin-top: 0;">🎉 Loyalty Milestone Reached!</h2>
          <p>Hi <b>${userName || 'Valued Renter'}</b>,</p>
          <p>Thank you for being an outstanding member of the Rental Management System community. You have completed <b>8 consecutive on-time and undamaged returns</b>.</p>
          
          <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <p style="margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #D1FAE5;">Exclusive Privilege Card</p>
            <h1 style="margin: 10px 0; font-size: 28px; letter-spacing: 2px;">${couponCode}</h1>
            <p style="margin: 0; font-size: 15px; font-weight: bold;">${discountPercent}% OFF On Your Next Selected Rental Item</p>
          </div>

          <div style="background-color: #F9FAFB; padding: 15px; border-radius: 6px; border: 1px solid #E5E7EB; font-size: 13px;">
            <p style="margin: 4px 0;"><b>How to redeem:</b></p>
            <p style="margin: 4px 0; color: #4B5563;">• Add any item to your cart and proceed to checkout.</p>
            <p style="margin: 4px 0; color: #4B5563;">• Toggle the <b>"Apply 10% Loyalty Coupon"</b> option on your preferred cart item.</p>
            <p style="margin: 4px 0; color: #4B5563;">• Enjoy instant savings deducted directly from your rental subtotal.</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6B7280; text-align: center;">Rental Management System Loyalty Rewards</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Milestone reward email sent to ${to}`);
  } catch (error) {
    console.error('⚠️ Failed to send milestone reward email:', error.message);
  }
}


module.exports = {
  sendBookingConfirmationEmail,
  sendPayoutSettlementEmail,
  sendWelcomeEmail,
  sendKycSubmissionEmail,
  sendKycReviewEmail,
  sendPasswordResetEmail,
  sendPasswordResetSuccessEmail,
  sendCustomerCancellationEmail,
  sendVendorCancellationEmail,
  sendDepositForfeitureEmail,
  sendAccountBlockedEmail,
  sendCouponUnlockedEmail,
};