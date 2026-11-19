import React, { useCallback, useEffect, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FolderPlus,
  Loader2,
  LogOut,
  MapPin,
  Package,
  PauseCircle,
  Phone,
  PlayCircle,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  Truck,
} from 'lucide-react';
import {
  ApiError,
  bootstrapAdmin,
  clearAdminToken,
  createAdminCategory,
  createAdminProduct,
  createAdminZone,
  deleteAdminCategory,
  deleteAdminProduct,
  deleteAdminZone,
  fetchAdminDashboard,
  fetchAdminStatus,
  loginAdmin,
  logoutAdmin,
  toggleAdminProduct,
  updateAdminCategory,
  updateAdminOrderStatus,
  updateAdminProduct,
  updateAdminSettings,
  updateAdminZone,
  uploadProductImage,
} from '../services/api';
import {
  AdminDashboardData,
  AdminProfile,
  Category,
  DeliveryZone,
  OrderStatus,
  Product,
  StoreSettings,
} from '../types/catalog';

interface AdminDashboardViewProps {
  onCatalogOrSettingsChanged: () => void;
}

type AdminSection = 'orders' | 'products' | 'categories' | 'delivery';

const UNIT_PRESETS = ['كيلو', 'نصف كيلو', 'قطعة', 'عبوة', 'كيس', 'لتر', 'زجاجة', 'علبة'];

const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  new: 'طلب جديد',
  preparing: 'قيد التجهيز',
  out_for_delivery: 'خرج للتوصيل',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  onCatalogOrSettingsChanged,
}) => {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [hasAdmin, setHasAdmin] = useState(true);
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [section, setSection] = useState<AdminSection>('orders');
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [loadingDash, setLoadingDash] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Product Form State
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [pName, setPName] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [pPrice, setPPrice] = useState('');
  const [pOldPrice, setPOldPrice] = useState('');
  const [pUnit, setPUnit] = useState('كيلو');
  const [pCategoryId, setPCategoryId] = useState('vegetables');
  const [pStock, setPStock] = useState('10');
  const [pImage, setPImage] = useState('');
  const [pIsActive, setPIsActive] = useState(true);
  const [pBestSeller, setPBestSeller] = useState(false);
  const [pNewArrival, setPNewArrival] = useState(true);
  const [pDailyDeal, setPDailyDeal] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  // Category Form State
  const [newCatName, setNewCatName] = useState('');
  const [newCatSubtitle, setNewCatSubtitle] = useState('');
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  // Zone Form State
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneFee, setNewZoneFee] = useState('20');
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);

  // Settings State
  const [settingsForm, setSettingsForm] = useState<StoreSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const handleAuthFailure = useCallback((err: unknown): boolean => {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      clearAdminToken();
      setAdmin(null);
      setDashboard(null);
      setActionNotice(null);
      setActionError(null);
      setAuthError(err.message);
      return true;
    }
    return false;
  }, []);

  const applyDashboardData = useCallback((data: AdminDashboardData) => {
    setDashboard(data);
    setSettingsForm(data.settings);
    setPCategoryId((prev) =>
      data.categories.length > 0 && !data.categories.some((c) => c.id === prev)
        ? data.categories[0].id
        : prev,
    );
  }, []);

  const loadDashboard = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setLoadingDash(true);
        setActionError(null);
      }
      try {
        const data = await fetchAdminDashboard();
        applyDashboardData(data);
      } catch (err) {
        if (!handleAuthFailure(err)) {
          setActionError(err instanceof Error ? err.message : 'تعذر تحميل بيانات لوحة التحكم');
        }
      } finally {
        if (!opts?.silent) {
          setLoadingDash(false);
        }
      }
    },
    [applyDashboardData, handleAuthFailure],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await fetchAdminStatus();
        if (cancelled) return;
        setHasAdmin(st.hasAdmin);
        if (st.admin) {
          // Verify actual server dashboard access BEFORE entering dashboard state
          const dashData = await fetchAdminDashboard();
          if (cancelled) return;
          applyDashboardData(dashData);
          setAdmin(st.admin);
        } else {
          clearAdminToken();
          setAdmin(null);
        }
      } catch (err) {
        if (cancelled) return;
        clearAdminToken();
        setAdmin(null);
        setDashboard(null);
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setAuthError(err.message);
        } else {
          setAuthError(err instanceof Error ? err.message : 'تعذر التحقق من حالة الإدارة');
        }
      } finally {
        if (!cancelled) setCheckingAuth(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyDashboardData]);

  // Real-time multi-device sync for Admin (new orders, stock changes, etc.)
  useEffect(() => {
    if (!admin) return;
    const evtSource = new EventSource('/api/stream');
    evtSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string };
        if (
          msg.type === 'orders_updated' ||
          msg.type === 'catalog_updated' ||
          msg.type === 'settings_updated'
        ) {
          loadDashboard({ silent: true });
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => evtSource.close();
  }, [admin, loadDashboard]);

  const handleAdminAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setActionError(null);
    setActionNotice(null);
    setAuthBusy(true);
    try {
      const res = hasAdmin
        ? await loginAdmin({ email: authEmail.trim(), password: authPassword })
        : await bootstrapAdmin({
            name: authName.trim(),
            email: authEmail.trim(),
            password: authPassword,
          });
      // CRITICAL: Verify protected dashboard permissions on the server BEFORE showing success or opening dashboard
      const dashData = await fetchAdminDashboard();
      applyDashboardData(dashData);
      setHasAdmin(true);
      setAuthPassword('');
      setAdmin(res.admin);
      setActionNotice('تم تسجيل الدخول والتحقق من صلاحيات المدير الرئيسي بنجاح');
    } catch (err) {
      clearAdminToken();
      setAdmin(null);
      setDashboard(null);
      setActionNotice(null);
      setAuthError(err instanceof Error ? err.message : 'فشل تسجيل الدخول');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    await logoutAdmin();
    setAdmin(null);
    setDashboard(null);
    setActionNotice(null);
    setActionError(null);
    setAuthError(null);
  };

  const resetProductForm = () => {
    setEditingProductId(null);
    setPName('');
    setPDesc('');
    setPPrice('');
    setPOldPrice('');
    setPUnit('كيلو');
    setPCategoryId(dashboard?.categories[0]?.id || 'vegetables');
    setPStock('10');
    setPImage('');
    setPIsActive(true);
    setPBestSeller(false);
    setPNewArrival(true);
    setPDailyDeal(false);
  };

  const startEditProduct = (prod: Product) => {
    setEditingProductId(prod.id);
    setPName(prod.name);
    setPDesc(prod.shortDescription);
    setPPrice(String(prod.priceEgp));
    setPOldPrice(prod.oldPriceEgp ? String(prod.oldPriceEgp) : '');
    setPUnit(prod.unit);
    setPCategoryId(prod.categoryId);
    setPStock(String(prod.stockQuantity));
    setPImage(prod.image);
    setPIsActive(prod.isActive);
    setPBestSeller(Boolean(prod.isBestSeller));
    setPNewArrival(Boolean(prod.isNewArrival));
    setPDailyDeal(Boolean(prod.isDailyDeal));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    setActionError(null);
    try {
      const { imageUrl } = await uploadProductImage(file);
      setPImage(imageUrl);
      setActionNotice('تم رفع صورة المنتج بنجاح');
    } catch (err) {
      if (!handleAuthFailure(err)) {
        setActionError(err instanceof Error ? err.message : 'فشل رفع الصورة');
      }
    } finally {
      setUploadingImg(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionNotice(null);
    const priceNum = Number(pPrice);
    const oldNum = pOldPrice.trim() ? Number(pOldPrice) : null;
    const stockNum = Number(pStock);

    if (!pName.trim() || !Number.isFinite(priceNum) || priceNum <= 0) {
      setActionError('يرجى إدخال اسم المنتج وسعر صالح أكبر من صفر.');
      return;
    }

    setSavingProduct(true);
    try {
      const payload = {
        name: pName.trim(),
        shortDescription: pDesc.trim(),
        priceEgp: priceNum,
        oldPriceEgp: oldNum && Number.isFinite(oldNum) ? oldNum : null,
        unit: pUnit.trim() || 'قطعة',
        categoryId: pCategoryId,
        image: pImage.trim(),
        stockQuantity: Number.isFinite(stockNum) ? Math.max(0, Math.floor(stockNum)) : 0,
        isActive: pIsActive,
        isBestSeller: pBestSeller,
        isNewArrival: pNewArrival,
        isDailyDeal: pDailyDeal,
      };

      if (editingProductId) {
        await updateAdminProduct(editingProductId, payload);
        setActionNotice('تم تحديث المنتج وحفظه للعملاء بنجاح');
      } else {
        await createAdminProduct(payload);
        setActionNotice('تمت إضافة المنتج الجديد ونشره للعملاء');
      }

      resetProductForm();
      await loadDashboard();
      onCatalogOrSettingsChanged();
    } catch (err) {
      if (!handleAuthFailure(err)) {
        setActionError(err instanceof Error ? err.message : 'تعذر حفظ المنتج');
      }
    } finally {
      setSavingProduct(false);
    }
  };

  const handleToggleProduct = async (id: string) => {
    setActionError(null);
    try {
      await toggleAdminProduct(id);
      await loadDashboard();
      onCatalogOrSettingsChanged();
    } catch (err) {
      if (!handleAuthFailure(err)) {
        setActionError(err instanceof Error ? err.message : 'تعذر تغيير حالة المنتج');
      }
    }
  };

  const handleDeleteProduct = async (id: string) => {
    setActionError(null);
    try {
      await deleteAdminProduct(id);
      if (editingProductId === id) resetProductForm();
      await loadDashboard();
      onCatalogOrSettingsChanged();
    } catch (err) {
      if (!handleAuthFailure(err)) {
        setActionError(err instanceof Error ? err.message : 'تعذر حذف المنتج');
      }
    }
  };

  const handleOrderStatusChange = async (orderId: string, status: OrderStatus) => {
    setActionError(null);
    setActionNotice(null);
    try {
      await updateAdminOrderStatus(orderId, status);
      setActionNotice(`تم تحديث حالة الطلب إلى: ${ORDER_STATUS_TEXT[status]}`);
      await loadDashboard();
      onCatalogOrSettingsChanged();
    } catch (err) {
      if (!handleAuthFailure(err)) {
        setActionError(err instanceof Error ? err.message : 'تعذر تحديث حالة الطلب');
      }
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setActionError(null);
    try {
      await createAdminCategory({
        name: newCatName.trim(),
        subtitle: newCatSubtitle.trim() || 'منتجات مختارة',
        iconKey: 'basket',
      });
      setNewCatName('');
      setNewCatSubtitle('');
      await loadDashboard();
      onCatalogOrSettingsChanged();
    } catch (err) {
      if (!handleAuthFailure(err)) {
        setActionError(err instanceof Error ? err.message : 'تعذر إضافة القسم');
      }
    }
  };

  const handleSaveCategoryEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCat) return;
    try {
      await updateAdminCategory(editingCat.id, {
        name: editingCat.name,
        subtitle: editingCat.subtitle,
        isActive: editingCat.isActive,
      });
      setEditingCat(null);
      await loadDashboard();
      onCatalogOrSettingsChanged();
    } catch (err) {
      if (!handleAuthFailure(err)) {
        setActionError(err instanceof Error ? err.message : 'تعذر تعديل القسم');
      }
    }
  };

  const handleAddZone = async (e: React.FormEvent) => {
    e.preventDefault();
    const fee = Number(newZoneFee);
    if (!newZoneName.trim() || !Number.isFinite(fee) || fee < 0) return;
    setActionError(null);
    try {
      await createAdminZone({ name: newZoneName.trim(), deliveryFee: fee });
      setNewZoneName('');
      setNewZoneFee('20');
      await loadDashboard();
      onCatalogOrSettingsChanged();
    } catch (err) {
      if (!handleAuthFailure(err)) {
        setActionError(err instanceof Error ? err.message : 'تعذر إضافة المنطقة');
      }
    }
  };

  const handleSaveZoneEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingZone) return;
    try {
      await updateAdminZone(editingZone.id, {
        name: editingZone.name,
        deliveryFee: editingZone.deliveryFee,
        isActive: editingZone.isActive,
      });
      setEditingZone(null);
      await loadDashboard();
      onCatalogOrSettingsChanged();
    } catch (err) {
      if (!handleAuthFailure(err)) {
        setActionError(err instanceof Error ? err.message : 'تعذر تعديل المنطقة');
      }
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;
    setSavingSettings(true);
    setActionError(null);
    setActionNotice(null);
    try {
      await updateAdminSettings(settingsForm);
      setActionNotice('تم حفظ إعدادات السوبر ماركت بنجاح');
      await loadDashboard();
      onCatalogOrSettingsChanged();
    } catch (err) {
      if (!handleAuthFailure(err)) {
        setActionError(err instanceof Error ? err.message : 'تعذر حفظ الإعدادات');
      }
    } finally {
      setSavingSettings(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-[#15803D] animate-spin mx-auto" />
        <p className="text-sm text-[#4A6353]">جاري التحقق من جلسة الإدارة...</p>
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="max-w-md mx-auto pb-8">
        <div className="bg-white rounded-3xl border border-[#DCE6DE] p-6 md:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#15803D] text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#0F2417]">
                {hasAdmin ? 'تسجيل دخول مدير السوبر ماركت' : 'تفعيل حساب المدير الرئيسي'}
              </h1>
              <p className="text-xs text-[#4A6353] mt-0.5">
                {hasAdmin
                  ? 'أدخل بريدك الإلكتروني وكلمة المرور لإدارة المنتجات والطلبات'
                  : 'إعداد لمرة واحدة فقط لإنشاء حساب مالك السوبر ماركت الرئيسي بأمان'}
              </p>
            </div>
          </div>

          <form onSubmit={handleAdminAuth} className="space-y-4">
            {!hasAdmin && (
              <div>
                <label htmlFor="adm-name" className="block text-xs font-bold text-[#0F2417] mb-1">
                  اسم المدير
                </label>
                <input
                  id="adm-name"
                  type="text"
                  required
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  placeholder="مثال: الحاج محمد / إدارة أسواق الواحة"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm"
                />
              </div>
            )}

            <div>
              <label htmlFor="adm-email" className="block text-xs font-bold text-[#0F2417] mb-1">
                البريد الإلكتروني للمدير
              </label>
              <input
                id="adm-email"
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="owner@example.com"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm"
              />
            </div>

            <div>
              <label htmlFor="adm-pass" className="block text-xs font-bold text-[#0F2417] mb-1">
                كلمة المرور (8 أحرف على الأقل)
              </label>
              <div className="relative">
                <input
                  id="adm-pass"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] pr-3.5 pl-11 rounded-xl border border-[#DCE6DE] text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] rounded-lg text-[#4A6353] hover:bg-[#EDF3EE] flex items-center justify-center cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <p role="alert" className="text-xs font-bold text-[#9A3412] bg-red-50 border border-red-200 rounded-xl p-3">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={authBusy}
              className="w-full min-h-[48px] rounded-xl bg-[#15803D] text-white font-bold text-sm hover:bg-[#166534] cursor-pointer"
            >
              {authBusy
                ? 'جاري التحقق...'
                : hasAdmin
                  ? 'دخول إلى لوحة الإدارة'
                  : 'إنشاء حساب المدير الرئيسي والدخول'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Admin Top Header */}
      <div className="bg-white rounded-2xl border border-[#DCE6DE] p-4 md:p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F2417]">
            لوحة تحكم مدير السوبر ماركت
          </h1>
          <p className="text-xs text-[#4A6353] mt-0.5">
            مرحبًا {admin.name} ({admin.email})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loadingDash}
            className="min-h-[44px] px-4 rounded-xl bg-[#EDF3EE] text-[#0F2417] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loadingDash ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="min-h-[44px] px-4 rounded-xl bg-[#F8FAF8] border border-[#DCE6DE] text-[#9A3412] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics Grid */}
      {dashboard && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'إجمالي المبيعات', value: `${dashboard.stats.totalSalesEgp} ج.م`, highlight: true },
            { label: 'إجمالي الطلبات', value: dashboard.stats.totalOrders },
            { label: 'طلبات جديدة', value: dashboard.stats.newOrders },
            { label: 'قيد التجهيز', value: dashboard.stats.preparingOrders },
            { label: 'خرجت للتوصيل', value: dashboard.stats.outForDeliveryOrders },
            { label: 'مكتملة', value: dashboard.stats.completedOrders },
            { label: 'ملغاة', value: dashboard.stats.cancelledOrders },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className={`rounded-2xl border p-3.5 ${
                kpi.highlight
                  ? 'bg-[#15803D] text-white border-[#15803D]'
                  : 'bg-white text-[#0F2417] border-[#DCE6DE]'
              }`}
            >
              <span
                className={`block text-[11px] ${
                  kpi.highlight ? 'text-white/85' : 'text-[#4A6353]'
                }`}
              >
                {kpi.label}
              </span>
              <span className="block text-lg font-bold mt-1 tabular-nums">{kpi.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Admin Sub-Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: 'orders' as const, label: 'الطلبات', icon: <Truck className="w-4 h-4" /> },
          { id: 'products' as const, label: 'المنتجات والأسعار والمخزون', icon: <Package className="w-4 h-4" /> },
          { id: 'categories' as const, label: 'الأقسام', icon: <FolderPlus className="w-4 h-4" /> },
          { id: 'delivery' as const, label: 'التوصيل والإعدادات', icon: <Settings className="w-4 h-4" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSection(tab.id)}
            className={`min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 border inline-flex items-center gap-2 cursor-pointer transition-colors ${
              section === tab.id
                ? 'bg-[#0F2417] text-white border-[#0F2417]'
                : 'bg-white text-[#0F2417] border-[#DCE6DE] hover:border-[#15803D]'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {actionError && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs font-bold text-red-900">
          {actionError}
        </div>
      )}
      {actionNotice && (
        <div className="rounded-xl bg-[#EDF3EE] border border-[#15803D]/30 p-3.5 text-xs font-bold text-[#15803D] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* SECTION 1: ORDERS */}
      {section === 'orders' && dashboard && (
        <div className="space-y-4">
          {dashboard.orders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#DCE6DE] p-10 text-center text-sm text-[#4A6353]">
              لا توجد طلبات واردة حتى الآن.
            </div>
          ) : (
            dashboard.orders.map((order) => (
              <article
                key={order.id}
                className="bg-white rounded-2xl border border-[#DCE6DE] p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#EDF3EE]">
                  <div>
                    <h2 className="text-base font-bold text-[#0F2417] tabular-nums">
                      طلب #{order.orderNumber} — {order.customerName}
                    </h2>
                    <p className="text-xs text-[#4A6353] mt-0.5">
                      {new Date(order.createdAt).toLocaleString('ar-EG')} · الحالة:{' '}
                      <strong className="text-[#15803D]">{ORDER_STATUS_TEXT[order.status]}</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={`tel:${order.customerPhone}`}
                      className="min-h-[40px] px-3 rounded-xl bg-[#EDF3EE] text-[#15803D] text-xs font-bold inline-flex items-center gap-1.5 tabular-nums"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{order.customerPhone}</span>
                    </a>
                    <span className="text-lg font-bold text-[#0F2417] tabular-nums">
                      {order.totalEgp} ج.م
                    </span>
                  </div>
                </div>

                {/* Delivery Address & Exact GPS Map Link */}
                <div className="bg-[#F8FAF8] rounded-xl p-3.5 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#0F2417]">
                      العنوان: {order.zoneName} · {order.streetAddress}
                      {order.buildingNumber ? ` · عمارة ${order.buildingNumber}` : ''}
                      {order.floor ? ` · دور ${order.floor}` : ''}
                      {order.apartment ? ` · شقة ${order.apartment}` : ''}
                    </span>
                    {order.lat !== null && order.lng !== null && (
                      <a
                        href={`https://www.google.com/maps?q=${order.lat},${order.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#15803D] text-white font-bold"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>فتح موقع العميل على الخريطة</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  {order.notes && <p className="text-[#4A6353]">ملاحظات العميل: {order.notes}</p>}
                </div>

                {/* Items */}
                <div className="divide-y divide-[#EDF3EE] text-xs sm:text-sm">
                  {order.items.map((it) => (
                    <div key={it.id} className="py-1.5 flex justify-between">
                      <span>
                        {it.productName} × {it.quantity} ({it.unit} · {it.unitPriceEgp} ج.م)
                      </span>
                      <span className="font-bold tabular-nums">{it.lineTotalEgp} ج.م</span>
                    </div>
                  ))}
                  <div className="py-1.5 flex justify-between text-[#4A6353]">
                    <span>رسوم التوصيل ({order.zoneName})</span>
                    <span className="tabular-nums">{order.deliveryFeeEgp} ج.م</span>
                  </div>
                </div>

                {/* Status Action Buttons */}
                <div className="flex flex-wrap gap-2 pt-2">
                  {(
                    [
                      ['preparing', 'قبول وتجهيز'],
                      ['out_for_delivery', 'خرج للتوصيل'],
                      ['completed', 'تم التسليم'],
                      ['cancelled', 'رفض / إلغاء'],
                    ] as const
                  ).map(([stKey, label]) => (
                    <button
                      key={stKey}
                      type="button"
                      disabled={order.status === stKey}
                      onClick={() => handleOrderStatusChange(order.id, stKey)}
                      className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold border cursor-pointer disabled:opacity-45 ${
                        order.status === stKey
                          ? 'bg-[#15803D] text-white border-[#15803D]'
                          : stKey === 'cancelled'
                            ? 'bg-white text-[#9A3412] border-red-200 hover:bg-red-50'
                            : 'bg-white text-[#0F2417] border-[#DCE6DE] hover:border-[#15803D]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {/* SECTION 2: PRODUCTS & PRICING & INVENTORY */}
      {section === 'products' && dashboard && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Add / Edit Product Form */}
          <form
            onSubmit={handleSaveProduct}
            className="lg:col-span-5 bg-white rounded-2xl border border-[#DCE6DE] p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0F2417]">
                {editingProductId ? 'تعديل بيانات وسعر المنتج' : 'إضافة منتج جديد'}
              </h2>
              {editingProductId && (
                <button
                  type="button"
                  onClick={resetProductForm}
                  className="text-xs font-bold text-[#9A3412] cursor-pointer"
                >
                  إلغاء التعديل
                </button>
              )}
            </div>

            {/* Image Upload from Phone Gallery or Camera */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#0F2417]">
                صورة المنتج (من معرض الهاتف أو الكاميرا)
              </label>
              <div className="flex items-center gap-3">
                <label className="min-h-[44px] px-4 rounded-xl bg-[#EDF3EE] text-[#15803D] text-xs font-bold inline-flex items-center gap-2 cursor-pointer hover:bg-[#DCE6DE]">
                  <Camera className="w-4 h-4" />
                  <span>{uploadingImg ? 'جاري الرفع...' : 'اختيار / تصوير صورة'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                </label>
                {pImage && (
                  <img
                    src={pImage}
                    alt="معاينة المنتج"
                    className="w-14 h-14 rounded-xl object-cover border border-[#DCE6DE]"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F2417] mb-1">اسم المنتج *</label>
              <input
                type="text"
                required
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                placeholder="مثال: لبن جهينة كامل الدسم"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F2417] mb-1">وصف المنتج</label>
              <textarea
                rows={2}
                value={pDesc}
                onChange={(e) => setPDesc(e.target.value)}
                placeholder="وصف مختصر يظهر للعميل"
                className="w-full p-3 rounded-xl border border-[#DCE6DE] text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#0F2417] mb-1">
                  السعر (جنيه) *
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={pPrice}
                  onChange={(e) => setPPrice(e.target.value)}
                  placeholder="0"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F2417] mb-1">
                  السعر قبل الخصم (اختياري)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={pOldPrice}
                  onChange={(e) => setPOldPrice(e.target.value)}
                  placeholder="اختياري"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#0F2417] mb-1">وحدة البيع *</label>
                <select
                  value={pUnit}
                  onChange={(e) => setPUnit(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-[#DCE6DE] text-sm bg-white"
                >
                  {UNIT_PRESETS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F2417] mb-1">
                  الكمية المتوفرة *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={pStock}
                  onChange={(e) => setPStock(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F2417] mb-1">القسم *</label>
              <select
                value={pCategoryId}
                onChange={(e) => setPCategoryId(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#DCE6DE] text-sm bg-white"
              >
                {dashboard.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pIsActive}
                  onChange={(e) => setPIsActive(e.target.checked)}
                />
                <span>متاح للبيع الآن</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pDailyDeal}
                  onChange={(e) => setPDailyDeal(e.target.checked)}
                />
                <span>عرض يومي</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pBestSeller}
                  onChange={(e) => setPBestSeller(e.target.checked)}
                />
                <span>الأكثر مبيعًا</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pNewArrival}
                  onChange={(e) => setPNewArrival(e.target.checked)}
                />
                <span>منتج جديد</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={savingProduct}
              className="w-full min-h-[48px] rounded-xl bg-[#15803D] text-white font-bold text-sm hover:bg-[#166534] cursor-pointer"
            >
              {savingProduct
                ? 'جاري الحفظ...'
                : editingProductId
                  ? 'حفظ التعديلات'
                  : 'إضافة المنتج ونشره للعملاء'}
            </button>
          </form>

          {/* Products List */}
          <div className="lg:col-span-7 space-y-3">
            <h2 className="text-base font-bold text-[#0F2417]">
              قائمة المنتجات ({dashboard.products.length})
            </h2>
            {dashboard.products.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#DCE6DE] p-8 text-center text-sm text-[#4A6353]">
                لا توجد منتجات بعد. أضف أول منتج من النموذج المجاور ليظهر فورًا في تطبيق العملاء.
              </div>
            ) : (
              dashboard.products.map((prod) => (
                <div
                  key={prod.id}
                  className="bg-white rounded-2xl border border-[#DCE6DE] p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {prod.image ? (
                      <img
                        src={prod.image}
                        alt={prod.name}
                        className="w-14 h-14 rounded-xl object-cover bg-[#EDF3EE] shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-[#EDF3EE] text-[#15803D] flex items-center justify-center shrink-0">
                        <Package className="w-6 h-6" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[#0F2417] truncate">{prod.name}</h3>
                      <p className="text-xs text-[#4A6353] tabular-nums">
                        {prod.priceEgp} ج.م / {prod.unit} · المخزون: {prod.stockQuantity} ·{' '}
                        <span className={prod.isActive ? 'text-[#15803D]' : 'text-[#9A3412]'}>
                          {prod.isActive ? 'مُفعّل' : 'متوقف مؤقتًا'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEditProduct(prod)}
                      aria-label={`تعديل ${prod.name}`}
                      className="min-h-[40px] px-3 rounded-xl bg-[#EDF3EE] text-[#0F2417] text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleProduct(prod.id)}
                      className="min-h-[40px] px-3 rounded-xl bg-white border border-[#DCE6DE] text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      {prod.isActive ? (
                        <>
                          <PauseCircle className="w-3.5 h-3.5 text-[#9A3412]" />
                          <span>إيقاف</span>
                        </>
                      ) : (
                        <>
                          <PlayCircle className="w-3.5 h-3.5 text-[#15803D]" />
                          <span>تفعيل</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProduct(prod.id)}
                      aria-label={`حذف ${prod.name}`}
                      className="min-w-[40px] min-h-[40px] rounded-xl text-[#9A3412] hover:bg-red-50 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: CATEGORIES */}
      {section === 'categories' && dashboard && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleAddCategory}
            className="lg:col-span-4 bg-white rounded-2xl border border-[#DCE6DE] p-5 space-y-3"
          >
            <h2 className="text-base font-bold text-[#0F2417]">إضافة قسم جديد</h2>
            <input
              type="text"
              required
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="اسم القسم (مثال: التوابل والبهارات)"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm"
            />
            <input
              type="text"
              value={newCatSubtitle}
              onChange={(e) => setNewCatSubtitle(e.target.value)}
              placeholder="وصف قصير للقسم"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm"
            />
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-[#15803D] text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة القسم</span>
            </button>
          </form>

          <div className="lg:col-span-8 space-y-2.5">
            {editingCat && (
              <form
                onSubmit={handleSaveCategoryEdit}
                className="bg-[#EDF3EE] rounded-2xl border border-[#15803D]/30 p-4 flex flex-wrap gap-2 items-center"
              >
                <input
                  type="text"
                  required
                  value={editingCat.name}
                  onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
                  className="flex-1 min-w-[160px] min-h-[40px] px-3 rounded-xl bg-white border border-[#DCE6DE] text-sm"
                />
                <input
                  type="text"
                  value={editingCat.subtitle}
                  onChange={(e) => setEditingCat({ ...editingCat, subtitle: e.target.value })}
                  className="flex-1 min-w-[160px] min-h-[40px] px-3 rounded-xl bg-white border border-[#DCE6DE] text-sm"
                />
                <button
                  type="submit"
                  className="min-h-[40px] px-4 rounded-xl bg-[#15803D] text-white text-xs font-bold cursor-pointer"
                >
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCat(null)}
                  className="min-h-[40px] px-3 rounded-xl bg-white text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
              </form>
            )}

            {dashboard.categories.map((cat) => (
              <div
                key={cat.id}
                className="bg-white rounded-2xl border border-[#DCE6DE] p-4 flex items-center justify-between gap-3"
              >
                <div>
                  <h3 className="text-sm font-bold text-[#0F2417]">{cat.name}</h3>
                  <p className="text-xs text-[#4A6353]">{cat.subtitle}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingCat(cat)}
                    className="min-h-[38px] px-3 rounded-xl bg-[#EDF3EE] text-xs font-bold cursor-pointer"
                  >
                    تعديل
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setActionError(null);
                      try {
                        await updateAdminCategory(cat.id, {
                          name: cat.name,
                          subtitle: cat.subtitle,
                          isActive: !cat.isActive,
                        });
                        await loadDashboard();
                        onCatalogOrSettingsChanged();
                      } catch (err) {
                        if (!handleAuthFailure(err)) {
                          setActionError(err instanceof Error ? err.message : 'تعذر تعديل القسم');
                        }
                      }
                    }}
                    className="min-h-[38px] px-3 rounded-xl border border-[#DCE6DE] text-xs font-bold cursor-pointer"
                  >
                    {cat.isActive ? 'إخفاء' : 'إظهار'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setActionError(null);
                      try {
                        await deleteAdminCategory(cat.id);
                        await loadDashboard();
                        onCatalogOrSettingsChanged();
                      } catch (err) {
                        if (!handleAuthFailure(err)) {
                          setActionError(err instanceof Error ? err.message : 'تعذر الحذف');
                        }
                      }
                    }}
                    className="min-w-[38px] min-h-[38px] rounded-xl text-[#9A3412] hover:bg-red-50 flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 4: DELIVERY ZONES & STORE SETTINGS */}
      {section === 'delivery' && dashboard && settingsForm && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Store Settings */}
          <form
            onSubmit={handleSaveSettings}
            className="lg:col-span-5 bg-white rounded-2xl border border-[#DCE6DE] p-5 space-y-4"
          >
            <h2 className="text-base font-bold text-[#0F2417]">إعدادات السوبر ماركت والطلب</h2>

            <div>
              <label className="block text-xs font-bold text-[#0F2417] mb-1">اسم السوبر ماركت</label>
              <input
                type="text"
                required
                value={settingsForm.storeName}
                onChange={(e) => setSettingsForm({ ...settingsForm, storeName: e.target.value })}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F2417] mb-1">هاتف خدمة العملاء</label>
              <input
                type="tel"
                value={settingsForm.supportPhone}
                onChange={(e) => setSettingsForm({ ...settingsForm, supportPhone: e.target.value })}
                placeholder="01xxxxxxxxx"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm tabular-nums"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#0F2417] mb-1">
                  رسوم التوصيل الافتراضية (ج.م)
                </label>
                <input
                  type="number"
                  min="0"
                  value={settingsForm.defaultDeliveryFee}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      defaultDeliveryFee: Number(e.target.value),
                    })
                  }
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0F2417] mb-1">
                  الحد الأدنى للطلب (ج.م)
                </label>
                <input
                  type="number"
                  min="0"
                  value={settingsForm.minOrderEgp}
                  onChange={(e) =>
                    setSettingsForm({
                      ...settingsForm,
                      minOrderEgp: Number(e.target.value),
                    })
                  }
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0F2417] mb-1">رسالة الترحيب بالعملاء</label>
              <input
                type="text"
                value={settingsForm.announcement}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, announcement: e.target.value })
                }
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={settingsForm.isOpen}
                onChange={(e) => setSettingsForm({ ...settingsForm, isOpen: e.target.checked })}
              />
              <span>المتجر مفتوح ويستقبل طلبات العملاء</span>
            </label>

            <button
              type="submit"
              disabled={savingSettings}
              className="w-full min-h-[48px] rounded-xl bg-[#15803D] text-white font-bold text-sm hover:bg-[#166534] cursor-pointer"
            >
              {savingSettings ? 'جاري الحفظ...' : 'حفظ إعدادات المتجر'}
            </button>
          </form>

          {/* Delivery Zones */}
          <div className="lg:col-span-7 space-y-4">
            <form
              onSubmit={handleAddZone}
              className="bg-white rounded-2xl border border-[#DCE6DE] p-5 space-y-3"
            >
              <h2 className="text-base font-bold text-[#0F2417]">إضافة منطقة توصيل جديدة</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  required
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  placeholder="اسم المنطقة"
                  className="sm:col-span-2 min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm"
                />
                <input
                  type="number"
                  min="0"
                  required
                  value={newZoneFee}
                  onChange={(e) => setNewZoneFee(e.target.value)}
                  placeholder="الرسوم (ج.م)"
                  className="min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm tabular-nums"
                />
              </div>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-[#15803D] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة منطقة التوصيل</span>
              </button>
            </form>

            {editingZone && (
              <form
                onSubmit={handleSaveZoneEdit}
                className="bg-[#EDF3EE] rounded-2xl border border-[#15803D]/30 p-4 flex flex-wrap gap-2 items-center"
              >
                <input
                  type="text"
                  required
                  value={editingZone.name}
                  onChange={(e) => setEditingZone({ ...editingZone, name: e.target.value })}
                  className="flex-1 min-w-[140px] min-h-[40px] px-3 rounded-xl bg-white border border-[#DCE6DE] text-sm"
                />
                <input
                  type="number"
                  min="0"
                  required
                  value={editingZone.deliveryFee}
                  onChange={(e) =>
                    setEditingZone({ ...editingZone, deliveryFee: Number(e.target.value) })
                  }
                  className="w-28 min-h-[40px] px-3 rounded-xl bg-white border border-[#DCE6DE] text-sm tabular-nums"
                />
                <button
                  type="submit"
                  className="min-h-[40px] px-4 rounded-xl bg-[#15803D] text-white text-xs font-bold cursor-pointer"
                >
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => setEditingZone(null)}
                  className="min-h-[40px] px-3 rounded-xl bg-white text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
              </form>
            )}

            <div className="space-y-2.5">
              {dashboard.zones.map((z) => (
                <div
                  key={z.id}
                  className="bg-white rounded-2xl border border-[#DCE6DE] p-4 flex items-center justify-between gap-3"
                >
                  <div>
                    <h3 className="text-sm font-bold text-[#0F2417]">{z.name}</h3>
                    <p className="text-xs text-[#4A6353] tabular-nums">
                      رسوم التوصيل: {z.deliveryFee} ج.م ·{' '}
                      <span className={z.isActive ? 'text-[#15803D]' : 'text-[#9A3412]'}>
                        {z.isActive ? 'متاح للتوصيل' : 'متوقف مؤقتًا'}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingZone(z)}
                      className="min-h-[38px] px-3 rounded-xl bg-[#EDF3EE] text-xs font-bold cursor-pointer"
                    >
                      تعديل
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setActionError(null);
                        try {
                          await updateAdminZone(z.id, {
                            name: z.name,
                            deliveryFee: z.deliveryFee,
                            isActive: !z.isActive,
                          });
                          await loadDashboard();
                          onCatalogOrSettingsChanged();
                        } catch (err) {
                          if (!handleAuthFailure(err)) {
                            setActionError(err instanceof Error ? err.message : 'تعذر تعديل المنطقة');
                          }
                        }
                      }}
                      className="min-h-[38px] px-3 rounded-xl border border-[#DCE6DE] text-xs font-bold cursor-pointer"
                    >
                      {z.isActive ? 'إيقاف' : 'تفعيل'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setActionError(null);
                        try {
                          await deleteAdminZone(z.id);
                          await loadDashboard();
                          onCatalogOrSettingsChanged();
                        } catch (err) {
                          if (!handleAuthFailure(err)) {
                            setActionError(err instanceof Error ? err.message : 'تعذر حذف المنطقة');
                          }
                        }
                      }}
                      className="min-w-[38px] min-h-[38px] rounded-xl text-[#9A3412] hover:bg-red-50 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
