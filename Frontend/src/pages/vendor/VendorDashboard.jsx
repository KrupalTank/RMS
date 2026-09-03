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
} from 'lucide-react';

const VendorDashboard = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory' | 'orders' | 'messages'

  // Data states
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState({ success: '', error: '' });

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
  const [orderActionLoading, setOrderActionLoading] = useState(false);

  // Socket & Auto-scroll Refs
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 1. Fetch initial vendor inventory and orders[cite: 7]
  const fetchData = async () => {
    setLoading(true);
    setBanner({ success: '', error: '' });
    try {
      const [prodRes, catRes, ordRes] = await Promise.all([
        api.get('/vendor/getProducts'),
        api.get('/vendor/getCategories'),
        api.get('/vendor/getOrders'),
      ]);

      if (prodRes.data.success) setProducts(prodRes.data.products);
      if (catRes.data.success) setCategories(catRes.data.categories);
      if (ordRes.data.success) setOrders(ordRes.data.orders);
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
        // Reset unread count locally in list
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
      // Option A: Instantly update order state in-place
      setOrders((prevOrders) =>
        prevOrders.map((o) =>
          o.id === data.orderId ? { ...o, status: data.newStatus } : o
        )
      );
      // Option B: Also call fetchData() to sync counts if needed
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

  // 2. Open Add Product Modal[cite: 7]
  const handleOpenAddModal = () => {
    setIsEditing(false);
    setEditingProductId(null);
    setFormData(initialFormState);
    setExistingImages([]);
    setNewImageFiles([]);
    setShowProductModal(true);
  };

  // 3. Open Edit Product Modal[cite: 7]
  const handleOpenEditModal = (product) => {
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

  // 4. Handle Image File Selection (Max 6 total)[cite: 7]
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
      alert(`You can only have up to 6 images in total. ${availableSlots} slot(s) remaining.`);
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

  // 5. Submit Add / Edit Product[cite: 7]
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

  // 6. Create Category[cite: 7]
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

  // 7. Order Status Management (Cancel / Return Inspection)[cite: 7]
  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to cancel this booking before delivery?')) return;
    setOrderActionLoading(true);
    try {
      const res = await api.post('/vendor/changeOrderStatus', {
        order_id: orderId,
        status: 'Cancelled',
      });
      if (res.data.success) {
        setBanner({ success: 'Order cancelled.', error: '' });
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
      const res = await api.post('/vendor/changeOrderStatus', {
        order_id: inspectingOrder.id,
        status: 'Returned',
        product_condition: productCondition,
      });

      if (res.data.success) {
        setBanner({
          success: `Return confirmed (${productCondition} condition). Automatic escrow settlement applied.`,
          error: '',
        });
        setInspectingOrder(null);
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header[cite: 7] */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
            <Store className="w-6 h-6 text-emerald-600" />
            <span>Vendor Management Portal</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Manage your rental catalog, configure duration tier rates, coordinate logistics, and inspect returns[cite: 7].
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

      {/* Status Notifications[cite: 7] */}
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

      {/* Tabs Switcher[cite: 7] */}
      <div className="flex border-b border-gray-200 space-x-8">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'inventory'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>My Inventory ({products.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'orders'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Rental Orders & Returns ({orders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('messages')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'messages'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Customer Inquiries & Messages</span>
          {totalUnreadMessages > 0 && (
            <span className="bg-rose-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
              {totalUnreadMessages}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: INVENTORY & PRODUCTS[cite: 7] */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          {products.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200 space-y-3">
              <Layers className="w-12 h-12 text-gray-300 mx-auto" />
              <h3 className="text-sm font-bold text-gray-800">No products in your catalog</h3>
              <p className="text-xs text-gray-500">Add equipment and list items for rent[cite: 7].</p>
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
                        <img
                          src={primaryImg}
                          alt={prod.title}
                          className="w-full h-full object-cover"
                        />
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
                            <span className="font-bold text-gray-800">₹{parseFloat(prod.rent_per_day_1_4).toFixed(0)}</span>
                          </div>
                          <div className="border-r border-gray-200 pr-1">
                            <span className="block text-[10px] text-gray-400 font-medium">5–9 Days</span>
                            <span className="font-bold text-gray-800">₹{parseFloat(prod.rent_per_day_5_9).toFixed(0)}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-gray-400 font-medium">10+ Days</span>
                            <span className="font-bold text-gray-800">₹{parseFloat(prod.rent_per_day_10_onwards).toFixed(0)}</span>
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

      {/* TAB 2: ORDERS & RETURN INSPECTION[cite: 7] */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-gray-800">No rental bookings yet</h3>
              <p className="text-xs text-gray-500">Customer orders for your products will appear here[cite: 7].</p>
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
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                        ord.status === 'Lock'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : ord.status === 'With Customer'
                          ? 'bg-blue-50 text-blue-800 border border-blue-200'
                          : ord.status === 'Returned'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
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
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                    {/* Direct Chat with Customer */}
                    <button
                      onClick={() => handleOpenOrderChat(ord)}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg border border-blue-200 transition flex items-center gap-1"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Chat</span>
                    </button>

                    {ord.status === 'Lock' && (
                      <button
                        onClick={() => handleCancelOrder(ord.id)}
                        disabled={orderActionLoading}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-lg border border-red-200 transition"
                      >
                        Cancel Booking
                      </button>
                    )}

                    {ord.status === 'With Customer' && (
                      <button
                        onClick={() => setInspectingOrder(ord)}
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

      {/* TAB 3: TWO-PANE INBOX & MESSAGES (Fully Responsive & Scrollable) */}
      {activeTab === 'messages' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col lg:grid lg:grid-cols-12 min-h-[620px] max-h-[85vh]">
          {/* Left Pane: Conversation Threads */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-gray-200 flex flex-col h-64 lg:h-full bg-gray-50/50 min-w-0">
            <div className="p-3.5 border-b border-gray-200 bg-white flex-shrink-0">
              <h2 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <span>Customer Inquiries</span>
              </h2>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Pre-booking inquiries & order coordination
              </p>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {conversations.length === 0 ? (
                <div className="text-center py-12 px-4 space-y-2">
                  <MessageSquare className="w-8 h-8 text-gray-300 mx-auto" />
                  <p className="text-xs font-bold text-gray-600">No messages yet</p>
                  <p className="text-[11px] text-gray-400">
                    When customers ask about your products, their messages will appear here.
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
                          <h4 className="text-xs font-bold text-gray-900 truncate">
                            {conv.customer_name}
                          </h4>
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
                {/* Chat Header */}
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

                  {/* Disintermediation Guard Notice */}
                  <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 flex-shrink-0">
                    <Shield className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Contact masking active</span>
                  </div>
                </div>

                {/* Message Stream (Scrollable Y) */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/40">
                  {chatLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-16 text-gray-400 space-y-1">
                      <Clock className="w-8 h-8 mx-auto text-gray-300" />
                      <p className="text-xs font-semibold">No messages in this conversation yet.</p>
                      <p className="text-[10px]">
                        Send a message to respond to this customer's inquiry.
                      </p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMe = msg.sender_id === user.id;

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2 text-xs shadow-sm break-words ${
                              isMe
                                ? 'bg-emerald-600 text-white rounded-br-none'
                                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
                            }`}
                          >
                            <p className="leading-relaxed whitespace-pre-wrap">
                              {msg.message_text}
                            </p>
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

                {/* Chat Input Bar */}
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

      {/* MODAL: ADD / EDIT PRODUCT[cite: 7] */}
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
                  Cancellation Fee (₹/item)
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
                <span className="text-[10px] text-gray-400">Deducted from customer deposit if cancelled[cite: 7]</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Product Images (Min 1, Max 6 total)[cite: 7]
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

      {/* MODAL: ADD CATEGORY[cite: 7] */}
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
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-bold"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RETURN INSPECTION & SETTLEMENT[cite: 7] */}
      {inspectingOrder && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-xl shadow-xl border border-gray-200 p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">
                Inspect Return: Order #{inspectingOrder.id}
              </h3>
              <button onClick={() => setInspectingOrder(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProcessReturn} className="space-y-4">
              <div className="text-xs text-gray-600 space-y-1 bg-gray-50 p-3 rounded-lg">
                <p><b>Product:</b> {inspectingOrder.product_title}</p>
                <p><b>Customer:</b> {inspectingOrder.customer_name} ({inspectingOrder.customer_phone})</p>
                <p><b>Scheduled End Date:</b> {inspectingOrder.end_date.split('T')[0]}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Product Returned Condition:
                </label>
                <select
                  value={productCondition}
                  onChange={(e) => setProductCondition(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-lg bg-white font-semibold"
                >
                  <option value="Good">Good (Full escrow deposit returned to customer)</option>
                  <option value="Damaged">Damaged (Escrow deposit forfeited to you for repairs)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
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
                  {orderActionLoading ? 'Processing Settlement...' : 'Confirm Return & Settle'}
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