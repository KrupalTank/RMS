// controllers/chatController.js
const pool = require('../config/db');

// Helper: Disintermediation filter to mask personal contact info in messages
const scrubContactInfo = (text) => {
  if (!text || typeof text !== 'string') return '';

  // 1. Mask 10-digit Indian phone numbers (including spaced/hyphenated formats: 98765 43210, +91-9876543210)
  const phonePattern = /(?:\+91[-\s]?)?[6-9]\d{4}[-\s]?\d{5}|\b\d{10}\b/g;

  // 2. Mask standard email addresses
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  // 3. Mask UPI IDs (e.g., name@okhdfcbank, user@upi)
  const upiPattern = /[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g;

  let cleaned = text.replace(phonePattern, '[Contact number protected]');
  cleaned = cleaned.replace(emailPattern, '[Email address protected]');
  cleaned = cleaned.replace(upiPattern, '[Payment handle protected]');

  return cleaned;
};

// POST /api/v1/rms/chat/getOrCreateConversation
// Initializes or fetches an existing thread for a customer and vendor (inquiry or order-bound)
exports.getOrCreateConversation = async (req, res) => {
  const client = await pool.connect();
  try {
    const currentUserId = req.user.id;
    const { vendor_id, product_id, order_id } = req.body;

    if (!vendor_id) {
      return res.status(400).json({ success: false, message: 'Vendor ID is required.' });
    }

    await client.query('BEGIN');

    // Identify if the caller is the customer or the vendor
    let customerId = currentUserId;
    let targetVendorId = parseInt(vendor_id, 10);

    if (req.user.role === 'vendor') {
      // If a vendor is opening an existing order-bound thread
      customerId = req.body.customer_id;
      targetVendorId = currentUserId;
    }

    // Check for existing conversation matching this customer, vendor, and product
    let convRes = await client.query(
      `SELECT cc.*, 
              c.full_name AS customer_name, c.email AS customer_email,
              v.full_name AS vendor_name, v.email AS vendor_email,
              p.title AS product_title, p.images AS product_images
       FROM chat_conversations cc
       JOIN users c ON cc.customer_id = c.id
       JOIN users v ON cc.vendor_id = v.id
       LEFT JOIN products p ON cc.product_id = p.id
       WHERE cc.customer_id = $1 AND cc.vendor_id = $2 AND (cc.product_id = $3 OR ($3::int IS NULL AND cc.product_id IS NULL))
       LIMIT 1`,
      [customerId, targetVendorId, product_id || null]
    );

    let conversation;

    if (convRes.rows.length === 0) {
      // Create new conversation thread
      const insertRes = await client.query(
        `INSERT INTO chat_conversations (customer_id, vendor_id, product_id, order_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [customerId, targetVendorId, product_id || null, order_id || null]
      );

      // Re-fetch populated conversation details
      const populated = await client.query(
        `SELECT cc.*, 
                c.full_name AS customer_name, c.email AS customer_email,
                v.full_name AS vendor_name, v.email AS vendor_email,
                p.title AS product_title, p.images AS product_images
         FROM chat_conversations cc
         JOIN users c ON cc.customer_id = c.id
         JOIN users v ON cc.vendor_id = v.id
         LEFT JOIN products p ON cc.product_id = p.id
         WHERE cc.id = $1`,
        [insertRes.rows[0].id]
      );
      conversation = populated.rows[0];
    } else {
      conversation = convRes.rows[0];

      // If an order has now been placed for this inquiry, attach the order_id
      if (order_id && !conversation.order_id) {
        await client.query(
          'UPDATE chat_conversations SET order_id = $1 WHERE id = $2',
          [order_id, conversation.id]
        );
        conversation.order_id = order_id;
      }
    }

    await client.query('COMMIT');

    return res.status(200).json({ success: true, conversation });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Get/Create Conversation Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to access conversation thread.' });
  } finally {
    client.release();
  }
};

// GET /api/v1/rms/chat/myConversations
// Fetches all active inbox threads for the authenticated user
exports.getMyConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const isVendor = req.user.role === 'vendor';

    const query = `
      SELECT cc.*,
             c.full_name AS customer_name, c.phone AS customer_phone,
             v.full_name AS vendor_name, v.phone AS vendor_phone,
             p.title AS product_title, p.images AS product_images,
             o.status AS order_status
      FROM chat_conversations cc
      JOIN users c ON cc.customer_id = c.id
      JOIN users v ON cc.vendor_id = v.id
      LEFT JOIN products p ON cc.product_id = p.id
      LEFT JOIN orders o ON cc.order_id = o.id
      WHERE ${isVendor ? 'cc.vendor_id = $1' : 'cc.customer_id = $1'}
      ORDER BY cc.last_message_at DESC
    `;

    const result = await pool.query(query, [userId]);
    return res.status(200).json({ success: true, conversations: result.rows });
  } catch (err) {
    console.error('Get Conversations Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve inbox threads.' });
  }
};

// GET /api/v1/rms/chat/messages/:conversationId
// Loads message history and resets the caller's unread counter
exports.getMessages = async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;

    await client.query('BEGIN');

    // 1. Verify user belongs to this conversation
    const convCheck = await client.query(
      'SELECT customer_id, vendor_id FROM chat_conversations WHERE id = $1',
      [conversationId]
    );

    if (convCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const { customer_id, vendor_id } = convCheck.rows[0];
    if (userId !== customer_id && userId !== vendor_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Unauthorized to view this thread.' });
    }

    // 2. Fetch all messages in chronological order
    const msgRes = await client.query(
      `SELECT cm.*, u.full_name AS sender_name, u.role AS sender_role
       FROM chat_messages cm
       JOIN users u ON cm.sender_id = u.id
       WHERE cm.conversation_id = $1
       ORDER BY cm.created_at ASC`,
      [conversationId]
    );

    // 3. Reset unread counter for current reader
    if (userId === customer_id) {
      await client.query(
        'UPDATE chat_conversations SET unread_customer_count = 0 WHERE id = $1',
        [conversationId]
      );
    } else {
      await client.query(
        'UPDATE chat_conversations SET unread_vendor_count = 0 WHERE id = $1',
        [conversationId]
      );
    }

    // Mark messages sent by the other party as read
    await client.query(
      'UPDATE chat_messages SET is_read = TRUE WHERE conversation_id = $1 AND sender_id != $2',
      [conversationId, userId]
    );

    await client.query('COMMIT');

    return res.status(200).json({ success: true, messages: msgRes.rows });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Get Messages Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load messages.' });
  } finally {
    client.release();
  }
};

// POST /api/v1/rms/chat/sendMessage
// Inserts a new sanitized message, updates thread counters, and broadcasts via Socket.io
exports.sendMessage = async (req, res) => {
  const client = await pool.connect();
  try {
    const senderId = req.user.id;
    const { conversation_id, message_text } = req.body;

    if (!conversation_id || !message_text || !message_text.trim()) {
      return res.status(400).json({ success: false, message: 'Message content is required.' });
    }

    await client.query('BEGIN');

    // 1. Fetch conversation thread and verify membership
    const convRes = await client.query(
      'SELECT * FROM chat_conversations WHERE id = $1 FOR UPDATE',
      [conversation_id]
    );

    if (convRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Conversation thread not found.' });
    }

    const conversation = convRes.rows[0];
    const isCustomer = senderId === conversation.customer_id;
    const isVendor = senderId === conversation.vendor_id;

    if (!isCustomer && !isVendor) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Unauthorized to post in this conversation.' });
    }

    // 2. Apply contact masking filter if there is no active booking yet (disintermediation guard)
    let sanitizedText = message_text.trim();
    if (!conversation.order_id) {
      sanitizedText = scrubContactInfo(sanitizedText);
    }

    // 3. Save message
    const msgInsert = await client.query(
      `INSERT INTO chat_messages (conversation_id, sender_id, message_text)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [conversation_id, senderId, sanitizedText]
    );

    // 4. Update conversation's last message snippet and recipient unread counter
    const unreadCol = isCustomer ? 'unread_vendor_count' : 'unread_customer_count';
    await client.query(
      `UPDATE chat_conversations
       SET last_message_text = $1,
           last_message_at = CURRENT_TIMESTAMP,
           ${unreadCol} = ${unreadCol} + 1
       WHERE id = $2`,
      [sanitizedText, conversation_id]
    );

    await client.query('COMMIT');

    const fullMessage = {
      ...msgInsert.rows[0],
      sender_name: req.user.full_name,
      sender_role: req.user.role,
    };

    // 5. Emit real-time Socket.io events
    const io = req.app.get('socketio');
    if (io) {
      // Room-bound message broadcast
      io.to(`conversation_${conversation_id}`).emit('NEW_MESSAGE', fullMessage);

      // Targeted notification to the recipient user's private channel
      const recipientId = isCustomer ? conversation.vendor_id : conversation.customer_id;
      io.to(`user_${recipientId}`).emit('INBOX_UPDATED', {
        conversation_id,
        last_message_text: sanitizedText,
        sender_id: senderId,
      });
    }

    return res.status(201).json({ success: true, message: fullMessage });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Send Message Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to send message.' });
  } finally {
    client.release();
  }
};