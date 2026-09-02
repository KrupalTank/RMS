// src/pages/admin/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import api from '../../api/axiosInstance';
import { loadRazorpayScript } from '../../utils/loadRazorpay';
import { io } from 'socket.io-client';

import {
  LayoutDashboard,
  Users,
  Store,
  ShieldCheck,
  CreditCard,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Ban,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  X,
  ExternalLink,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  DollarSign,
  Tag,
} from 'lucide-react';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');

  const [selectedPayoutIds, setSelectedPayoutIds] = useState([]);
  const [isClearingModalOpen, setIsClearingModalOpen] = useState(false);
  const [clearingStage, setClearingStage] = useState(0); // 0: Idle, 1: Validating, 2: Routing, 3: Completed
  const [clearingSummary, setClearingSummary] = useState(null);

  // Data states
  const [stats, setStats] = useState(null);
  const [categorizedOrders, setCategorizedOrders] = useState([]);
  const [selectedOrderCategory, setSelectedOrderCategory] = useState('with_customer');
  const [vendors, setVendors] = useState([]);
  const [selectedVendorProducts, setSelectedVendorProducts] = useState(null);
  const [delinquentUsers, setDelinquentUsers] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [pendingPayouts, setPendingPayouts] = useState([]);

  // Transaction Ledger State
  const [ledgerData, setLedgerData] = useState({ summary: {}, incomingTransactions: [], outgoingPayouts: [] });
  const [ledgerFilter, setLedgerFilter] = useState('all');

  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState({ success: '', error: '' });

  // Modal & Action States
  const [showAddOfficerModal, setShowAddOfficerModal] = useState(false);
  const [newOfficer, setNewOfficer] = useState({ full_name: '', email: '', phone: '', password: '' });
  const [actionLoading, setActionLoading] = useState(false);
  const [payingPayoutId, setPayingPayoutId] = useState(null);

  // 1. Fetch Stats & Overview
  const fetchOverview = async () => {
    try {
      const res = await api.get('/admin/dashboardStats');
      if (res.data.success) {
        setStats(res.data.stats);
      }
    } catch (err) {
      setBanner({ success: '', error: err.response?.data?.message || 'Failed to load stats.' });
    }
  };

  // 2. Fetch Categorized Orders
  const fetchCategorizedOrders = async (cat) => {
    try {
      const res = await api.get(`/admin/ordersByCategory?category=${cat}`);
      if (res.data.success) {
        setCategorizedOrders(res.data.orders);
      }
    } catch (err) {
      setBanner({ success: '', error: 'Failed to fetch categorized orders.' });
    }
  };

  // 3. Fetch Vendors
  const fetchVendors = async () => {
    try {
      const res = await api.get('/admin/vendors');
      if (res.data.success) setVendors(res.data.vendors);
    } catch (err) {
      console.error(err);
    }
  };

  // 4. Fetch Delinquent Users
  const fetchDelinquent = async () => {
    try {
      const res = await api.get('/admin/delinquentUsers');
      if (res.data.success) setDelinquentUsers(res.data.users);
    } catch (err) {
      console.error(err);
    }
  };

  // 5. Fetch Officers
  const fetchOfficers = async () => {
    try {
      const res = await api.get('/admin/officers');
      if (res.data.success) setOfficers(res.data.officers);
    } catch (err) {
      console.error(err);
    }
  };

  // 6. Fetch Pending Payouts
  const fetchPayouts = async () => {
    try {
      const res = await api.get('/admin/pendingPayouts');
      if (res.data.success) setPendingPayouts(res.data.payouts);
    } catch (err) {
      console.error(err);
    }
  };

  // 7. Fetch Transaction Ledger
  const fetchLedger = async () => {
    try {
      const res = await api.get('/admin/transactionLedger');
      if (res.data.success) {
        setLedgerData({
          summary: res.data.summary || {},
          incomingTransactions: res.data.incomingTransactions || [],
          outgoingPayouts: res.data.outgoingPayouts || [],
        });
      }
    } catch (err) {
      console.error('Ledger fetch error:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([
        fetchOverview(),
        fetchCategorizedOrders(selectedOrderCategory),
        fetchVendors(),
        fetchDelinquent(),
        fetchOfficers(),
        fetchPayouts(),
        fetchLedger(),
      ]);
      setLoading(false);
    };
    init();

    const socket = io('http://localhost:5000', { withCredentials: true });

    socket.on('USER_REGISTERED', (data) => {
      fetchOverview();
      if (data.role === 'vendor') fetchVendors();
    });

    socket.on('KYC_SUBMITTED', () => fetchOverview());
    socket.on('PAYOUT_GENERATED', () => {
      fetchOverview();
      fetchPayouts();
      fetchLedger();
    });
    socket.on('ORDER_STATUS_CHANGED', () => {
      fetchOverview();
      fetchCategorizedOrders(selectedOrderCategory);
      fetchLedger();
    });
    socket.on('ORDER_LOCKED', () => {
      fetchOverview();
      fetchCategorizedOrders(selectedOrderCategory);
      fetchLedger();
    });

    return () => socket.disconnect();
  }, [selectedOrderCategory]);

 
  // 2. Synchronize selected IDs whenever pending payouts load:
  useEffect(() => {
    if (pendingPayouts.length > 0) {
      // By default, select all payouts
      setSelectedPayoutIds(pendingPayouts.map((p) => p.id));
    } else {
      setSelectedPayoutIds([]);
    }
  }, [pendingPayouts]);

  // 3. Selection Handlers:
  const handleToggleSelectAll = () => {
    if (selectedPayoutIds.length === pendingPayouts.length) {
      setSelectedPayoutIds([]);
    } else {
      setSelectedPayoutIds(pendingPayouts.map((p) => p.id));
    }
  };

  const handleToggleSelectPayout = (id) => {
    setSelectedPayoutIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id]
    );
  };

  // 4. Batch Disbursement Trigger with Simulation Steps:
  // Batch Disbursement Trigger (Supports both single-row click and bulk selection)
  const handleTriggerBatchDisbursal = async (targetIds = null) => {
    // Determine whether this run is for an individual payout or the bulk-selected list
    const idsToProcess = Array.isArray(targetIds) ? targetIds : selectedPayoutIds;

    if (!idsToProcess || idsToProcess.length === 0) {
      alert('Please select at least one payout to disburse.');
      return;
    }

    setIsClearingModalOpen(true);
    setClearingStage(1); // Stage 1: Validating bank credentials

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setClearingStage(2); // Stage 2: Connecting to IMPS clearing rails

      const res = await api.post('/admin/batchBankingPayouts', {
        payout_ids: idsToProcess,
      });

      await new Promise((resolve) => setTimeout(resolve, 1200));

      if (res.data.success) {
        setClearingStage(3); // Stage 3: UTR generated & verified
        setClearingSummary(res.data);
        setBanner({ success: res.data.message, error: '' });
        fetchPayouts();
        fetchOverview();
        fetchLedger();
      }
    } catch (err) {
      setIsClearingModalOpen(false);
      setBanner({
        success: '',
        error: err.response?.data?.message || 'Failed to process settlement.',
      });
    }
  };

  const handlePardonUser = async (user) => {
    const reason = window.prompt(
      `Grant a 1-chance loyalty pardon to ${user.full_name}?\n\nThis will reset their ${user.late_returns_count} active violation(s) to 0, log an audit record, and unfreeze their streak (${user.consecutive_good_returns || 0}/8).\n\nOptional note/reason:`,
      'Admin granted 1-time loyalty amnesty'
    );

    if (reason === null) return; // Admin clicked Cancel

    try {
      const res = await api.post('/admin/pardonDelinquentUser', {
        userId: user.id,
        reason: reason.trim() || 'Admin granted 1-time loyalty amnesty',
      });

      if (res.data.success) {
        setBanner({ success: res.data.message, error: '' });
        fetchDelinquent();
      }
    } catch (err) {
      setBanner({
        success: '',
        error: err.response?.data?.message || 'Failed to pardon customer.',
      });
    }
  };

  const handleTriggerLostCheck = async () => {
    setActionLoading(true);
    try {
      const res = await api.post('/admin/triggerLostOrdersCheck');
      if (res.data.success) {
        setBanner({ success: res.data.message, error: '' });
        fetchOverview();
        fetchCategorizedOrders(selectedOrderCategory);
      }
    } catch (err) {
      setBanner({ success: '', error: err.response?.data?.message || 'Check failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleBlock = async (userId, currentStatus) => {
    try {
      const res = await api.post('/admin/toggleBlockUser', {
        userId,
        is_blocked: !currentStatus,
      });
      if (res.data.success) {
        setBanner({ success: res.data.message, error: '' });
        fetchDelinquent();
        fetchVendors();
      }
    } catch (err) {
      setBanner({ success: '', error: 'Failed to update user block status.' });
    }
  };

  const handleViewVendorProducts = async (vendorId) => {
    try {
      const res = await api.get(`/admin/vendorProducts/${vendorId}`);
      if (res.data.success) setSelectedVendorProducts(res.data.products);
    } catch (err) {
      alert('Failed to fetch vendor products.');
    }
  };

  const handleDeleteProduct = async (prodId) => {
    if (!window.confirm('Force delist this product by setting stock quantity to 0?')) return;
    try {
      const res = await api.delete(`/admin/product/${prodId}`);
      if (res.data.success) {
        alert(res.data.message);
        setSelectedVendorProducts((prev) => prev.filter((p) => p.id !== prodId));
      }
    } catch (err) {
      alert('Failed to delist product.');
    }
  };

  const handleAddOfficer = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/addOfficer', newOfficer);
      if (res.data.success) {
        setBanner({ success: 'KYC Officer added successfully.', error: '' });
        setShowAddOfficerModal(false);
        setNewOfficer({ full_name: '', email: '', phone: '', password: '' });
        fetchOfficers();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create officer.');
    }
  };

  const handleRemoveOfficer = async (officerId) => {
    if (!window.confirm('Revoke access for this KYC Officer?')) return;
    try {
      const res = await api.delete(`/admin/removeOfficer/${officerId}`);
      if (res.data.success) {
        setBanner({ success: res.data.message, error: '' });
        fetchOfficers();
      }
    } catch (err) {
      alert('Failed to remove officer.');
    }
  };

  const handleApproveAndPay = async (payout) => {
    setBanner({ success: '', error: '' });
    setPayingPayoutId(payout.id);

    try {
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded || !window.Razorpay) {
        throw new Error('Razorpay SDK failed to load.');
      }

      const orderRes = await api.post('/admin/createPayoutOrder', { payout_id: payout.id });
      if (!orderRes.data.success) {
        throw new Error(orderRes.data.message || 'Failed to initialize payout order.');
      }

      const { key_id, razorpay_order_id, amount, currency } = orderRes.data;

      const options = {
        key: key_id || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: amount,
        currency: currency || 'INR',
        name: 'RMS Settlement Disbursal',
        description: `Disbursal for Payout #${payout.id} to ${payout.recipient_name}`,
        order_id: razorpay_order_id,
        prefill: {
          name: payout.recipient_name || '',
          email: payout.recipient_email || '',
          contact: payout.recipient_phone || '9999999999',
        },
        theme: { color: '#E11D48' },
        handler: async function (response) {
          try {
            const verifyRes = await api.post('/admin/recordPayoutReference', {
              payout_id: payout.id,
              gateway_reference_id: response.razorpay_payment_id,
            });

            if (verifyRes.data.success) {
              setBanner({
                success: `Payout #${payout.id} (₹${payout.amount}) disbursed and verified successfully!`,
                error: '',
              });
              fetchPayouts();
              fetchOverview();
              fetchLedger();
            }
          } catch (verifyErr) {
            setBanner({
              success: '',
              error: verifyErr.response?.data?.message || 'Payment completed but backend verification failed.',
            });
          } finally {
            setPayingPayoutId(null);
          }
        },
        modal: {
          ondismiss: function () {
            setPayingPayoutId(null);
          },
        },
      };

      const razorpayInstance = new window.Razorpay(options);
      razorpayInstance.open();
    } catch (err) {
      setBanner({
        success: '',
        error: err.response?.data?.message || err.message || 'Failed to initiate payout.',
      });
      setPayingPayoutId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <RefreshCw className="w-8 h-8 text-rose-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-rose-600" />
            <span>Administrator Control Suite</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            System overview, inventory oversight, financial reconciliation, and platform commission ledger.
          </p>
        </div>

        <button
          onClick={handleTriggerLostCheck}
          disabled={actionLoading}
          className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-50"
        >
          <Clock className="w-4 h-4" />
          <span>{actionLoading ? 'Scanning...' : 'Run Overdue Orders Check'}</span>
        </button>
      </div>

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

      {/* Tabs */}
      <div className="flex border-b border-gray-200 space-x-6 overflow-x-auto text-xs font-bold pb-1">
        {[
          { id: 'overview', label: 'Platform Stats' },
          { id: 'orders', label: 'Categorized Orders' },
          { id: 'ledger', label: 'Transaction Ledger' },
          { id: 'vendors', label: 'Vendor Directory' },
          { id: 'delinquent', label: 'Delinquent Risk' },
          { id: 'officers', label: 'KYC Officers' },
          { id: 'payouts', label: `Pending Payouts (${pendingPayouts.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-2.5 transition whitespace-nowrap border-b-2 ${
              activeTab === tab.id
                ? 'border-rose-600 text-rose-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Active Rentals */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase">Active Rentals</span>
              <p className="text-2xl font-black text-blue-600">{stats.activeRentalsCount}</p>
              <span className="text-[11px] text-gray-500">Currently with customers</span>
            </div>

            {/* 2. Platform Commission Revenue (NEW) */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Platform Commission (10%)
              </span>
              <p className="text-2xl font-black text-emerald-600">
                ₹{parseFloat(stats.totalPlatformCommission || 0).toFixed(2)}
              </p>
              <span className="text-[11px] text-gray-500">Net platform revenue earned</span>
            </div>

            {/* 3. Loyalty Discounts Financed (NEW) */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-purple-600" /> Loyalty Discounts Absorbed
              </span>
              <p className="text-2xl font-black text-purple-600">
                ₹{parseFloat(stats.totalDiscountsAbsorbed || 0).toFixed(2)}
              </p>
              <span className="text-[11px] text-gray-500">
                {stats.activeCouponsCount || 0} active coupon card(s) in circulation
              </span>
            </div>

            {/* 4. Total Settled Outflows */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase">Total Settled Outflows</span>
              <p className="text-2xl font-black text-indigo-600">
                ₹{parseFloat(stats.totalDisbursedAmount || 0).toFixed(2)}
              </p>
              <span className="text-[11px] text-gray-500">Disbursed to vendors & customer refunds</span>
            </div>

            {/* 5. Pending KYC */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase">Pending KYC Reviews</span>
              <p className="text-2xl font-black text-amber-500">{stats.pendingKycCount}</p>
              <span className="text-[11px] text-gray-500">Awaiting officer verification</span>
            </div>

            {/* 6. Unpaid Settlements */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase">Unpaid Settlements</span>
              <p className="text-2xl font-black text-rose-600">{pendingPayouts.length}</p>
              <span className="text-[11px] text-gray-500">Awaiting admin transfer approval</span>
            </div>
          </div>

          {/* User Role Distribution */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-gray-800">User Role Distribution</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              {stats.usersByRole.map((u) => (
                <div key={u.role} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <span className="text-xs text-gray-500 font-semibold uppercase">{u.role}</span>
                  <p className="text-lg font-bold text-gray-900 mt-1">{u.count}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CATEGORIZED ORDERS */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex gap-2 text-xs font-semibold overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'All Orders' },
              { id: 'with_customer', label: 'Active with Customer' },
              { id: 'returned_on_time', label: 'Returned On Time' },
              { id: 'returned_late', label: 'Returned Late (Within Grace)' },
              { id: 'overdue_active', label: 'Currently Overdue' },
              { id: 'lost', label: 'Lost / Forfeited' },
              { id: 'cancelled', label: 'Cancelled Bookings' },
            ].map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedOrderCategory(c.id);
                  fetchCategorizedOrders(c.id);
                }}
                className={`px-3 py-1.5 rounded-full transition whitespace-nowrap ${
                  selectedOrderCategory === c.id
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-bold">
                <tr>
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Vendor</th>
                  <th className="p-3">Financials (Rent / Discount)</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {categorizedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400">
                      No orders found in this category.
                    </td>
                  </tr>
                ) : (
                  categorizedOrders.map((o) => {
                    const discount = parseFloat(o.discount_amount_snapshot || 0);
                    return (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="p-3 font-bold text-gray-800">#{o.id}</td>
                        <td className="p-3 font-medium text-gray-900">{o.product_title}</td>
                        <td className="p-3">
                          <span className="block font-semibold text-gray-800">{o.customer_name}</span>
                          <span className="text-[10px] text-gray-400">{o.customer_phone}</span>
                        </td>
                        <td className="p-3">
                          <span className="block font-semibold text-gray-800">{o.vendor_name}</span>
                          <span className="text-[10px] text-gray-400">{o.vendor_phone}</span>
                        </td>
                        <td className="p-3 text-gray-600">
                          <span>Gross: ₹{parseFloat(o.gross_rent_snapshot || o.rent_per_day_snapshot || 0).toFixed(2)}</span>
                          {discount > 0 && (
                            <span className="block text-[10px] text-emerald-600 font-bold">
                              Loyalty Discount: -₹{discount.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-bold text-rose-700">{o.status}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: TRANSACTION LEDGER */}
      {activeTab === 'ledger' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" /> Gross Inflow Collections
              </span>
              <p className="text-2xl font-black text-emerald-600">
                ₹{parseFloat(ledgerData.summary.totalGrossCollected || 0).toFixed(2)}
              </p>
              <span className="text-[11px] text-gray-500">Total customer Razorpay deposits</span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" /> Settled Outflows
              </span>
              <p className="text-2xl font-black text-blue-600">
                ₹{parseFloat(ledgerData.summary.totalDisbursedSettled || 0).toFixed(2)}
              </p>
              <span className="text-[11px] text-gray-500">Transferred via bank payouts</span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-500" /> Pending Outflows
              </span>
              <p className="text-2xl font-black text-amber-500">
                ₹{parseFloat(ledgerData.summary.totalPendingDisbursal || 0).toFixed(2)}
              </p>
              <span className="text-[11px] text-gray-500">Awaiting admin transfer approval</span>
            </div>

            {/* Card 4 in Transaction Ledger */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5 text-purple-600" /> Platform Retained Balance
              </span>
              <p className="text-2xl font-black text-purple-600">
                ₹{parseFloat(ledgerData.summary.netEscrowRetained || 0).toFixed(2)}
              </p>
              <span className="text-[11px] text-gray-500">
                Commission earnings + Active Escrow 
              </span>
            </div>
          </div>

          <div className="flex gap-2 text-xs font-semibold overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'All Transactions' },
              { id: 'inflow', label: 'Inflows (Customer Collections)' },
              { id: 'outflow_settled', label: 'Settled Outflows' },
              { id: 'outflow_pending', label: 'Pending Outflows' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setLedgerFilter(f.id)}
                className={`px-3 py-1.5 rounded-full transition whitespace-nowrap ${
                  ledgerFilter === f.id
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-bold">
                <tr>
                  <th className="p-3">Type</th>
                  <th className="p-3">Reference / ID</th>
                  <th className="p-3">Party / Beneficiary</th>
                  <th className="p-3">Breakdown / Description</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(ledgerFilter === 'all' || ledgerFilter === 'inflow') &&
                  ledgerData.incomingTransactions.map((inflow) => (
                    <tr key={`inflow-${inflow.group_id}`} className="hover:bg-emerald-50/40">
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                          <ArrowDownLeft className="w-3 h-3" /> INFLOW
                        </span>
                      </td>
                      <td className="p-3 font-bold text-gray-900">Group #{inflow.group_id}</td>
                      <td className="p-3">
                        <span className="font-semibold text-gray-800 block">{inflow.customer_name}</span>
                        <span className="text-[10px] text-gray-400">{inflow.customer_email}</span>
                      </td>
                      <td className="p-3 text-gray-600">
                        <span>Rent: ₹{parseFloat(inflow.total_rent).toFixed(2)}</span> | 
                        <span> Escrow: ₹{parseFloat(inflow.total_escrow_deposit).toFixed(2)}</span>
                        <span className="block text-[10px] text-gray-400">({inflow.total_sub_orders} items)</span>
                      </td>
                      <td className="p-3 font-black text-emerald-600">
                        +₹{parseFloat(inflow.gross_amount).toFixed(2)}
                      </td>
                      <td className="p-3 font-bold text-emerald-700">Captured</td>
                      <td className="p-3 text-gray-500">
                        {new Date(inflow.transaction_date).toLocaleDateString('en-IN')}
                      </td>
                    </tr>
                  ))}

                {ledgerData.outgoingPayouts
                  .filter((p) => {
                    if (ledgerFilter === 'all') return true;
                    if (ledgerFilter === 'outflow_settled') return !!p.gateway_reference_id;
                    if (ledgerFilter === 'outflow_pending') return !p.gateway_reference_id;
                    return false;
                  })
                  .map((payout) => (
                    <tr key={`outflow-${payout.payout_id}`} className="hover:bg-rose-50/40">
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800">
                          <ArrowUpRight className="w-3 h-3" /> OUTFLOW
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-gray-900 block">Payout #{payout.payout_id}</span>
                        <span className="text-[10px] text-gray-400">Order #{payout.order_id}</span>
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-gray-800 block">{payout.recipient_name}</span>
                        <span className="text-[10px] text-gray-400 capitalize">{payout.recipient_role}</span>
                      </td>
                      <td className="p-3 text-gray-600">
                        <span className="font-semibold text-gray-800">{payout.type.replace(/_/g, ' ').toUpperCase()}</span>
                        <span className="block text-[10px] text-gray-400 truncate max-w-xs">{payout.product_title}</span>
                      </td>
                      <td className="p-3 font-black text-rose-600">
                        -₹{parseFloat(payout.amount).toFixed(2)}
                      </td>
                      <td className="p-3 font-bold">
                        {payout.gateway_reference_id ? (
                          <span className="text-emerald-700">Settled ({payout.gateway_reference_id})</span>
                        ) : (
                          <span className="text-amber-600">Pending Approval</span>
                        )}
                      </td>
                      <td className="p-3 text-gray-500">
                        {new Date(payout.processed_at).toLocaleDateString('en-IN')}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: VENDORS */}
      {activeTab === 'vendors' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-bold">
                <tr>
                  <th className="p-3">Vendor</th>
                  <th className="p-3">Contact</th>
                  <th className="p-3">Location</th>
                  <th className="p-3">Products</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="p-3 font-bold text-gray-900">{v.full_name}</td>
                    <td className="p-3">
                      <span className="block text-gray-800">{v.email}</span>
                      <span className="text-[10px] text-gray-400">{v.phone}</span>
                    </td>
                    <td className="p-3 text-gray-600">{v.city || 'N/A'}</td>
                    <td className="p-3 font-semibold text-blue-600">{v.total_products} items</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        v.is_blocked ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {v.is_blocked ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => handleViewVendorProducts(v.id)}
                        className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded font-semibold text-gray-700"
                      >
                        View Items
                      </button>
                      <button
                        onClick={() => handleToggleBlock(v.id, v.is_blocked)}
                        className={`px-2.5 py-1 rounded font-semibold text-white ${
                          v.is_blocked ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                        }`}
                      >
                        {v.is_blocked ? 'Unblock' : 'Block'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedVendorProducts && (
            <div className="bg-white p-5 rounded-xl border border-gray-200 space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="text-sm font-bold text-gray-900">Vendor Catalog Items</h3>
                <button onClick={() => setSelectedVendorProducts(null)} className="text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {selectedVendorProducts.map((p) => (
                  <div key={p.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs space-y-2">
                    <h4 className="font-bold text-gray-800 truncate">{p.title}</h4>
                    <p className="text-[11px] text-gray-500">Stock: {p.total_quantity} units</p>
                    <button
                      onClick={() => handleDeleteProduct(p.id)}
                      className="w-full py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded font-bold transition"
                    >
                      Force Delist (Qty $\rightarrow$ 0)
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: DELINQUENT */}
      {activeTab === 'delinquent' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-bold">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Late Return Violations</th>
                <th className="p-3">Loyalty Streak</th>
                <th className="p-3">Account Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {delinquentUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    No delinquent or pardoned accounts recorded.
                  </td>
                </tr>
              ) : (
                delinquentUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <span className="font-bold text-gray-900 block">{u.full_name}</span>
                      <span className="text-[10px] text-gray-400">{u.email}</span>
                      <span className="text-[10px] text-gray-400 block">{u.phone}</span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2.5 py-1 rounded-full font-extrabold text-xs inline-block ${
                          u.late_returns_count > 0
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {u.late_returns_count} active violation(s)
                      </span>
                      {u.total_pardoned_violations > 0 && (
                        <span className="block text-[10px] text-gray-500 mt-1">
                          ({u.total_pardoned_violations} pardoned across {u.pardon_count} instance(s))
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="font-bold text-indigo-700 text-xs">
                        {u.consecutive_good_returns || 0} / 8
                      </span>
                      <span className="block text-[10px] text-gray-400">
                        {u.late_returns_count > 0 ? 'Status: Paused ⏸️' : 'Status: Active ▶️'}
                      </span>
                    </td>
                    <td className="p-3 font-semibold">
                      {u.is_blocked ? (
                        <span className="text-red-600 font-bold">Access Blocked</span>
                      ) : (
                        <span className="text-emerald-600 font-bold">Active</span>
                      )}
                    </td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      {u.late_returns_count > 0 && (
                        <button
                          onClick={() => handlePardonUser(u)}
                          className="px-3 py-1.5 rounded font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-xs transition"
                          title="Reset active violations to 0 & resume paused streak"
                        >
                          Grant 1-Chance Pardon
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleBlock(u.id, u.is_blocked)}
                        className={`px-3 py-1.5 rounded font-bold text-white text-xs transition ${
                          u.is_blocked ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                        }`}
                      >
                        {u.is_blocked ? 'Unblock' : 'Block'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      
      {/* TAB 6: OFFICERS */}
      {activeTab === 'officers' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddOfficerModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
            >
              <Plus className="w-4 h-4" /> Add KYC Officer
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-bold">
                <tr>
                  <th className="p-3">Officer Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {officers.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="p-3 font-bold text-gray-900">{o.full_name}</td>
                    <td className="p-3 text-gray-600">{o.email}</td>
                    <td className="p-3 text-gray-600">{o.phone}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleRemoveOfficer(o.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        title="Remove Officer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 7: PAYOUTS */}
      {activeTab === 'payouts' && (
        <div className="space-y-4">
          {/* Batch Controls Bar */}
          {pendingPayouts.length > 0 && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-emerald-950 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  <span>Automated Treasury Clearing Console (IMPS Rails)</span>
                </h3>
                <p className="text-xs text-emerald-800 mt-0.5">
                  <b>{selectedPayoutIds.length}</b> of <b>{pendingPayouts.length}</b> payout(s) selected for bulk disbursement (Total: ₹
                  {pendingPayouts
                    .filter((p) => selectedPayoutIds.includes(p.id))
                    .reduce((acc, p) => acc + parseFloat(p.amount || 0), 0)
                    .toFixed(2)}
                  ).
                </p>
              </div>

              <button
                onClick={handleTriggerBatchDisbursal}
                disabled={selectedPayoutIds.length === 0 || actionLoading}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black shadow-sm transition flex items-center gap-2 disabled:opacity-50"
              >
                <span>⚡ Disburse Selected ({selectedPayoutIds.length}) via IMPS</span>
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-bold">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        pendingPayouts.length > 0 &&
                        selectedPayoutIds.length === pendingPayouts.length
                      }
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 cursor-pointer"
                      title="Select / Deselect All"
                    />
                  </th>
                  <th className="p-3">Payout ID</th>
                  <th className="p-3">Recipient</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Bank Details</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingPayouts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">
                      No pending payouts awaiting settlement.
                    </td>
                  </tr>
                ) : (
                  pendingPayouts.map((p) => {
                    const isSelected = selectedPayoutIds.includes(p.id);
                    return (
                      <tr
                        key={p.id}
                        className={`transition ${isSelected ? 'bg-emerald-50/30' : 'hover:bg-gray-50'}`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectPayout(p.id)}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-bold text-gray-800">#{p.id}</td>
                        <td className="p-3 font-bold text-gray-900">{p.recipient_name}</td>
                        <td className="p-3 font-black text-emerald-600 text-sm">
                          ₹{parseFloat(p.amount).toFixed(2)}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-semibold text-[10px] uppercase">
                            {p.type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="p-3 text-[11px] text-gray-500">
                          Ac: <b>{p.bank_account_no || 'N/A'}</b> | IFSC: <b>{p.bank_ifsc || 'N/A'}</b>
                        </td>
                        <td className="p-3 text-right">

                          <button
                            onClick={() => handleTriggerBatchDisbursal([p.id])}
                            className="px-3 py-1 bg-gray-100 hover:bg-emerald-50 hover:text-emerald-700 rounded font-bold text-xs text-gray-700 transition"
                          >
                            Disburse Now
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: ADD KYC OFFICER */}
      {showAddOfficerModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-xl p-6 space-y-4 shadow-xl border">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-sm font-bold text-gray-900">Add Compliance Officer</h3>
              <button onClick={() => setShowAddOfficerModal(false)} className="text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddOfficer} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newOfficer.full_name}
                  onChange={(e) => setNewOfficer({ ...newOfficer, full_name: e.target.value })}
                  className="w-full text-xs p-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={newOfficer.email}
                  onChange={(e) => setNewOfficer({ ...newOfficer, email: e.target.value })}
                  className="w-full text-xs p-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  required
                  value={newOfficer.phone}
                  onChange={(e) => setNewOfficer({ ...newOfficer, phone: e.target.value })}
                  className="w-full text-xs p-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newOfficer.password}
                  onChange={(e) => setNewOfficer({ ...newOfficer, password: e.target.value })}
                  className="w-full text-xs p-2 border rounded"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddOfficerModal(false)}
                  className="px-3 py-1.5 border rounded text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 bg-purple-600 text-white rounded text-xs font-bold">
                  Create Officer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SIMULATED BANKING CLEARING CONSOLE */}
      {isClearingModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-2xl p-6 space-y-5 shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-900">
                    National Automated Clearing House (NACH / IMPS)
                  </h3>
                  <p className="text-[11px] text-gray-500">Simulated Banking Outflow Railway</p>
                </div>
              </div>
              {clearingStage === 3 && (
                <button
                  onClick={() => {
                    setIsClearingModalOpen(false);
                    setClearingStage(0);
                    setClearingSummary(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Progress Stages */}
            <div className="space-y-3">
              <div
                className={`flex items-center gap-3 p-3 rounded-lg border text-xs ${
                  clearingStage >= 1
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900 font-medium'
                    : 'bg-gray-50 border-gray-100 text-gray-400'
                }`}
              >
                {clearingStage === 1 ? (
                  <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                )}
                <span>Step 1: Validating recipient bank accounts and RBI IFSC routing directory...</span>
              </div>

              <div
                className={`flex items-center gap-3 p-3 rounded-lg border text-xs ${
                  clearingStage >= 2
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900 font-medium'
                    : 'bg-gray-50 border-gray-100 text-gray-400'
                }`}
              >
                {clearingStage === 2 ? (
                  <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin flex-shrink-0" />
                ) : clearingStage > 2 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
                <span>Step 2: Connecting to IMPS clearing network & reserving escrow funds...</span>
              </div>

              <div
                className={`flex items-center gap-3 p-3 rounded-lg border text-xs ${
                  clearingStage === 3
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900 font-medium'
                    : 'bg-gray-50 border-gray-100 text-gray-400'
                }`}
              >
                {clearingStage === 3 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
                <span>Step 3: Unique 12-digit Indian Banking UTRs generated and settlement receipts queued.</span>
              </div>
            </div>

            {/* Settlement Summary when complete */}
            {clearingStage === 3 && clearingSummary && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 text-xs">
                <div className="flex justify-between font-bold text-gray-900">
                  <span>Settlement Result:</span>
                  <span className="text-emerald-600">SUCCESSFUL (IMPS-P2A)</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Total Payouts Settled:</span>
                  <span className="font-bold text-gray-900">{clearingSummary.count}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Total Disbursed:</span>
                  <span className="font-bold text-emerald-600 text-sm">
                    ₹{parseFloat(clearingSummary.total_amount || 0).toFixed(2)}
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 pt-1 border-t border-gray-200">
                  * Official settlement slips with RBI bank UTRs have been dispatched asynchronously to all beneficiaries.
                </p>

                <button
                  onClick={() => {
                    setIsClearingModalOpen(false);
                    setClearingStage(0);
                    setClearingSummary(null);
                  }}
                  className="w-full mt-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-sm transition"
                >
                  Done & Return to Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;