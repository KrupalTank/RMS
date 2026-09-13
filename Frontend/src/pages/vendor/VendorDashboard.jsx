// src/pages/vendor/VendorDashboard.jsx
import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import api from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import { parseProductImages } from '../../utils/imageHelper';
import {
  Store,
  Package,
  Plus,
  Edit3,
  Layers,
  FolderPlus,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  X,
  Upload,
  Phone,
  MapPin,
  Calendar,
  AlertCircle,
  RefreshCw,
  Trash2,
  MessageSquare,
  Send,
  User,
  Shield,
  Clock,
  KeyRound,
  Tag,
  CreditCard,
  Lock,
  Eye,
  EyeOff,
  Percent,
  Receipt,
  Check,
} from 'lucide-react';

const VendorDashboard = () => {
  const { user } = useAuth();
  // 'inventory' | 'orders' | 'coupons' | 'gateway' | 'messages'
  const [activeTab, setActiveTab] = useState('inventory');

  // Core Data states
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [couponSubTab, setCouponSubTab] = useState('active'); // 'active' | 'completed'

  const [gatewayStatus, setGatewayStatus] = useState({
    isConfigured: false,
    key_id: null,
    subscription_start_date: null,
    subscription_renewal_date: null,
  });

  // Annual SaaS Billing State
  const [annualBillingState, setAnnualBillingState] = useState({
    subscription: {},
    pendingBill: null,
    history: [],
  });
  const [payingBill, setPayingBill] = useState(false);

  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState({ success: '', error: '' });

  // Gateway Form State
  const [gatewayForm, setGatewayForm] = useState({
    razorpay_key_id: '',
    razorpay_key_secret: '',
  });
  const [showSecret, setShowSecret] = useState(false);
  const [savingGateway, setSavingGateway] = useState(false);

  // Coupon Form Modal State
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [couponForm, setCouponForm] = useState({
    code: '',
    discount_type: 'PERCENT',
    discount_value: '',
    max_discount_amount: '',
    min_order_amount: '0',
    min_rental_days: '1',
    max_uses: '',
    per_user_limit: '1',
    valid_until: '',
  });
  const [savingCoupon, setSavingCoupon] = useState(false);

  // Filter coupons into Active Campaigns vs Completed/Archived
  const todayDateStr = new Date().toISOString().split('T')[0];

  const activeCoupons = coupons.filter((c) => {
    const isExpired = c.valid_until && c.valid_until.split('T')[0] < todayDateStr;
    const isMaxedOut = c.max_uses && c.used_count >= c.max_uses;
    return !c.is_archived && c.is_active && !isExpired && !isMaxedOut;
  });

  const completedCoupons = coupons.filter((c) => {
    const isExpired = c.valid_until && c.valid_until.split('T')[0] < todayDateStr;
    const isMaxedOut = c.max_uses && c.used_count >= c.max_uses;
    return c.is_archived || !c.is_active || isExpired || isMaxedOut;
  });

  const displayedCoupons = couponSubTab === 'active' ? activeCoupons : completedCoupons;
  // Chat Data States
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);

  // Modal States
  const [showProductModal, setShowProductModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [handoverModalOrder, setHandoverModalOrder] = useState(null);
  const [enteredOtp, setEnteredOtp] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [assetSerial, setAssetSerial] = useState(''); // Optional Asset Tag/Serial

  // Product Form State
  const initialFormState = {
    title: '',
    description: '',
    category_id: '',
    total_quantity: 1,
    rent_per_day_1_4: '',
    rent_per_day_5_9: '',
    rent_per_day_10_onwards: '',
    deposit_verified: '',
    deposit_non_verified: '',
    late_fee_verified: '',
    late_fee_non_verified: '',
    cancellation_fee: '',
  };
  const [formData, setFormData] = useState(initialFormState);
  const [existingImages, setExistingImages] = useState([]);
  const [newImageFiles, setNewImageFiles] = useState([]);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Return Inspection Modal State
  const [inspectingOrder, setInspectingOrder] = useState(null);
  const [productCondition, setProductCondition] = useState('Good');
  const [refundMethod, setRefundMethod] = useState('razorpay_api'); // 'razorpay_api' | 'offline'
  const [offlineReference, setOfflineReference] = useState('');
  const [orderActionLoading, setOrderActionLoading] = useState(false);

  // Socket & Auto-scroll Refs
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Helper: load Razorpay checkout script dynamically
  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  // 1. Fetch initial vendor inventory, orders, coupons, gateway status, and annual billing
  const fetchData = async () => {
    setLoading(true);
    setBanner({ success: '', error: '' });
    try {
      const [prodRes, catRes, ordRes, cpnRes, gtwRes, billRes] = await Promise.all([
        api.get('/vendor/getProducts'),
        api.get('/vendor/getCategories'),
        api.get('/vendor/getOrders'),
        api.get('/vendor/coupons'),
        api.get('/vendor/gatewayStatus'),
        api.get('/vendor/annualBillingStatus').catch(() => ({ data: { success: false } })),
      ]);

      if (prodRes.data.success) setProducts(prodRes.data.products);
      if (catRes.data.success) setCategories(catRes.data.categories);
      if (ordRes.data.success) setOrders(ordRes.data.orders);
      if (cpnRes.data.success) setCoupons(cpnRes.data.coupons);
      if (gtwRes.data.success) setGatewayStatus(gtwRes.data);
      if (billRes.data.success) {
        setAnnualBillingState({
          subscription: billRes.data.subscription || {},
          pendingBill: billRes.data.pendingBill || null,
          history: billRes.data.history || [],
        });
      }
    } catch (err) {
      setBanner({
        success: '',
        error: err.response?.data?.message || 'Failed to fetch vendor data.',
      });
    } finally {
      setLoading(false);
    }
  };

  // 2. Fetch Chat Conversations
  const fetchConversations = async () => {
    try {
      const res = await api.get('/chat/myConversations');
      if (res.data.success) {
        setConversations(res.data.conversations || []);
      }
    } catch (err) {
      console.error('Fetch conversations error:', err);
    }
  };

  // 3. Fetch Messages for Selected Conversation
  const loadMessages = async (convId) => {
    setChatLoading(true);
    try {
      const res = await api.get(`/chat/messages/${convId}`);
      if (res.data.success) {
        setMessages(res.data.messages || []);
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, unread_vendor_count: 0 } : c))
        );
      }
    } catch (err) {
      console.error('Load messages error:', err);
    } finally {
      setChatLoading(false);
      setTimeout(scrollToBottom, 50);
    }
  };

  // Initialize socket and data
  useEffect(() => {
    fetchData();
    fetchConversations();

    const socket = io('http://localhost:5000', { withCredentials: true });
    socketRef.current = socket;

    if (user?.id) {
      socket.emit('join_user_room', user.id);
    }

    socket.on('ORDER_LOCKED', () => {
      fetchData();
    });

    socket.on('INBOX_UPDATED', () => {
      fetchConversations();
    });

    socket.on('ORDER_STATUS_CHANGED', (data) => {
      setOrders((prevOrders) =>
        prevOrders.map((o) => (o.id === data.orderId ? { ...o, status: data.newStatus } : o))
      );
      fetchData();
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  // Handle room joining when selected conversation changes
  useEffect(() => {
    if (selectedConv && socketRef.current) {
      loadMessages(selectedConv.id);
      socketRef.current.emit('join_room', `conversation_${selectedConv.id}`);

      const handleIncomingMessage = (newMsg) => {
        if (newMsg.conversation_id === selectedConv.id) {
          setMessages((prev) => [...prev, newMsg]);
          setTimeout(scrollToBottom, 50);
        }
      };

      socketRef.current.on('NEW_MESSAGE', handleIncomingMessage);

      return () => {
        socketRef.current.off('NEW_MESSAGE', handleIncomingMessage);
      };
    }
  }, [selectedConv]);

  const handleSelectConversation = (conv) => {
    setSelectedConv(conv);
  };

  // Send Message Handler
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !selectedConv || sendingMessage) return;

    setSendingMessage(true);
    try {
      const res = await api.post('/chat/sendMessage', {
        conversation_id: selectedConv.id,
        message_text: chatInput.trim(),
      });

      if (res.data.success) {
        setChatInput('');
        fetchConversations();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to send message.');
    } finally {
      setSendingMessage(false);
      setTimeout(scrollToBottom, 50);
    }
  };

  // Open Chat from Order Card
  const handleOpenOrderChat = async (ord) => {
    try {
      const res = await api.post('/chat/getOrCreateConversation', {
        vendor_id: user.id,
        customer_id: ord.customer_id,
        product_id: ord.product_id,
        order_id: ord.id,
      });

      if (res.data.success) {
        setActiveTab('messages');
        setSelectedConv(res.data.conversation);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to initiate order chat.');
    }
  };

  // Handshake PIN verification with optional serial tag
  const handleVerifyOtpSubmit = async (e) => {
    e.preventDefault();
    if (!enteredOtp || enteredOtp.trim().length !== 6) {
      alert('Please enter a valid 6-digit numeric PIN.');
      return;
    }

    setVerifyingOtp(true);
    try {
      const res = await api.post('/vendor/verifyHandoverOtp', {
        order_id: handoverModalOrder.id,
        otp: enteredOtp.trim(),
        assigned_serial_number: assetSerial.trim() || null,
      });

      if (res.data.success) {
        setBanner({ success: res.data.message, error: '' });
        setHandoverModalOrder(null);
        setEnteredOtp('');
        setAssetSerial('');
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Handover PIN verification failed.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Save Gateway Credentials
  const handleSaveGateway = async (e) => {
    e.preventDefault();
    if (!gatewayForm.razorpay_key_id.trim() || !gatewayForm.razorpay_key_secret.trim()) {
      alert('Both Razorpay Key ID and Key Secret are required.');
      return;
    }

    setSavingGateway(true);
    try {
      const res = await api.put('/vendor/updateGatewayCredentials', gatewayForm);
      if (res.data.success) {
        setBanner({ success: 'Razorpay keys securely updated and encrypted.', error: '' });
        setGatewayForm({ razorpay_key_id: '', razorpay_key_secret: '' });
        fetchData();
      }
    } catch (err) {
      setBanner({
        success: '',
        error: err.response?.data?.message || 'Failed to update gateway credentials.',
      });
    } finally {
      setSavingGateway(false);
    }
  };

  // Pay 5% Annual SaaS Royalty Bill
  const handlePayAnnualBill = async (billingId) => {
    setPayingBill(true);
    try {
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded) {
        alert('Could not connect to Razorpay SDK. Check your internet connection.');
        setPayingBill(false);
        return;
      }

      const res = await api.post('/vendor/createAnnualBillingOrder', {
        billing_id: billingId,
      });

      if (res.data.zero_due) {
        setBanner({ success: 'Annual license renewed (Zero earnings this period).', error: '' });
        fetchData();
        setPayingBill(false);
        return;
      }

      const { key_id, razorpay_order_id, amount } = res.data;

      const options = {
        key: key_id,
        amount: amount,
        currency: 'INR',
        name: 'RMS Platform Administration',
        description: '5% Annual Software Royalty Settlement',
        order_id: razorpay_order_id,
        handler: async (response) => {
          try {
            const verifyRes = await api.post('/vendor/verifyAnnualBillingPayment', {
              billing_id: billingId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (verifyRes.data.success) {
              setBanner({
                success: '🎉 Annual 5% Royalty paid! Your license has been extended for 1 full year.',
                error: '',
              });
              fetchData();
            }
          } catch (vErr) {
            alert(vErr.response?.data?.message || 'Payment signature verification failed.');
          } finally {
            setPayingBill(false);
          }
        },
        prefill: {
          name: user.full_name,
          email: user.email,
          contact: user.phone || '',
        },
        theme: { color: '#059669' },
        modal: {
          ondismiss: () => setPayingBill(false),
        },
      };

      const razorpayInstance = new window.Razorpay(options);
      razorpayInstance.open();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to initialize billing checkout.');
      setPayingBill(false);
    }
  };

  // Create Store Coupon
  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    if (!couponForm.code.trim() || !couponForm.discount_value) {
      alert('Coupon code and discount value are required.');
      return;
    }

    setSavingCoupon(true);
    try {
      const payload = {
        code: couponForm.code.trim().toUpperCase(),
        discount_type: couponForm.discount_type,
        discount_value: parseFloat(couponForm.discount_value),
        max_discount_amount: couponForm.max_discount_amount
          ? parseFloat(couponForm.max_discount_amount)
          : null,
        min_order_amount: parseFloat(couponForm.min_order_amount || 0),
        min_rental_days: parseInt(couponForm.min_rental_days || 1, 10),
        max_uses: couponForm.max_uses ? parseInt(couponForm.max_uses, 10) : null,
        per_user_limit: parseInt(couponForm.per_user_limit || 1, 10),
        valid_until: couponForm.valid_until ? new Date(couponForm.valid_until).toISOString() : null,
      };

      const res = await api.post('/vendor/createCoupon', payload);
      if (res.data.success) {
        setBanner({ success: res.data.message, error: '' });
        setShowCouponModal(false);
        setCouponForm({
          code: '',
          discount_type: 'PERCENT',
          discount_value: '',
          max_discount_amount: '',
          min_order_amount: '0',
          min_rental_days: '1',
          max_uses: '',
          per_user_limit: '1',
          valid_until: '',
        });
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create coupon.');
    } finally {
      setSavingCoupon(false);
    }
  };

  const handleToggleCoupon = async (id) => {
    try {
      const res = await api.put(`/vendor/toggleCoupon/${id}`);
      if (res.data.success) {
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to toggle coupon.');
    }
  };

  const handleDeleteCoupon = async (id) => {
    if (!window.confirm('Delete this store promotional coupon?')) return;
    try {
      const res = await api.delete(`/vendor/deleteCoupon/${id}`);
      if (res.data.success) {
        fetchData();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete coupon.');
    }
  };

  // Product Modals & Handlers
  const handleOpenAddModal = () => {
    if (annualBillingState.pendingBill) {
      alert('License Expired: Please settle your pending 5% annual royalty bill under "Payment Gateway & License" before adding new inventory.');
      setActiveTab('gateway');
      return;
    }
    setIsEditing(false);
    setEditingProductId(null);
    setFormData(initialFormState);
    setExistingImages([]);
    setNewImageFiles([]);
    setShowProductModal(true);
  };

  const handleOpenEditModal = (product) => {
    if (annualBillingState.pendingBill) {
      alert('License Expired: Please settle your pending 5% annual royalty bill under "Payment Gateway & License" before editing inventory.');
      setActiveTab('gateway');
      return;
    }
    setIsEditing(true);
    setEditingProductId(product.id);

    const parsedImgs = Array.isArray(product.images)
      ? product.images
      : typeof product.images === 'string'
      ? JSON.parse(product.images || '[]')
      : [];

    setExistingImages(parsedImgs);
    setNewImageFiles([]);
    setFormData({
      title: product.title || '',
      description: product.description || '',
      category_id: product.category_id || '',
      total_quantity: product.total_quantity || 1,
      rent_per_day_1_4: product.rent_per_day_1_4 || '',
      rent_per_day_5_9: product.rent_per_day_5_9 || '',
      rent_per_day_10_onwards: product.rent_per_day_10_onwards || '',
      deposit_verified: product.deposit_verified || '',
      deposit_non_verified: product.deposit_non_verified || '',
      late_fee_verified: product.late_fee_verified || '',
      late_fee_non_verified: product.late_fee_non_verified || '',
      cancellation_fee: product.cancellation_fee || '',
    });
    setShowProductModal(true);
  };

  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
  const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const invalidFiles = selectedFiles.filter((file) => {
      const fileExt = '.' + file.name.split('.').pop().toLowerCase();
      const isMimeValid = ALLOWED_TYPES.includes(file.type.toLowerCase());
      const isExtValid = ALLOWED_EXTENSIONS.includes(fileExt);
      return !isMimeValid && !isExtValid;
    });

    if (invalidFiles.length > 0) {
      alert('Invalid file format! Only JPG, JPEG, and PNG images are allowed.');
      e.target.value = '';
      return;
    }

    const availableSlots = 6 - (existingImages.length + newImageFiles.length);
    if (selectedFiles.length > availableSlots) {
      alert(`Maximum 6 images allowed. ${availableSlots} slot(s) remaining.`);
      e.target.value = '';
      return;
    }

    setNewImageFiles((prev) => [...prev, ...selectedFiles.slice(0, availableSlots)]);
    e.target.value = '';
  };

  const handleRemoveExistingImage = (indexToRemove) => {
    setExistingImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleRemoveNewFile = (indexToRemove) => {
    setNewImageFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    setBanner({ success: '', error: '' });

    const r1 = parseFloat(formData.rent_per_day_1_4);
    const r2 = parseFloat(formData.rent_per_day_5_9);
    const r3 = parseFloat(formData.rent_per_day_10_onwards);

    if (r1 < r2 || r2 < r3 || r3 <= 0) {
      setBanner({
        success: '',
        error: 'Tiered Pricing Error: Ensure 1–4 Days Rate ≥ 5–9 Days Rate ≥ 10+ Days Rate > 0.',
      });
      return;
    }

    const totalImgs = existingImages.length + newImageFiles.length;
    if (totalImgs < 1) {
      setBanner({ success: '', error: 'At least 1 product image is required.' });
      return;
    }

    setFormSubmitting(true);
    try {
      const data = new FormData();
      Object.keys(formData).forEach((key) => {
        data.append(key, formData[key]);
      });

      if (isEditing) {
        data.append('existing_images', JSON.stringify(existingImages));
        newImageFiles.forEach((file) => data.append('images', file));
        await api.put(`/vendor/editProduct/${editingProductId}`, data, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setBanner({ success: 'Product updated successfully!', error: '' });
      } else {
        newImageFiles.forEach((file) => data.append('images', file));
        await api.post('/vendor/addProduct', data, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setBanner({ success: 'Product added successfully!', error: '' });
      }

      setShowProductModal(false);
      fetchData();
    } catch (err) {
      setBanner({
        success: '',
        error: err.response?.data?.message || 'Failed to save product.',
      });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    try {
      const res = await api.post('/vendor/addCategory', { name: newCategoryName.trim() });
      if (res.data.success) {
        setCategories((prev) => [...prev, res.data.category]);
        setFormData((prev) => ({ ...prev, category_id: res.data.category.id }));
        setNewCategoryName('');
        setShowCategoryModal(false);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add category.');
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Cancel this booking before delivery? A 100% refund will be issued to the customer.'))
      return;
    setOrderActionLoading(true);
    try {
      const res = await api.post('/vendor/changeOrderStatus', {
        order_id: orderId,
        status: 'Cancelled',
      });
      if (res.data.success) {
        setBanner({ success: 'Order cancelled and customer refunded.', error: '' });
        fetchData();
      }
    } catch (err) {
      setBanner({ success: '', error: err.response?.data?.message || 'Failed to cancel order.' });
    } finally {
      setOrderActionLoading(false);
    }
  };

  const handleProcessReturn = async (e) => {
    e.preventDefault();
    setOrderActionLoading(true);
    try {
      const payload = {
        order_id: inspectingOrder.id,
        status: 'Returned',
        product_condition: productCondition,
        offline_refund_reference: refundMethod === 'offline' ? offlineReference.trim() : null,
      };

      const res = await api.post('/vendor/changeOrderStatus', payload);

      if (res.data.success) {
        setBanner({
          success: res.data.message || 'Return completed and deposit settled directly.',
          error: '',
        });
        setInspectingOrder(null);
        setOfflineReference('');
        fetchData();
      }
    } catch (err) {
      setBanner({
        success: '',
        error: err.response?.data?.message || 'Failed to process return.',
      });
      setInspectingOrder(null);
      fetchData();
    } finally {
      setOrderActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  const totalUnreadMessages = conversations.reduce(
    (acc, c) => acc + (parseInt(c.unread_vendor_count, 10) || 0),
    0
  );

  const isRenewalDue =
    annualBillingState.pendingBill ||
    (gatewayStatus.subscription_renewal_date &&
      new Date(gatewayStatus.subscription_renewal_date) <= new Date());

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
            <Store className="w-6 h-6 text-emerald-600" />
            <span>Store Operations Dashboard</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Zero-intermediation SaaS workspace: Manage inventory, promo codes, gateway keys, and orders.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCategoryModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition"
          >
            <FolderPlus className="w-4 h-4" /> Add Category
          </button>
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
          >
            <Plus className="w-4 h-4" /> Add New Product
          </button>
        </div>
      </div>

      {/* Dynamic Annual Licensing & Renewal Alert */}
      {(() => {
        if (!gatewayStatus.subscription_renewal_date) return null;

        const now = new Date();
        const renewalDate = new Date(gatewayStatus.subscription_renewal_date);
        
        // Calculate grace period expiration (period_end + 3 days)
        const graceEndDate = new Date(renewalDate);
        graceEndDate.setDate(graceEndDate.getDate() + 3);

        const diffTime = graceEndDate.getTime() - now.getTime();
        const graceDaysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (annualBillingState.pendingBill) {
          const isHardLocked = graceDaysLeft <= 0;

          return (
            <div
              className={`p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-sm border ${
                isHardLocked
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle
                  className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                    isHardLocked ? 'text-rose-600' : 'text-amber-600'
                  }`}
                />
                <div>
                  <p className="font-extrabold text-sm">
                    {isHardLocked
                      ? `Annual License Overdue: Storefront Paused`
                      : `Annual RMS License Due: ₹${parseFloat(
                          annualBillingState.pendingBill.platform_fee_due
                        ).toFixed(2)} (${graceDaysLeft} Grace Day${graceDaysLeft !== 1 ? 's' : ''} Remaining)`}
                  </p>
                  <p className="mt-0.5">
                    {isHardLocked
                      ? `Your 3-day grace period has expired. Customer checkouts and inventory updates are locked until the 5% platform royalty (₹${parseFloat(
                          annualBillingState.pendingBill.platform_fee_due
                        ).toFixed(2)}) is settled.`
                      : `Your 12-month period has concluded. Settle your 5% platform royalty before the 3-day grace window ends to keep your storefront open.`}
                  </p>
                </div>
              </div>

              <button
                onClick={() => handlePayAnnualBill(annualBillingState.pendingBill.id)}
                disabled={payingBill}
                className={`px-4 py-2 text-white font-bold rounded-lg transition shadow-sm flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 ${
                  isHardLocked
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>
                  {payingBill
                    ? 'Connecting...'
                    : `Pay ₹${parseFloat(annualBillingState.pendingBill.platform_fee_due).toFixed(
                        2
                      )} Royalty`}
                </span>
              </button>
            </div>
          );
        }

        return null;
      })()}

      {/* Gateway Alert if not configured */}
      {!gatewayStatus.isConfigured && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-amber-800 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600" />
            <span>
              <b>Action Required:</b> Your Razorpay Gateway is not configured. Customers cannot book your gear until your API keys are saved.
            </span>
          </div>
          <button
            onClick={() => setActiveTab('gateway')}
            className="px-3 py-1.5 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition flex-shrink-0"
          >
            Configure Gateway
          </button>
        </div>
      )}

      {/* Status Notifications */}
      {banner.success && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{banner.success}</span>
        </div>
      )}
      {banner.error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{banner.error}</span>
        </div>
      )}

      {/* Navigation Tabs Switcher */}
      <div className="flex border-b border-gray-200 space-x-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
            activeTab === 'inventory'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Inventory ({products.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
            activeTab === 'orders'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Orders & Returns ({orders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('coupons')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
            activeTab === 'coupons'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>Promotions & Coupons ({coupons.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('gateway')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
            activeTab === 'gateway'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Payment Gateway & License</span>
          {annualBillingState.pendingBill && (
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('messages')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
            activeTab === 'messages'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Customer Messages</span>
          {totalUnreadMessages > 0 && (
            <span className="bg-rose-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
              {totalUnreadMessages}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: INVENTORY & PRODUCTS */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          {products.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200 space-y-3">
              <Layers className="w-12 h-12 text-gray-300 mx-auto" />
              <h3 className="text-sm font-bold text-gray-800">No products in your catalog</h3>
              <p className="text-xs text-gray-500">Add equipment and list items for rent.</p>
              <button
                onClick={handleOpenAddModal}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold"
              >
                Create First Product
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((prod) => {
                const images = parseProductImages(prod.images);
                const primaryImg = images[0] || 'https://placehold.co/400x300?text=No+Image';

                return (
                  <div
                    key={prod.id}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative h-44 w-full bg-gray-100">
                        <img src={primaryImg} alt={prod.title} className="w-full h-full object-cover" />
                        <span className="absolute top-2 right-2 bg-gray-900/80 text-white text-[11px] font-semibold px-2 py-0.5 rounded backdrop-blur-sm">
                          {images.length} Image{images.length > 1 ? 's' : ''}
                        </span>
                        <span className="absolute top-2 left-2 bg-emerald-600 text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                          {prod.category_name || 'General'}
                        </span>
                      </div>

                      <div className="p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <h3 className="text-base font-bold text-gray-900 line-clamp-1">{prod.title}</h3>
                          <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                            Stock: {prod.total_quantity}
                          </span>
                        </div>

                        <p className="text-xs text-gray-500 line-clamp-2">{prod.description}</p>

                        <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100 grid grid-cols-3 gap-1.5 text-center text-xs">
                          <div className="border-r border-gray-200 pr-1">
                            <span className="block text-[10px] text-gray-400 font-medium">1–4 Days</span>
                            <span className="font-bold text-gray-800">
                              ₹{parseFloat(prod.rent_per_day_1_4).toFixed(0)}
                            </span>
                          </div>
                          <div className="border-r border-gray-200 pr-1">
                            <span className="block text-[10px] text-gray-400 font-medium">5–9 Days</span>
                            <span className="font-bold text-gray-800">
                              ₹{parseFloat(prod.rent_per_day_5_9).toFixed(0)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-gray-400 font-medium">10+ Days</span>
                            <span className="font-bold text-gray-800">
                              ₹{parseFloat(prod.rent_per_day_10_onwards).toFixed(0)}
                            </span>
                          </div>
                        </div>

                        <div className="text-[11px] text-gray-500 space-y-1">
                          <div className="flex justify-between">
                            <span>Verified Deposit / Late Fee:</span>
                            <span className="font-semibold text-gray-800">
                              ₹{parseFloat(prod.deposit_verified)} / ₹{parseFloat(prod.late_fee_verified)}/d
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Non-Verified Deposit / Late Fee:</span>
                            <span className="font-semibold text-gray-800">
                              ₹{parseFloat(prod.deposit_non_verified)} / ₹{parseFloat(prod.late_fee_non_verified)}/d
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 pt-0 border-t border-gray-100 flex items-center justify-between mt-3">
                      <span className="text-[11px] font-semibold text-emerald-700">
                        Active Rentals: {prod.active_rentals_count || 0}
                      </span>
                      <button
                        onClick={() => handleOpenEditModal(prod)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-semibold transition"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit Product
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ORDERS & RETURN INSPECTION */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-gray-800">No rental bookings yet</h3>
              <p className="text-xs text-gray-500">Customer orders for your products will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-700">
                        Order #{ord.id} (Group #{ord.group_id})
                      </span>
                      <button
                        onClick={async () => {
                          try {
                            const response = await api.get(`/user/downloadAgreement/${ord.group_id}`, {
                              responseType: 'blob',
                            });
                            const url = window.URL.createObjectURL(new Blob([response.data]));
                            const link = document.createElement('a');
                            link.href = url;
                            link.setAttribute('download', `Rental_Agreement_Group_${ord.group_id}.pdf`);
                            document.body.appendChild(link);
                            link.click();
                            link.remove();
                          } catch (err) {
                            alert('Failed to download agreement.');
                          }
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 transition ml-2"
                      >
                        📄 Agreement
                      </button>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                          ord.status === 'Lock'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : ord.status === 'With Customer'
                            ? 'bg-blue-50 text-blue-800 border border-blue-200'
                            : ord.status === 'Returned'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {ord.status}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-gray-900">{ord.product_title}</h4>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>Customer: <b>{ord.customer_name}</b></span>
                      <span>Phone: <b>{ord.customer_phone}</b></span>
                      <span>City: <b>{ord.customer_city}</b></span>
                      <span>Qty: <b>{ord.quantity} unit(s)</b></span>
                      <span>
                        Dates: {ord.start_date.split('T')[0]} → {ord.end_date.split('T')[0]}
                      </span>
                      {ord.assigned_serial_number && (
                        <span className="text-indigo-600 font-bold">
                          Asset S/N: {ord.assigned_serial_number}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                    <button
                      onClick={() => handleOpenOrderChat(ord)}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg border border-blue-200 transition flex items-center gap-1"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Chat</span>
                    </button>

                    {ord.status === 'Lock' && (
                      <>
                        <button
                          onClick={() => {
                            setHandoverModalOrder(ord);
                            setEnteredOtp('');
                            setAssetSerial('');
                          }}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Handover Equipment</span>
                        </button>

                        <button
                          onClick={() => handleCancelOrder(ord.id)}
                          disabled={orderActionLoading}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-lg border border-red-200 transition"
                        >
                          Cancel Booking
                        </button>
                      </>
                    )}

                    {ord.status === 'With Customer' && (
                      <button
                        onClick={() => {
                          setInspectingOrder(ord);
                          setProductCondition('Good');
                          setRefundMethod('razorpay_api');
                          setOfflineReference('');
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
                      >
                        Inspect & Accept Return
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PROMOTIONS & STORE COUPONS */}
      {activeTab === 'coupons' && (
        <div className="space-y-4">
          {/* Header Card */}
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Your Store Promotional Campaigns</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Create custom promo codes to boost rentals. Discounts deduct strictly from your rental gross and never touch security deposits.
              </p>
            </div>
            <button
              onClick={() => setShowCouponModal(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Create Coupon Code
            </button>
          </div>

          {/* Sub-Tab Switcher */}
          <div className="flex items-center gap-2 border-b border-gray-200 pb-2 text-xs font-bold">
            <button
              type="button"
              onClick={() => setCouponSubTab('active')}
              className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                couponSubTab === 'active'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>Active Campaigns</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  couponSubTab === 'active' ? 'bg-emerald-700 text-white' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {activeCoupons.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCouponSubTab('completed')}
              className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                couponSubTab === 'completed'
                  ? 'bg-gray-800 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>Past & Archived</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  couponSubTab === 'completed' ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {completedCoupons.length}
              </span>
            </button>
          </div>

          {/* Empty State vs Card Grid */}
          {displayedCoupons.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200 space-y-2">
              <Tag className="w-10 h-10 text-gray-300 mx-auto" />
              <h3 className="text-sm font-bold text-gray-800">
                {couponSubTab === 'active' ? 'No active store promotions' : 'No past or archived promotions'}
              </h3>
              <p className="text-xs text-gray-500">
                {couponSubTab === 'active'
                  ? 'Create discount coupons like "WEEKEND15" or "FIRST500".'
                  : 'Coupons that are expired, fully redeemed, deactivated, or archived appear here.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedCoupons.map((c) => {
                const isExpired = c.valid_until && c.valid_until.split('T')[0] < todayDateStr;
                const isMaxedOut = c.max_uses && c.used_count >= c.max_uses;

                return (
                  <div
                    key={c.id}
                    className={`bg-white p-4 rounded-xl border flex flex-col justify-between gap-3 shadow-sm ${
                      c.is_active && !c.is_archived && !isExpired && !isMaxedOut
                        ? 'border-emerald-200'
                        : 'border-gray-200 opacity-70 bg-gray-50/50'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-base text-emerald-800 tracking-wider">
                          {c.code}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            c.is_archived
                              ? 'bg-gray-200 text-gray-700'
                              : isMaxedOut
                              ? 'bg-purple-100 text-purple-800'
                              : isExpired
                              ? 'bg-rose-100 text-rose-800'
                              : c.is_active
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {c.is_archived
                            ? 'Archived'
                            : isMaxedOut
                            ? 'Fully Redeemed'
                            : isExpired
                            ? 'Expired'
                            : c.is_active
                            ? 'Active'
                            : 'Paused'}
                        </span>
                      </div>

                      <p className="text-xs font-bold text-gray-800">
                        {c.discount_type === 'FLAT'
                          ? `₹${parseFloat(c.discount_value)} Flat Discount`
                          : `${parseFloat(c.discount_value)}% Discount`}
                        {c.max_discount_amount && (
                          <span className="text-gray-500 font-normal">
                            {' '}
                            (Capped at ₹{parseFloat(c.max_discount_amount)})
                          </span>
                        )}
                      </p>

                      <div className="text-[11px] text-gray-500 space-y-0.5 pt-1 border-t border-gray-100">
                        <p>
                          • Min Duration: <b>{c.min_rental_days} day(s)</b>
                        </p>
                        <p>
                          • Min Booking Amount: <b>₹{parseFloat(c.min_order_amount)}</b>
                        </p>
                        <p>
                          • Redemptions: <b>{c.used_count}</b> / {c.max_uses || 'Unlimited'}
                        </p>
                        {c.valid_until && (
                          <p>
                            • Expiry: <b>{new Date(c.valid_until).toLocaleDateString()}</b>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      {!c.is_archived ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleToggleCoupon(c.id)}
                            className={`text-xs font-semibold px-2.5 py-1 rounded transition ${
                              c.is_active
                                ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {c.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCoupon(c.id)}
                            className="text-red-500 hover:text-red-700 p-1 rounded"
                            title="Archive coupon"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] text-gray-400 italic">Archived (Audits preserved)</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PAYMENT GATEWAY & SAAS LICENSE SETTINGS */}
      {activeTab === 'gateway' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Razorpay Key Settings Form */}
            <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-extrabold text-gray-900">Direct Razorpay Merchant Keys</h3>
                  <p className="text-xs text-gray-500">100% of rental fees & deposits land directly in this account.</p>
                </div>
              </div>

              <form onSubmit={handleSaveGateway} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Razorpay Key ID (Public Key):
                  </label>
                  <input
                    type="text"
                    required
                    value={gatewayForm.razorpay_key_id}
                    onChange={(e) => setGatewayForm({ ...gatewayForm, razorpay_key_id: e.target.value })}
                    placeholder={gatewayStatus.key_id || 'rzp_live_XXXXXXXXXXXXXX'}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Razorpay Key Secret (Encrypted at rest):
                  </label>
                  <div className="relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      required
                      value={gatewayForm.razorpay_key_secret}
                      onChange={(e) => setGatewayForm({ ...gatewayForm, razorpay_key_secret: e.target.value })}
                      placeholder="Enter new secret key to update"
                      className="w-full text-xs p-2.5 border border-gray-300 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    🔒 Secrets are stored securely using AES-256-GCM encryption and never exposed via public APIs.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={savingGateway}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-50"
                >
                  {savingGateway ? 'Encrypting & Saving...' : 'Save & Activate Direct Gateway'}
                </button>
              </form>
            </div>

            {/* Annual SaaS Licensing Details */}
            <div className="lg:col-span-5 bg-gradient-to-br from-gray-900 to-slate-800 text-white p-6 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                  <Shield className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h3 className="text-sm font-extrabold text-white">RMS Software License</h3>
                    <p className="text-[11px] text-gray-300">5% Annual Platform Royalty Agreement</p>
                  </div>
                </div>

                <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-1">
                  <span className="text-gray-400 block text-[10px] uppercase font-bold">Subscription Status</span>
                  <span
                    className={`font-extrabold text-sm ${
                      annualBillingState.pendingBill &&
                      new Date(gatewayStatus.subscription_renewal_date) <= new Date()
                        ? 'text-rose-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {annualBillingState.pendingBill &&
                    new Date(gatewayStatus.subscription_renewal_date) <= new Date()
                      ? 'License Renewal Overdue'
                      : 'Active Partner License'}
                  </span>
                </div>

                <div className="flex justify-between text-gray-300">
                  <span>Start Date:</span>
                  <span className="font-bold text-white">
                    {gatewayStatus.subscription_start_date
                      ? new Date(gatewayStatus.subscription_start_date).toLocaleDateString()
                      : 'N/A'}
                  </span>
                </div>

                <div className="flex justify-between text-gray-300">
                  <span>Anniversary Renewal Date:</span>
                  <span className="font-bold text-amber-300">
                    {gatewayStatus.subscription_renewal_date
                      ? new Date(gatewayStatus.subscription_renewal_date).toLocaleDateString()
                      : 'N/A'}
                  </span>
                </div>

                {annualBillingState.pendingBill && (
                  <div className="p-3 bg-rose-950/60 border border-rose-400/40 rounded-xl space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-rose-200">5% Platform Royalty Due:</span>
                      <span className="text-base font-black text-rose-300">
                        ₹{parseFloat(annualBillingState.pendingBill.platform_fee_due).toFixed(2)}
                      </span>
                    </div>
                    <button
                      onClick={() => handlePayAnnualBill(annualBillingState.pendingBill.id)}
                      disabled={payingBill}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition text-xs shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>{payingBill ? 'Connecting...' : 'Pay Bill via Platform Razorpay'}</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-[11px] text-emerald-200 leading-relaxed">
                • <b>0% Per-Order Commission:</b> Keep 100% of all rental fees and deposits.<br/>
                • <b>5% Annual Royalty:</b> Calculated only on your completed net rental earnings at the end of each 12-month billing period.
              </div>
            </div>
          </div>

          {/* Annual Billing Invoices History */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-600" />
              <span>Annual Licensing & Royalty Statements</span>
            </h3>

            {annualBillingState.history.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-2">
                No annual royalty billing cycles finalized yet. Statements are generated annually upon your anniversary renewal date.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-500 font-bold border-b">
                    <tr>
                      <th className="p-2.5">Billing Year</th>
                      <th className="p-2.5">Period</th>
                      <th className="p-2.5">Completed Orders</th>
                      <th className="p-2.5">Total Net Rental Earnings</th>
                      <th className="p-2.5">5% Platform Royalty</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Settlement Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {annualBillingState.history.map((b) => (
                      <tr key={b.id}>
                        <td className="p-2.5 font-bold text-gray-900">Year {b.billing_year}</td>
                        <td className="p-2.5 text-gray-600">
                          {new Date(b.period_start).toLocaleDateString()} → {new Date(b.period_end).toLocaleDateString()}
                        </td>
                        <td className="p-2.5 font-semibold text-gray-800">{b.total_orders_completed} orders</td>
                        <td className="p-2.5 font-bold text-gray-900">
                          ₹{parseFloat(b.total_net_rental_earnings).toFixed(2)}
                        </td>
                        <td className="p-2.5 font-black text-rose-600">
                          ₹{parseFloat(b.platform_fee_due).toFixed(2)}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              b.payment_status === 'PAID'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800 animate-pulse'
                            }`}
                          >
                            {b.payment_status}
                          </span>
                        </td>
                        <td className="p-2.5 text-gray-500">
                          {b.paid_at ? new Date(b.paid_at).toLocaleDateString() : 'Pending'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: MESSAGES & CHAT */}
      {activeTab === 'messages' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col lg:grid lg:grid-cols-12 min-h-[620px] max-h-[85vh]">
          {/* Left Pane: Conversation Threads */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-gray-200 flex flex-col h-64 lg:h-full bg-gray-50/50 min-w-0">
            <div className="p-3.5 border-b border-gray-200 bg-white flex-shrink-0">
              <h2 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <span>Customer Inquiries</span>
              </h2>
              <p className="text-[11px] text-gray-500 mt-0.5">Pre-booking inquiries & order coordination</p>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {conversations.length === 0 ? (
                <div className="text-center py-12 px-4 space-y-2">
                  <MessageSquare className="w-8 h-8 text-gray-300 mx-auto" />
                  <p className="text-xs font-bold text-gray-600">No messages yet</p>
                  <p className="text-[11px] text-gray-400">
                    When customers inquire about your equipment, conversations will appear here.
                  </p>
                </div>
              ) : (
                conversations.map((conv) => {
                  const isSelected = selectedConv?.id === conv.id;
                  const images = parseProductImages(conv.product_images);
                  const prodThumb = images[0] || 'https://placehold.co/100x100?text=Gear';
                  const unread = parseInt(conv.unread_vendor_count, 10) || 0;

                  return (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv)}
                      className={`p-3 cursor-pointer transition flex items-start gap-2.5 ${
                        isSelected
                          ? 'bg-emerald-50/70 border-l-4 border-emerald-600'
                          : 'hover:bg-gray-100/70'
                      }`}
                    >
                      <img
                        src={prodThumb}
                        alt="Product"
                        className="w-10 h-10 rounded-lg object-cover bg-gray-200 flex-shrink-0 border border-gray-200"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-xs font-bold text-gray-900 truncate">{conv.customer_name}</h4>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">
                            {new Date(conv.last_message_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <p className="text-[11px] font-semibold text-emerald-800 truncate">
                          {conv.product_title || 'General Equipment'}
                        </p>

                        <p className="text-[11px] text-gray-500 truncate mt-0.5">
                          {conv.last_message_text || 'Started a new inquiry...'}
                        </p>
                      </div>

                      {unread > 0 && (
                        <span className="w-5 h-5 bg-rose-500 text-white rounded-full text-[10px] font-black flex items-center justify-center flex-shrink-0">
                          {unread}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Pane: Active Chat Window */}
          <div className="lg:col-span-8 flex flex-col flex-1 min-h-[420px] lg:h-full bg-white min-w-0">
            {selectedConv ? (
              <>
                <div className="p-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg flex-shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 truncate">
                        <span className="truncate">{selectedConv.customer_name}</span>
                        {selectedConv.order_status && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[10px] font-extrabold flex-shrink-0">
                            {selectedConv.order_status}
                          </span>
                        )}
                      </h3>
                      <p className="text-[10px] text-gray-500 truncate">
                        Regarding: <b>{selectedConv.product_title}</b>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/40">
                  {chatLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-16 text-gray-400 space-y-1">
                      <Clock className="w-8 h-8 mx-auto text-gray-300" />
                      <p className="text-xs font-semibold">No messages in this conversation yet.</p>
                      <p className="text-[10px]">Send a message to respond to this customer.</p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMe = msg.sender_id === user.id;
                      return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2 text-xs shadow-sm break-words ${
                              isMe
                                ? 'bg-emerald-600 text-white rounded-br-none'
                                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
                            }`}
                          >
                            <p className="leading-relaxed whitespace-pre-wrap">{msg.message_text}</p>
                          </div>
                          <span className="text-[9px] text-gray-400 px-1 mt-0.5">
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <form
                  onSubmit={handleSendMessage}
                  className="p-2.5 border-t border-gray-200 bg-white flex items-center gap-2 flex-shrink-0"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a reply to this customer..."
                    className="flex-1 text-xs p-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || sendingMessage}
                    className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm transition disabled:opacity-50 flex items-center justify-center flex-shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2 p-8 text-center">
                <MessageSquare className="w-12 h-12 text-gray-200" />
                <h3 className="text-sm font-bold text-gray-700">No conversation selected</h3>
                <p className="text-xs text-gray-400 max-w-sm">
                  Select a customer thread from the left pane to view inquiry details and reply.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT PRODUCT */}
      {showProductModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white max-w-2xl w-full rounded-xl shadow-xl border border-gray-200 p-6 space-y-4 my-8">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold text-gray-900">
                {isEditing ? 'Edit Product Configuration' : 'List New Rental Product'}
              </h3>
              <button onClick={() => setShowProductModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Product Title</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-emerald-500"
                    placeholder="Sony Alpha A7 III Camera"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
                  <select
                    required
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-emerald-500"
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-emerald-500"
                  placeholder="Key specs, accessories included, and condition details..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Total Quantity In Stock</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formData.total_quantity}
                  onChange={(e) => setFormData({ ...formData, total_quantity: e.target.value })}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-lg focus:ring-emerald-500"
                />
              </div>

              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2">
                <span className="block text-xs font-bold text-gray-800">
                  Daily Rental Tiers (Rule: 1–4d Rate ≥ 5–9d Rate ≥ 10+d Rate)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] text-gray-500">1–4 Days (₹/day)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={1}
                      required
                      value={formData.rent_per_day_1_4}
                      onChange={(e) => setFormData({ ...formData, rent_per_day_1_4: e.target.value })}
                      className="w-full text-xs p-2 border border-gray-300 rounded bg-white"
                      placeholder="100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500">5–9 Days (₹/day)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={1}
                      required
                      value={formData.rent_per_day_5_9}
                      onChange={(e) => setFormData({ ...formData, rent_per_day_5_9: e.target.value })}
                      className="w-full text-xs p-2 border border-gray-300 rounded bg-white"
                      placeholder="80"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500">10+ Days (₹/day)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={1}
                      required
                      value={formData.rent_per_day_10_onwards}
                      onChange={(e) => setFormData({ ...formData, rent_per_day_10_onwards: e.target.value })}
                      className="w-full text-xs p-2 border border-gray-300 rounded bg-white"
                      placeholder="60"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] text-gray-600 font-medium">Verified Deposit</label>
                  <input
                    type="number"
                    step="0.01"
                    min={1}
                    required
                    value={formData.deposit_verified}
                    onChange={(e) => setFormData({ ...formData, deposit_verified: e.target.value })}
                    className="w-full text-xs p-2 border border-gray-300 rounded"
                    placeholder="2000"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-gray-600 font-medium">Non-Verified Deposit</label>
                  <input
                    type="number"
                    step="0.01"
                    min={1}
                    required
                    value={formData.deposit_non_verified}
                    onChange={(e) => setFormData({ ...formData, deposit_non_verified: e.target.value })}
                    className="w-full text-xs p-2 border border-gray-300 rounded"
                    placeholder="5000"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-600 font-medium">Verified Late Fee</label>
                  <input
                    type="number"
                    step="0.01"
                    min={1}
                    required
                    value={formData.late_fee_verified}
                    onChange={(e) => setFormData({ ...formData, late_fee_verified: e.target.value })}
                    className="w-full text-xs p-2 border border-gray-300 rounded"
                    placeholder="150"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-600 font-medium">Non-Verified Late Fee</label>
                  <input
                    type="number"
                    step="0.01"
                    min={1}
                    required
                    value={formData.late_fee_non_verified}
                    onChange={(e) => setFormData({ ...formData, late_fee_non_verified: e.target.value })}
                    className="w-full text-xs p-2 border border-gray-300 rounded"
                    placeholder="300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-gray-600 font-medium">
                  Cancellation Compensation Fee (₹/item)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={formData.cancellation_fee}
                  onChange={(e) => setFormData({ ...formData, cancellation_fee: e.target.value })}
                  className="w-full text-xs p-2 border border-gray-300 rounded focus:ring-emerald-500"
                  placeholder="e.g. 200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Product Images (Min 1, Max 6 total)
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {existingImages.map((url, idx) => (
                    <div key={`exist-${idx}`} className="relative w-16 h-16 rounded border overflow-hidden">
                      <img src={url} alt="exist" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveExistingImage(idx)}
                        className="absolute top-0 right-0 bg-red-600 text-white p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {newImageFiles.map((file, idx) => (
                    <div key={`new-${idx}`} className="relative w-16 h-16 rounded border overflow-hidden bg-blue-50 flex items-center justify-center">
                      <span className="text-[9px] text-blue-700 font-semibold truncate p-1">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveNewFile(idx)}
                        className="absolute top-0 right-0 bg-red-600 text-white p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {existingImages.length + newImageFiles.length < 6 && (
                  <input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                    onChange={handleFileChange}
                    className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                  />
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                >
                  {formSubmitting ? 'Uploading & Saving...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD CATEGORY */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-xl shadow-xl border border-gray-200 p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <h3 className="text-sm font-bold text-gray-900">Add New Category</h3>
              <button onClick={() => setShowCategoryModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddCategory} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Category Name</label>
                <input
                  type="text"
                  required
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Drones, Lighting, Audio"
                  className="w-full text-xs p-2 border border-gray-300 rounded focus:ring-emerald-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-3 py-1.5 border border-gray-300 rounded text-xs text-gray-700"
                >
                  Cancel
                </button>
                <button type="submit" className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-bold">
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE STORE PROMO COUPON */}
      {showCouponModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-xl border border-gray-200 p-6 space-y-4 my-8">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-900">Create Store Coupon</h3>
                  <p className="text-[11px] text-gray-500">Self-funded store promotional campaign</p>
                </div>
              </div>
              <button onClick={() => setShowCouponModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCoupon} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Coupon Code</label>
                  <input
                    type="text"
                    required
                    value={couponForm.code}
                    onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                    placeholder="SUMMER20"
                    className="w-full text-xs p-2 border border-gray-300 rounded-lg uppercase font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Discount Type</label>
                  <select
                    value={couponForm.discount_type}
                    onChange={(e) => setCouponForm({ ...couponForm, discount_type: e.target.value })}
                    className="w-full text-xs p-2 border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="PERCENT">Percentage (% OFF)</option>
                    <option value="FLAT">Flat Amount (₹ OFF)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    {couponForm.discount_type === 'PERCENT' ? 'Discount Rate (%)' : 'Discount Amount (₹)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={1}
                    required
                    value={couponForm.discount_value}
                    onChange={(e) => setCouponForm({ ...couponForm, discount_value: e.target.value })}
                    placeholder={couponForm.discount_type === 'PERCENT' ? '20' : '500'}
                    className="w-full text-xs p-2 border border-gray-300 rounded-lg font-bold"
                  />
                </div>

                {couponForm.discount_type === 'PERCENT' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Max Discount Cap (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={1}
                      value={couponForm.max_discount_amount}
                      onChange={(e) => setCouponForm({ ...couponForm, max_discount_amount: e.target.value })}
                      placeholder="e.g. 1500"
                      className="w-full text-xs p-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-600 font-medium">Min Rental Days</label>
                  <input
                    type="number"
                    min={1}
                    value={couponForm.min_rental_days}
                    onChange={(e) => setCouponForm({ ...couponForm, min_rental_days: e.target.value })}
                    className="w-full text-xs p-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-600 font-medium">Min Gross Rent (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={couponForm.min_order_amount}
                    onChange={(e) => setCouponForm({ ...couponForm, min_order_amount: e.target.value })}
                    className="w-full text-xs p-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-600 font-medium">Max Total Redemptions</label>
                  <input
                    type="number"
                    min={1}
                    value={couponForm.max_uses}
                    onChange={(e) => setCouponForm({ ...couponForm, max_uses: e.target.value })}
                    placeholder="Unlimited"
                    className="w-full text-xs p-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-600 font-medium">Per-Customer Limit</label>
                  <input
                    type="number"
                    min={1}
                    value={couponForm.per_user_limit}
                    onChange={(e) => setCouponForm({ ...couponForm, per_user_limit: e.target.value })}
                    className="w-full text-xs p-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-gray-600 font-medium">Expiration Date (Optional)</label>
                <input
                  type="date"
                  value={couponForm.valid_until}
                  onChange={(e) => setCouponForm({ ...couponForm, valid_until: e.target.value })}
                  className="w-full text-xs p-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowCouponModal(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCoupon}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                >
                  {savingCoupon ? 'Creating...' : 'Create Promo Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RETURN INSPECTION & DIRECT DEPOSIT SETTLEMENT */}
      {inspectingOrder && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-xl border border-gray-200 p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">
                Inspect Return: Order #{inspectingOrder.id}
              </h3>
              <button onClick={() => setInspectingOrder(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProcessReturn} className="space-y-4">
              <div className="text-xs text-gray-600 space-y-1 bg-gray-50 p-3 rounded-lg border border-gray-100">
                <p><b>Product:</b> {inspectingOrder.product_title}</p>
                <p><b>Customer:</b> {inspectingOrder.customer_name} ({inspectingOrder.customer_phone})</p>
                <p><b>Scheduled End Date:</b> {inspectingOrder.end_date.split('T')[0]}</p>
                {inspectingOrder.assigned_serial_number && (
                  <p className="text-indigo-700 font-bold">
                    <b>Assigned S/N:</b> {inspectingOrder.assigned_serial_number}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Equipment Return Condition:
                </label>
                <select
                  value={productCondition}
                  onChange={(e) => setProductCondition(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-lg bg-white font-semibold"
                >
                  <option value="Good">Good (Refund refundable security deposit to customer)</option>
                  <option value="Damaged">Damaged (Forfeit deposit to your store to cover repairs)</option>
                </select>
              </div>

              {productCondition === 'Good' && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <label className="block text-xs font-bold text-gray-700">Refund Settlement Method:</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className={`p-2.5 border rounded-lg cursor-pointer flex items-center gap-1.5 font-medium ${
                      refundMethod === 'razorpay_api'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-gray-200 text-gray-600'
                    }`}>
                      <input
                        type="radio"
                        name="refundMethod"
                        value="razorpay_api"
                        checked={refundMethod === 'razorpay_api'}
                        onChange={() => setRefundMethod('razorpay_api')}
                        className="text-emerald-600"
                      />
                      <span>Razorpay API Refund</span>
                    </label>

                    <label className={`p-2.5 border rounded-lg cursor-pointer flex items-center gap-1.5 font-medium ${
                      refundMethod === 'offline'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-gray-200 text-gray-600'
                    }`}>
                      <input
                        type="radio"
                        name="refundMethod"
                        value="offline"
                        checked={refundMethod === 'offline'}
                        onChange={() => setRefundMethod('offline')}
                        className="text-emerald-600"
                      />
                      <span>Cash / Direct UPI</span>
                    </label>
                  </div>

                  {refundMethod === 'offline' && (
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Bank UTR / Cash Receipt Reference:
                      </label>
                      <input
                        type="text"
                        required
                        value={offlineReference}
                        onChange={(e) => setOfflineReference(e.target.value)}
                        placeholder="e.g. UPI-UTR-428190219"
                        className="w-full text-xs p-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setInspectingOrder(null)}
                  className="px-4 py-2 border border-gray-300 rounded text-xs text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={orderActionLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold disabled:opacity-50"
                >
                  {orderActionLoading ? 'Settling Return...' : 'Confirm Return & Settle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VERIFY HANDOVER OTP & OPTIONAL ASSET TAG */}
      {handoverModalOrder && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-2xl shadow-xl border border-gray-100 p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-900">Verify Handover</h3>
                  <p className="text-[11px] text-gray-500">Order #{handoverModalOrder.id}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setHandoverModalOrder(null);
                  setAssetSerial('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVerifyOtpSubmit} className="space-y-3">
              <div className="p-2.5 bg-gray-50 rounded-xl text-xs text-gray-600 space-y-1 border border-gray-100">
                <p><b>Product:</b> {handoverModalOrder.product_title}</p>
                <p><b>Customer:</b> {handoverModalOrder.customer_name}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Customer 6-Digit PIN:
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={enteredOtp}
                  onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full text-center tracking-widest font-mono text-xl py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Equipment Serial / Asset Tag: <span className="text-[10px] font-normal text-gray-400">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={assetSerial}
                  onChange={(e) => setAssetSerial(e.target.value)}
                  placeholder="e.g. SN-A7M3-90412 or TAG-04"
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-xl uppercase font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <span className="text-[10px] text-gray-400 block mt-0.5">
                  Optional for serialized gear (cameras, electronics). Leave blank for non-serialized items.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setHandoverModalOrder(null);
                    setAssetSerial('');
                  }}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={enteredOtp.length !== 6 || verifyingOtp}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50"
                >
                  {verifyingOtp ? 'Verifying...' : 'Confirm Handover'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorDashboard;