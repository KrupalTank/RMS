// src/pages/admin/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import api from '../../api/axiosInstance';
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
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  DollarSign,
  Tag,
  Shield,
  FileSpreadsheet,
} from 'lucide-react';

const AdminDashboard = () => {
  // 'overview' | 'orders' | 'annual_billing' | 'ledger' | 'vendors' | 'delinquent' | 'officers'
  const [activeTab, setActiveTab] = useState('overview');

  // Data states
  const [stats, setStats] = useState(null);
  const [categorizedOrders, setCategorizedOrders] = useState([]);
  const [selectedOrderCategory, setSelectedOrderCategory] = useState('with_customer');
  const [vendors, setVendors] = useState([]);
  const [selectedVendorProducts, setSelectedVendorProducts] = useState(null);
  const [delinquentUsers, setDelinquentUsers] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [annualBillingLedger, setAnnualBillingLedger] = useState([]);

  // Transaction Ledger State
  const [ledgerData, setLedgerData] = useState({
    summary: {},
    inflowTransactions: [],
    outflowRefunds: [],
  });
  const [ledgerFilter, setLedgerFilter] = useState('all'); // 'all' | 'inflow' | 'outflow'
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState({ success: '', error: '' });

  // Modal & Action States
  const [showAddOfficerModal, setShowAddOfficerModal] = useState(false);
  const [newOfficer, setNewOfficer] = useState({ full_name: '', email: '', phone: '', password: '' });
  const [actionLoading, setActionLoading] = useState(false);
  const [licenseAuditLoading, setLicenseAuditLoading] = useState(false);

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

  // 6. Fetch Annual SaaS Licensing Ledger (5% Platform Royalties)
  const fetchAnnualBilling = async () => {
    try {
      const res = await api.get('/admin/annualBillingAudit');
      if (res.data.success) setAnnualBillingLedger(res.data.billingLedger);
    } catch (err) {
      console.error('Annual billing fetch error:', err);
    }
  };

  // 7. Fetch Transaction Ledger
  const fetchLedger = async () => {
    try {
      const res = await api.get('/admin/transactionLedger');
      if (res.data.success) {
        setLedgerData({
          summary: res.data.summary || {},
          inflowTransactions: res.data.inflowTransactions || [],
          outflowRefunds: res.data.outflowRefunds || [],
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
        fetchAnnualBilling(),
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
    socket.on('ORDER_STATUS_CHANGED', () => {
      fetchOverview();
      fetchCategorizedOrders(selectedOrderCategory);
      fetchAnnualBilling();
      fetchLedger();
    });
    socket.on('ORDER_LOCKED', () => {
      fetchOverview();
      fetchCategorizedOrders(selectedOrderCategory);
      fetchLedger();
    });

    return () => socket.disconnect();
  }, [selectedOrderCategory]);

  const handlePardonUser = async (u) => {
    const reason = window.prompt(
      `Grant a 1-chance pardon to ${u.full_name}?\n\nThis will reset their ${u.late_returns_count} active violation(s) to 0 and log an administrative audit entry.\n\nReason for pardon:`,
      'Admin granted customer amnesty'
    );

    if (reason === null) return;

    try {
      const res = await api.post('/admin/pardonDelinquentUser', {
        userId: u.id,
        reason: reason.trim() || 'Admin granted customer amnesty',
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

  // Manual Trigger: License Expiry Audit (Generates pending 5% annual bills)
  const handleTriggerLicenseExpiryCheck = async () => {
    setLicenseAuditLoading(true);
    try {
      const res = await api.post('/admin/triggerLicenseExpiryCheck');
      if (res.data.success) {
        setBanner({ success: res.data.message, error: '' });
        await Promise.all([fetchAnnualBilling(), fetchOverview(), fetchVendors()]);
      }
    } catch (err) {
      setBanner({ success: '', error: err.response?.data?.message || 'License audit failed.' });
    } finally {
      setLicenseAuditLoading(false);
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
            <span>Platform Administration</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Oversee tenant vendors, audit 5% annual platform royalties, monitor transactions, and manage compliance.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleTriggerLicenseExpiryCheck}
            disabled={licenseAuditLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-50"
            title="Scan vendors whose renewal date has arrived and generate pending 5% annual royalty bills"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{licenseAuditLoading ? 'Auditing...' : 'Run License Expiry Audit'}</span>
          </button>

          <button
            onClick={handleTriggerLostCheck}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-50"
          >
            <Clock className="w-4 h-4" />
            <span>{actionLoading ? 'Scanning...' : 'Run Overdue Orders Check'}</span>
          </button>
        </div>
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
          { id: 'annual_billing', label: 'Annual 5% Royalties' },
          { id: 'ledger', label: 'Transactions Audit' },
          { id: 'vendors', label: 'Vendor Directory' },
          { id: 'delinquent', label: 'Delinquent Risk' },
          { id: 'officers', label: 'KYC Officers' },
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase">Gross Rental GMV</span>
              <p className="text-2xl font-black text-emerald-600">
                ₹{parseFloat(stats.totalCustomerRentPaid || 0).toFixed(2)}
              </p>
              <span className="text-[11px] text-gray-500">Transacted directly on vendor accounts</span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-blue-600" /> 5% SaaS Royalties Due
              </span>
              <p className="text-2xl font-black text-blue-600">
                ₹{parseFloat(stats.totalPlatformRoyaltiesDue || 0).toFixed(2)}
              </p>
              <span className="text-[11px] text-gray-500">Accrued across active billing cycles</span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> Royalties Collected
              </span>
              <p className="text-2xl font-black text-indigo-600">
                ₹{parseFloat(stats.totalRoyaltiesCollected || 0).toFixed(2)}
              </p>
              <span className="text-[11px] text-gray-500">Paid by vendors upon renewal</span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase">Active Rentals</span>
              <p className="text-2xl font-black text-rose-600">{stats.activeRentalsCount}</p>
              <span className="text-[11px] text-gray-500">Currently with customers</span>
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
                  <th className="p-3">Direct Net Rent</th>
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
                  categorizedOrders.map((o) => (
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
                      <td className="p-3 text-emerald-700 font-bold">
                        ₹{parseFloat(o.customer_paid_rent_snapshot || 0).toFixed(2)}
                      </td>
                      <td className="p-3 font-bold text-rose-700">{o.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ANNUAL 5% ROYALTIES AUDIT */}
      {activeTab === 'annual_billing' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Vendor SaaS Licensing Audit</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                5% platform royalty fee calculated annually on each vendor's cumulative net rental earnings.
              </p>
            </div>
            <button
              onClick={fetchAnnualBilling}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-lg"
              title="Refresh Billing Ledger"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-bold">
                <tr>
                  <th className="p-3">Vendor</th>
                  <th className="p-3">Billing Cycle</th>
                  <th className="p-3">Completed Orders</th>
                  <th className="p-3">Total Net Rent Earned</th>
                  <th className="p-3">5% Royalty Due</th>
                  <th className="p-3">Payment Status</th>
                  <th className="p-3 text-right">Settlement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {annualBillingLedger.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">
                      No annual billing records generated yet. Records update automatically as rentals complete.
                    </td>
                  </tr>
                ) : (
                  annualBillingLedger.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="p-3 font-bold text-gray-900">
                        <span>{b.vendor_name}</span>
                        <span className="block text-[10px] text-gray-400 font-normal">{b.vendor_email}</span>
                      </td>
                      <td className="p-3 text-gray-600">
                        {new Date(b.period_start).toLocaleDateString()} → {new Date(b.period_end).toLocaleDateString()}
                      </td>
                      <td className="p-3 font-bold text-gray-800">{b.total_orders_completed} orders</td>
                      <td className="p-3 font-bold text-emerald-700">
                        ₹{parseFloat(b.total_net_rental_earnings).toFixed(2)}
                      </td>
                      <td className="p-3 font-black text-rose-600 text-sm">
                        ₹{parseFloat(b.platform_fee_due).toFixed(2)}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            b.payment_status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {b.payment_status}
                        </span>
                      </td>
                      {/* AFTER: Automated Ledger Record */}
                      <td className="p-3 text-right">
                        {b.payment_status === 'PAID' ? (
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 inline-block">
                            Paid on {b.paid_at ? new Date(b.paid_at).toLocaleDateString() : 'Settled'}
                          </span>
                        ) : b.payment_status === 'PENDING' ? (
                          <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-200 inline-block">
                            Awaiting Vendor Payment
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">
                            Accumulating ({new Date(b.period_end).toLocaleDateString()})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: TRANSACTIONS AUDIT */}
      {activeTab === 'ledger' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" /> Gross Inflow Volume
              </span>
              <p className="text-2xl font-black text-emerald-600">
                ₹{parseFloat(ledgerData.summary.totalGrossVolumeTransacted || 0).toFixed(2)}
              </p>
              <span className="text-[11px] text-gray-500">Rent + Deposits paid to vendors</span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-blue-600" /> Net Rental Earnings
              </span>
              <p className="text-2xl font-black text-blue-600">
                ₹{parseFloat(ledgerData.summary.totalNetRentalRevenue || 0).toFixed(2)}
              </p>
              <span className="text-[11px] text-gray-500">Subject to 5% platform royalty</span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" /> Deposits Refunded
              </span>
              <p className="text-2xl font-black text-rose-600">
                ₹{parseFloat(ledgerData.summary.totalSecurityDepositsRefunded || 0).toFixed(2)}
              </p>
              <span className="text-[11px] text-gray-500">Settled back to customers</span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-purple-600" /> Store Discounts
              </span>
              <p className="text-2xl font-black text-purple-600">
                ₹{parseFloat(ledgerData.summary.totalVendorDiscountsGiven || 0).toFixed(2)}
              </p>
              <span className="text-[11px] text-gray-500">Promotions absorbed by stores</span>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex gap-2 text-xs font-semibold overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'All Operations' },
              { id: 'inflow', label: `Customer Inflows (${ledgerData.inflowTransactions.length})` },
              { id: 'outflow', label: `Deposit Refunds (${ledgerData.outflowRefunds.length})` },
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
                  <th className="p-3">ID / Reference</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Store / Vendor</th>
                  <th className="p-3">Description / Breakdown</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* INFLOW ROWS */}
                {(ledgerFilter === 'all' || ledgerFilter === 'inflow') &&
                  ledgerData.inflowTransactions.map((t) => (
                    <tr key={`inflow-${t.group_id}`} className="hover:bg-emerald-50/30">
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                          <ArrowDownLeft className="w-3 h-3" /> INFLOW
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-gray-900 block">Group #{t.group_id}</span>
                        <span className="font-mono text-[10px] text-gray-400">
                          {t.payment_reference || 'N/A'}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-gray-800">{t.customer_name}</td>
                      <td className="p-3 font-semibold text-gray-800">{t.vendor_name}</td>
                      <td className="p-3 text-gray-600">
                        <span>Net Rent: ₹{parseFloat(t.total_net_rent).toFixed(2)}</span> | 
                        <span> Deposit: ₹{parseFloat(t.total_security_deposit).toFixed(2)}</span>
                        {parseFloat(t.total_vendor_discount) > 0 && (
                          <span className="block text-[10px] text-emerald-600">
                            Discount: -₹{parseFloat(t.total_vendor_discount).toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-black text-emerald-600">
                        +₹{parseFloat(t.gross_amount).toFixed(2)}
                      </td>
                      <td className="p-3 font-bold text-emerald-700">Captured</td>
                      <td className="p-3 text-gray-500">
                        {new Date(t.transaction_date).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}

                {/* OUTFLOW ROWS */}
                {(ledgerFilter === 'all' || ledgerFilter === 'outflow') &&
                  ledgerData.outflowRefunds.map((o) => (
                    <tr key={`outflow-${o.order_id}`} className="hover:bg-rose-50/30">
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800">
                          <ArrowUpRight className="w-3 h-3" /> OUTFLOW
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-gray-900 block">Order #{o.order_id}</span>
                        <span className="font-mono text-[10px] text-gray-500">
                          Ref: {o.payment_reference || 'MANUAL_SETTLED'}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-gray-800">{o.customer_name}</td>
                      <td className="p-3 font-semibold text-gray-800">{o.vendor_name}</td>
                      <td className="p-3 text-gray-600">
                        <span>Deposit Refund for <b>{o.product_title}</b></span>
                        <span className="block text-[10px] text-gray-400">
                          Original Deposit: ₹{parseFloat(o.original_deposit).toFixed(2)} ({o.product_condition} Condition)
                        </span>
                      </td>
                      <td className="p-3 font-black text-rose-600">
                        -₹{parseFloat(o.refund_amount).toFixed(2)}
                      </td>
                      <td className="p-3 font-bold text-rose-700">
                        {parseFloat(o.refund_amount) > 0 ? 'Refunded' : 'Forfeited'}
                      </td>
                      <td className="p-3 text-gray-500">
                        {o.transaction_date ? new Date(o.transaction_date).toLocaleDateString() : 'Recent'}
                      </td>
                    </tr>
                  ))}

                {ledgerData.inflowTransactions.length === 0 && ledgerData.outflowRefunds.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-gray-400">
                      No transaction operations logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: VENDORS */}
      {activeTab === 'vendors' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-bold">
                <tr>
                  <th className="p-3">Vendor</th>
                  <th className="p-3">Gateway Status</th>
                  <th className="p-3">Subscription Renewal</th>
                  <th className="p-3">Catalog</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="p-3 font-bold text-gray-900">
                      <span>{v.full_name}</span>
                      <span className="block text-[10px] text-gray-400 font-normal">{v.email} • {v.city}</span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          v.has_payment_gateway
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {v.has_payment_gateway ? 'Configured' : 'Keys Missing'}
                      </span>
                    </td>
                    <td className="p-3 text-gray-600">
                      {v.subscription_renewal_date
                        ? new Date(v.subscription_renewal_date).toLocaleDateString()
                        : 'N/A'}
                    </td>
                    <td className="p-3 font-semibold text-blue-600">{v.total_products} items</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          v.is_blocked ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
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
                      Force Delist (Stock $\rightarrow$ 0)
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: DELINQUENT RISK */}
      {activeTab === 'delinquent' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-bold">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Late Return Violations</th>
                <th className="p-3">Account Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {delinquentUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-400">
                    No delinquent customer violations recorded.
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
                          title="Reset active violations to 0"
                        >
                          Pardon Violations
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

      {/* TAB 7: KYC OFFICERS */}
      {activeTab === 'officers' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddOfficerModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
            >
              <Plus className="w-4 h-4" /> Add Compliance Officer
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
    </div>
  );
};

export default AdminDashboard;