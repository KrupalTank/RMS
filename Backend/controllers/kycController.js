// controllers/kycController.js
const axios = require('axios');
const pool = require('../config/db');
const imagekit = require('../config/imagekit');
const { encryptBuffer, decryptBuffer } = require('../utils/encryptionUtil');
const { sendKycReviewEmail } = require('../services/emailService');
// GET /api/v1/rms/kyc/pendingRequests
exports.getPendingRequests = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT k.id AS request_id, k.user_id, u.full_name, u.email, u.phone, k.submitted_at
       FROM kyc_requests k
       JOIN users u ON k.user_id = u.id
       WHERE u.kyc_status = 'pending'
       ORDER BY k.submitted_at ASC`
    );

    return res.status(200).json({ success: true, pendingRequests: result.rows });
  } catch (error) {
    console.error('Get Pending KYC Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch pending requests.' });
  }
};

// controllers/kycController.js

// GET /api/v1/rms/kyc/document/:type/:requestId
exports.getDecryptedDocument = async (req, res) => {
  try {
    const { type, requestId } = req.params; // type: 'aadhaar' or 'live_photo'

    const query = await pool.query(
      'SELECT aadhaar_card_url, live_photo_url FROM kyc_requests WHERE id = $1',
      [requestId]
    );

    if (query.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'KYC record not found.' });
    }

    const rawFileUrl =
      type === 'aadhaar' ? query.rows[0].aadhaar_card_url : query.rows[0].live_photo_url;

    // 1. Cleanly parse out the relative path from the stored URL
    const urlObj = new URL(rawFileUrl);
    // Remove the leading '/wzffus3ck' (the first path segment)
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    pathParts.shift(); // removes account ID segment
    const relativePath = '/' + pathParts.join('/'); // e.g. '/rms_kyc_encrypted/user_1_aadhaar_xxx.enc'

    // 2. Generate signed private URL with proper slashes
    const signedUrl = imagekit.url({
      path: relativePath,
      signed: true,
      expireSeconds: 300,
    });

    // 3. Download the encrypted binary
    const response = await axios.get(signedUrl, { responseType: 'arraybuffer' });
    const encryptedBuffer = Buffer.from(response.data);

    // 4. Decrypt AES-256-GCM buffer and stream JPEG back
    const decryptedBuffer = decryptBuffer(encryptedBuffer);

    res.setHeader('Content-Type', 'image/jpeg');
    return res.send(decryptedBuffer);
  } catch (error) {
    console.error('Document Decryption Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to decrypt document.' });
  }
};

// POST /api/v1/rms/kyc/review
exports.reviewKyc = async (req, res) => {
  try {
    const officerId = req.user.id;
    const { requestId, decision, rejection_reason } = req.body; // decision: 'verified' | 'rejected'

    if (!['verified', 'rejected'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'Invalid review decision.' });
    }

    const kycQuery = await pool.query('SELECT user_id FROM kyc_requests WHERE id = $1', [requestId]);
    if (kycQuery.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'KYC request not found.' });
    }

    const targetUserId = kycQuery.rows[0].user_id;

    // Update kyc_requests table
    await pool.query(
      `UPDATE kyc_requests 
       SET reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP, rejection_reason = $2 
       WHERE id = $3`,
      [officerId, decision === 'rejected' ? rejection_reason : null, requestId]
    );

    // Update user status
    await pool.query('UPDATE users SET kyc_status = $1 WHERE id = $2', [decision, targetUserId]);

    const targetUserRes = await pool.query(
      'SELECT full_name, email FROM users WHERE id = $1',
      [targetUserId]
    );

    if (targetUserRes.rows.length > 0) {
      sendKycReviewEmail({
        user: targetUserRes.rows[0],
        decision : decision,
        rejectionReason: rejection_reason || null,
      });
    }
    return res.status(200).json({
      success: true,
      message: `KYC request marked as ${decision}.`,
    });
  } catch (error) {
    console.error('Review KYC Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process KYC review.' });
  }
};