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
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 24px;">
          <h2 style="color: #2563EB; margin-top: 0;">Your Rental Booking is Confirmed!</h2>
          <p>Hi <b>${customer.full_name}</b>,</p>
          <p>Thank you for renting with us. Your payment has been verified directly with the vendor, and your equipment is now locked for pickup.</p>
          <div style="background-color: #F3F4F6; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 4px 0;"><b>Group Booking ID:</b> #${parentOrder.group_id}</p>
            <p style="margin: 4px 0;"><b>Payment Reference:</b> <code>${paymentDetails.razorpay_payment_id}</code></p>
          </div>
          <p>Your detailed tax invoice and security deposit receipt are attached below.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #777;">Rental Management System Team</p>
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
 * 2. NEW: Sends Instant Booking & Payment Notification to Vendor
 */
async function sendVendorBookingNotificationEmail({ vendor, customer, parentOrder, subOrders, paymentDetails }) {
  try {
    const totalRent = subOrders.reduce((sum, o) => sum + parseFloat(o.customer_paid_rent_snapshot || 0), 0);
    const totalDeposit = subOrders.reduce((sum, o) => sum + (parseFloat(o.deposit_per_item_snapshot || 0) * o.quantity), 0);
    const totalCollected = totalRent + totalDeposit;

    const itemsHtml = subOrders
      .map(
        (o) => `
        <tr style="border-bottom: 1px solid #E5E7EB;">
          <td style="padding: 8px 0;"><b>${o.product_title || 'Equipment'}</b> (Qty: ${o.quantity})</td>
          <td style="padding: 8px 0; text-align: center;">${new Date(o.start_date).toLocaleDateString()} to ${new Date(o.end_date).toLocaleDateString()}</td>
          <td style="padding: 8px 0; text-align: right;">₹${parseFloat(o.customer_paid_rent_snapshot || 0).toFixed(2)}</td>
        </tr>
      `
      )
      .join('');

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: vendor.email,
      subject: `🎉 New Direct Booking Received! - Order Group #${parentOrder.group_id}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 24px;">
          <h2 style="color: #059669; margin-top: 0;">New Rental Order & Direct Payment Received!</h2>
          <p>Hi <b>${vendor.full_name}</b>,</p>
          <p>Great news! A customer has reserved equipment from your store and completed direct payment to your Razorpay gateway account.</p>

          <div style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 6px; padding: 15px; margin: 15px 0;">
            <p style="margin: 4px 0; color: #065F46;"><b>Total Collected to Your Gateway:</b> <span style="font-size: 16px; font-weight: bold;">₹${totalCollected.toFixed(2)}</span></p>
            <p style="margin: 4px 0; font-size: 12px; color: #047857;">• Net Rent: ₹${totalRent.toFixed(2)} | • Refundable Security Deposit: ₹${totalDeposit.toFixed(2)}</p>
            <p style="margin: 4px 0; font-size: 12px; color: #047857;">• Payment ID: <code>${paymentDetails.razorpay_payment_id}</code></p>
          </div>

          <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 15px; margin: 15px 0; font-size: 13px;">
            <h4 style="margin: 0 0 8px 0; color: #374151;">Customer Details:</h4>
            <p style="margin: 2px 0;"><b>Name:</b> ${customer.full_name}</p>
            <p style="margin: 2px 0;"><b>Phone:</b> ${customer.phone || 'N/A'}</p>
            <p style="margin: 2px 0;"><b>Email:</b> ${customer.email}</p>
          </div>

          <h4 style="margin: 15px 0 8px 0; font-size: 13px; color: #374151;">Reserved Equipment:</h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 2px solid #E5E7EB; text-align: left; color: #6B7280;">
                <th style="padding: 6px 0;">Item</th>
                <th style="padding: 6px 0; text-align: center;">Duration</th>
                <th style="padding: 6px 0; text-align: right;">Rent</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div style="margin-top: 20px; padding: 12px; background-color: #EFF6FF; border-radius: 6px; font-size: 12px; color: #1E40AF;">
            <b>Next Step:</b> Verify the customer's 6-digit Handshake PIN in your Vendor Dashboard before physically handing over the equipment.
          </div>

          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6B7280; text-align: center;">Rental Management System Vendor Operations</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Vendor booking notice sent to ${vendor.email}`);
  } catch (error) {
    console.error('⚠️ Failed to send vendor booking email:', error.message);
  }
}

/**
 * 3. NEW: Sends Customer Return Inspection & Deposit Refund Settlement Slip
 */
async function sendDepositRefundSettlementEmail({
  to,
  customerName,
  vendorName,
  orderId,
  productTitle,
  totalDeposit,
  lateFeeDeducted = 0,
  refundedAmount,
  refundReference,
  isDamaged = false,
}) {
  try {
    const isFullForfeiture = parseFloat(refundedAmount) <= 0;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to,
      subject: `Return Settlement & Deposit Receipt - Order #${orderId}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 24px;">
          <h2 style="color: ${isFullForfeiture ? '#DC2626' : '#059669'}; margin-top: 0;">
            ${isFullForfeiture ? 'Deposit Forfeiture Notice' : 'Security Deposit Refund Processed'}
          </h2>
          <p>Hi <b>${customerName}</b>,</p>
          <p>Vendor <b>${vendorName}</b> has inspected and finalized the return of <b>${productTitle}</b> (Order #${orderId}).</p>

          <div style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <h4 style="margin: 0 0 12px 0; color: #374151; font-size: 13px; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px;">
              Deposit Settlement Breakdown
            </h4>
            <table style="width: 100%; font-size: 13px; color: #4B5563; border-collapse: collapse;">
              <tr>
                <td style="padding: 4px 0;">Original Security Deposit:</td>
                <td style="text-align: right; font-weight: bold; color: #1F2937;">₹${parseFloat(totalDeposit).toFixed(2)}</td>
              </tr>
              ${
                lateFeeDeducted > 0
                  ? `<tr>
                      <td style="padding: 4px 0; color: #DC2626;">Late Return Fee Deducted:</td>
                      <td style="text-align: right; font-weight: bold; color: #DC2626;">- ₹${parseFloat(lateFeeDeducted).toFixed(2)}</td>
                    </tr>`
                  : ''
              }
              ${
                isDamaged
                  ? `<tr>
                      <td style="padding: 4px 0; color: #DC2626;">Damage Repair Deduction:</td>
                      <td style="text-align: right; font-weight: bold; color: #DC2626;">- ₹${parseFloat(totalDeposit).toFixed(2)}</td>
                    </tr>`
                  : ''
              }
              <tr style="border-top: 1px solid #E5E7EB;">
                <td style="padding: 10px 0 0 0; font-weight: bold; color: #059669; font-size: 14px;">Total Refund Disbursed to You:</td>
                <td style="padding: 10px 0 0 0; text-align: right; font-weight: bold; color: #059669; font-size: 16px;">
                  ₹${parseFloat(refundedAmount).toFixed(2)}
                </td>
              </tr>
            </table>
          </div>

          ${
            !isFullForfeiture
              ? `
          <div style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 6px; padding: 12px; margin: 15px 0; font-size: 12px; color: #065F46;">
            <b>Refund Reference / Transaction ID:</b> <code>${refundReference || 'PROCESSED_DIRECTLY'}</code><br/>
            <span style="font-size: 11px; color: #047857;">If refunded via Razorpay API, funds reflect in your source account within standard banking windows. If settled offline via UPI/Cash, please verify the reference provided above.</span>
          </div>
          `
              : `
          <div style="background-color: #FEF2F2; border: 1px solid #FEE2E2; border-radius: 6px; padding: 12px; margin: 15px 0; font-size: 12px; color: #991B1B;">
            The security deposit was retained to cover repair/replacement costs as per store terms.
          </div>
          `
          }

          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6B7280; text-align: center;">Rental Management System Accounts & Settlement</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Deposit refund email sent to ${to}`);
  } catch (error) {
    console.error('⚠️ Failed to send deposit refund settlement email:', error.message);
  }
}


/**
 * 4. Sends Welcome Email on Successful Signup with Vendor Agreement PDF Attachment
 */
async function sendWelcomeEmail({ user }) {
  try {
    const isVendor = user?.role === 'vendor';
    const roleText = (user?.role || 'customer').toUpperCase();

    // Format cycle dates for vendor registration notice
    const startDate = user?.subscription_start_date
      ? new Date(user.subscription_start_date).toLocaleDateString('en-IN')
      : new Date().toLocaleDateString('en-IN');

    const renewalDate = user?.subscription_renewal_date
      ? new Date(user.subscription_renewal_date).toLocaleDateString('en-IN')
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN');

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    // Generate Agreement PDF buffer if user is registering as a vendor
    let attachments = [];
    if (isVendor) {
      try {
        const { generateVendorAgreementPDF } = require('../utils/pdfGenerator');
        const pdfBuffer = await generateVendorAgreementPDF({
          vendor: user,
          acceptedAt: new Date(),
        });
        attachments.push({
          filename: `RMS_Vendor_Merchant_Agreement_${user.id || 'REG'}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        });
      } catch (pdfErr) {
        console.error('⚠️ Failed to attach Vendor Agreement PDF to welcome email:', pdfErr.message);
      }
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: isVendor
        ? 'Welcome Vendor Partner - Executed Merchant Agreement & RMS Policy'
        : 'Welcome to RMS - Account Created Successfully!',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 12px; padding: 28px; background-color: #ffffff;">
          <h2 style="color: ${isVendor ? '#059669' : '#2563EB'}; margin-top: 0; font-size: 20px;">
            ${isVendor ? 'Welcome to RMS Merchant Partner Network!' : `Welcome to Rental Management System, ${user.full_name || 'Member'}!`}
          </h2>
          
          <p style="font-size: 14px; margin-bottom: 20px;">
            ${
              isVendor
                ? 'Your store account has been successfully initialized under the <b>Zero-Intermediation Merchant Model</b>. You retain direct control over your transactions and inventory.'
                : 'Your account has been registered successfully. You can now explore verified equipment, check live 60-day availability, and place rental bookings.'
            }
          </p>
          
          <!-- User Details Snapshot -->
          <div style="background-color: #F8FAFC; padding: 16px; border-radius: 8px; margin: 20px 0; border: 1px solid #E2E8F0; font-size: 13px;">
            <p style="margin: 4px 0;"><b>Registered Name:</b> ${user.full_name}</p>
            <p style="margin: 4px 0;"><b>Account Role:</b> <span style="display: inline-block; padding: 2px 8px; background-color: #E2E8F0; border-radius: 4px; font-weight: bold;">${roleText}</span></p>
            <p style="margin: 4px 0;"><b>Registered Email:</b> ${user.email}</p>
            <p style="margin: 4px 0;"><b>City:</b> ${user.city || 'N/A'}</p>
          </div>

          ${
            isVendor
              ? `
          <!-- Vendor Comprehensive Policy Box -->
          <div style="background-color: #0F172A; border: 1px solid #10B981; border-radius: 8px; padding: 20px; margin: 24px 0; color: #F1F5F9;">
            <h3 style="margin: 0 0 12px 0; color: #34D399; font-size: 15px; display: flex; align-items: center;">
              📜 Vendor Zero-Commission & Annual SaaS Licensing Terms
            </h3>
            
            <ul style="padding-left: 18px; margin: 0; font-size: 12px; color: #CBD5E1; line-height: 1.8;">
              <li style="margin-bottom: 8px;">
                <b style="color: #FFFFFF;">0% Per-Order Cut:</b> 100% of all rental charges and security deposits land immediately into your own connected Razorpay account upon customer checkout.
              </li>
              <li style="margin-bottom: 8px;">
                <b style="color: #FFFFFF;">365-Day Subscription Cycle:</b> Your annual cycle begins today (<b>${startDate}</b>) and concludes on your anniversary renewal date (<b>${renewalDate}</b>).
              </li>
              <li style="margin-bottom: 8px;">
                <b style="color: #FFFFFF;">5% Annual Platform Royalty:</b> Settle a flat 5% platform fee on your cumulative net rental revenue at cycle maturity. <b>Security deposits and cancelled bookings are 100% royalty-exempt</b>.
              </li>
              <li style="margin-bottom: 8px;">
                <b style="color: #FFFFFF;">3-Day Operational Grace Buffer:</b> After your 1-year mark, you receive a 3-day grace period to settle the statement. If unpaid past 3 days, new customer bookings and product updates are paused until settled.
              </li>
            </ul>
          </div>

          <!-- Attachment Notice -->
          <div style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 14px; margin: 20px 0; font-size: 13px; color: #166534;">
            📎 <b>Executed Contract Attached:</b> A PDF copy of your executed <b>RMS Vendor Merchant Partnership & Hold-Harmless Agreement</b> is attached to this email for your financial and legal records.
          </div>

          <!-- Next Step Action -->
          <div style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 8px; padding: 14px; margin: 20px 0; font-size: 13px; color: #065F46;">
            <b>Next Step:</b> Log in to your <a href="${clientUrl}/vendor/dashboard" style="color: #059669; font-weight: bold; text-decoration: underline;">Vendor Hub</a>, navigate to <b>Payment Gateway & License</b>, and save your direct Razorpay Key ID and Secret to activate your equipment listings.
          </div>
          `
              : `
          <!-- Customer Tip -->
          <div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 14px; margin: 20px 0; font-size: 13px; color: #1E40AF;">
            💡 <b>Save on Security Deposits:</b> Complete identity verification under your profile to unlock lower, verified deposit tiers across all catalog gear.
          </div>
          `
          }
          
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
          <p style="font-size: 12px; color: #9CA3AF; text-align: center; margin-bottom: 0;">
            Rental Management System (RMS) Enterprise Platform
          </p>
        </div>
      `,
      attachments,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Welcome email sent to ${user.email} (Vendor PDF attached: ${isVendor})`);
  } catch (error) {
    console.error('⚠️ Failed to send welcome email:', error.message);
  }
}

/**
 * 5. Sends KYC Submission Confirmation Email
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
 * 6. Sends KYC Decision Review Email (Verified or Rejected)
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
 * 7. Sends Password Reset Email with Token Link
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
 * 8. Sends Confirmation Notice on Successful Password Reset
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
 * 9. Sends Customer Cancellation & Refund Breakdown Email
 */
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
            <h4 style="margin: 0 0 12px 0; color: #E5E7EB; font-size: 14px; border-bottom: 1px solid #374151; padding-bottom: 8px;">Refund & Deduction Breakdown</h4>
            
            <table style="width: 100%; font-size: 13px; color: #D1D5DB; border-collapse: collapse;">
              <tr>
                <td style="padding: 4px 0;">Gross Listed Rent:</td>
                <td style="text-align: right; font-weight: bold; color: #F9FAFB;">₹${grossRent.toFixed(2)}</td>
              </tr>
              ${
                discountAmount > 0
                  ? `<tr>
                      <td style="padding: 4px 0; color: #34D399;">Store Promo Discount:</td>
                      <td style="text-align: right; font-weight: bold; color: #34D399;">- ₹${discountAmount.toFixed(2)}</td>
                    </tr>`
                  : ''
              }
              <tr>
                <td style="padding: 4px 0;">Actual Rental Fee Paid:</td>
                <td style="text-align: right; font-weight: bold; color: #F9FAFB;">₹${actualPaidRent.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0;">Security Deposit:</td>
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

          <p style="font-size: 12px; color: #9CA3AF;">Refunds are credited directly to your original payment method via the vendor's gateway.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Failed to send cancellation email:', error);
  }
}

/**
 * 10. Sends Security Deposit Forfeiture Email
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
      subject: `Notice of Deposit Forfeiture - Order #${orderId}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px;">
          <h2 style="color: #DC2626; margin-top: 0;">Security Deposit Forfeiture Notice</h2>
          <p>Hi <b>${customerName}</b>,</p>
          <p>This email is regarding the security deposit for your rental of <b>${productTitle}</b> (Order <b>#${orderId}</b>) from <b>${vendorName}</b>.</p>
          
          <div style="background-color: #FEF2F2; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #FEE2E2;">
            <p style="margin: 4px 0; color: #991B1B;"><b>Forfeited Deposit Amount:</b> <span style="font-size: 16px; font-weight: bold;">₹${parseFloat(forfeitedAmount).toFixed(2)}</span></p>
            <p style="margin: 4px 0; color: #991B1B;"><b>Reason:</b> ${reason}</p>
          </div>

          <p style="font-size: 13px; color: #4B5563;">In accordance with the vendor store terms, the deposit has been retained to cover equipment repairs or replacement.</p>
          
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
 * 11. Sends Account Suspension Notice Email
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
            <p style="margin: 4px 0; font-size: 14px; font-weight: bold; color: #059669;">
              <b>100% Refund Issued:</b> ₹${parseFloat(refundAmount || 0).toFixed(2)}
            </p>
          </div>
          `
              : ''
          }

          <div style="background-color: #F3F4F6; padding: 12px 15px; border-radius: 6px; border: 1px solid #E5E7EB; font-size: 13px;">
            <p style="margin: 0; color: #374151;">
              Contact compliance directly at: 
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
 * Sends Vendor Cancellation Notice & Compensation Fee Notice
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
          <p>Hi <b>${vendorName || 'Vendor'}</b>,</p>
          <p>The customer has cancelled their reservation for <b>${productTitle}</b> (Order <b>#${orderId}</b>, Quantity: <b>${quantity} unit(s)</b>).</p>
          
          <div style="background-color: #F9FAFB; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #E5E7EB;">
            <h4 style="margin-top: 0; color: #374151; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px;">Inventory & Settlement Details</h4>
            <p style="margin: 6px 0; font-size: 13px;"><b>Reserved Stock Released:</b> ${quantity} unit(s) have been returned to your available catalog stock.</p>
            ${
              hasCompensation
                ? `<p style="margin: 6px 0; font-size: 14px; font-weight: bold; color: #059669;"><b>Cancellation Compensation Fee Retained:</b> ₹${parseFloat(cancellationCompensation).toFixed(2)}</p>`
                : '<p style="margin: 6px 0; font-size: 13px; color: #6B7280;">No cancellation fee was configured for this product.</p>'
            }
          </div>

          <p style="font-size: 12px; color: #6B7280; text-align: center; margin-top: 20px;">Rental Management System Vendor Operations</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Vendor cancellation notice sent to ${to}`);
  } catch (error) {
    console.error('⚠️ Failed to send vendor cancellation notice email:', error.message);
  }
}

module.exports = {
  sendBookingConfirmationEmail,
  sendVendorBookingNotificationEmail,
  sendDepositRefundSettlementEmail,
  sendWelcomeEmail,
  sendKycSubmissionEmail,
  sendKycReviewEmail,
  sendPasswordResetEmail,
  sendPasswordResetSuccessEmail,
  sendCustomerCancellationEmail,
  sendVendorCancellationEmail, // 👈 Make sure this is present
  sendDepositForfeitureEmail,
  sendAccountBlockedEmail,
};