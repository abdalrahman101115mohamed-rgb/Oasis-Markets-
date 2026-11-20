/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccountView } from './components/AccountView';
import { AddressSheet } from './components/AddressSheet';
import { AdminDashboardView } from './components/AdminDashboardView';
import { BottomNav } from './components/BottomNav';
import { CartCheckoutView } from './components/CartCheckoutView';
import { CategoriesView } from './components/CategoriesView';
import { HomeView } from './components/HomeView';
import { OrdersView } from './components/OrdersView';
import { ProductDetailSheet } from './components/ProductDetailSheet';
import { SplashScreen } from './components/SplashScreen';
import { OfflineIndicator } from './components/OfflineIndicator';
import { TopBar } from './components/TopBar';
import { fetchBootstrap, fetchCustomerMe, fetchMyOrders } from './services/api';
import {
  AppTab,
  Category,
  CustomerProfile,
  DeliveryAddress,
  DeliveryZone,
  Order,
  Product,
  ReorderNotice,
  StoreSettings,
} from './types/catalog';

const CART_STORAGE_KEY = 'oasis_cart_v1';
const ADDRESS_STORAGE_KEY = 'oasis_address_v1';

const DEFAULT_SETTINGS: StoreSettings = {
  storeName: 'أسواق الواحة',
  supportPhone: '',
  defaultDeliveryFee: 20,
  minOrderEgp: 0,
  isOpen: true,
  announcement: '',
};

const DEFAULT_ADDRESS: DeliveryAddress = {
  zoneId: '',
  area: '',
  streetDetails: '',
  buildingNumber: '',
  floor: '',
  apartment: '',
  lat: null,
  lng: null,
  gpsAccuracy: null,
};

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [runtimeMapsApiKey, setRuntimeMapsApiKey] = useState<string | undefined>(undefined);
  const [loadingStore, setLoadingStore] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [isAddressOpen, setIsAddressOpen] = useState(false);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [reorderNotice, setReorderNotice] = useState<ReorderNotice | null>(null);

  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });

  const [address, setAddress] = useState<DeliveryAddress>(() => {
    try {
      const saved = localStorage.getItem(ADDRESS_STORAGE_KEY);
      return saved ? { ...DEFAULT_ADDRESS, ...JSON.parse(saved) } : DEFAULT_ADDRESS;
    } catch {
      return DEFAULT_ADDRESS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(quantities));
    } catch {
      // ignore storage quota errors
    }
  }, [quantities]);

  useEffect(() => {
    try {
      localStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(address));
    } catch {
      // ignore
    }
  }, [address]);

  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  const loadStoreData = useCallback(async () => {
    try {
      setLoadError(null);
      const data = await fetchBootstrap();
      setCategories(data.categories ?? []);
      setProducts(data.products ?? []);
      setZones(data.zones ?? []);
      setSettings(data.settings ?? DEFAULT_SETTINGS);
      if (data.mapsApiKey) {
        setRuntimeMapsApiKey(data.mapsApiKey);
      }

      // Keep address zone aligned with active zones
      setAddress((prev) => {
        if (!data.zones || data.zones.length === 0) return prev;
        const matched = data.zones.find((z) => z.id === prev.zoneId);
        if (matched) return { ...prev, area: matched.name };
        return {
          ...prev,
          zoneId: data.zones[0].id,
          area: data.zones[0].name,
        };
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'تعذر الاتصال بخادم السوبر ماركت');
    } finally {
      setLoadingStore(false);
    }
  }, []);

  const loadMyOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const res = await fetchMyOrders();
      setMyOrders(Array.isArray(res.orders) ? res.orders : []);
    } catch {
      // keep existing
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    loadStoreData();
    loadMyOrders();
    fetchCustomerMe()
      .then((res) => setCustomer(res.customer ?? null))
      .catch(() => {});

    let pollTimer: number | null = null;
    const startPolling = () => {
      if (pollTimer !== null) return;
      pollTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          loadStoreData();
          loadMyOrders();
        }
      }, 6000);
    };

    let evtSource: EventSource | null = null;
    if (typeof window !== 'undefined' && 'EventSource' in window) {
      evtSource = new EventSource('/api/stream');
      evtSource.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; mode?: string };
          if (msg.type === 'connected' && msg.mode === 'serverless') {
            evtSource?.close();
            startPolling();
            return;
          }
          if (msg.type === 'catalog_updated' || msg.type === 'settings_updated') {
            loadStoreData();
          }
          if (msg.type === 'orders_updated') {
            loadMyOrders();
          }
        } catch {
          // ignore parse issues
        }
      };
      evtSource.onerror = () => {
        // Fallback smoothly on serverless hosts (e.g., Cloudflare Workers)
        startPolling();
      };
    } else {
      startPolling();
    }

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        loadStoreData();
        loadMyOrders();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    return () => {
      evtSource?.close();
      if (pollTimer !== null) window.clearInterval(pollTimer);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [loadStoreData, loadMyOrders]);

  const categoryNameMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])) as Record<string, string>,
    [categories],
  );

  const productMap = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])) as Record<string, Product>,
    [products],
  );

  const totalCartCount = useMemo(
    () =>
      Object.entries(quantities).reduce((sum, [id, count]) => {
        return productMap[id] ? sum + count : sum;
      }, 0),
    [quantities, productMap],
  );

  const selectedZoneFee = useMemo(() => {
    const z = zones.find((item) => item.id === address.zoneId) ?? zones[0];
    return z ? z.deliveryFee : null;
  }, [zones, address.zoneId]);

  const handleIncrement = useCallback(
    (productId: string) => {
      const prod = productMap[productId];
      if (!prod || !prod.isAvailable) return;
      setQuantities((prev) => {
        const current = prev[productId] ?? 0;
        if (current >= prod.stockQuantity) return prev;
        return { ...prev, [productId]: current + 1 };
      });
    },
    [productMap],
  );

  const handleDecrement = useCallback((productId: string) => {
    setQuantities((prev) => {
      const current = prev[productId] ?? 0;
      if (current <= 1) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: current - 1 };
    });
  }, []);

  const handleRemoveItem = useCallback((productId: string) => {
    setQuantities((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, []);

  const handleSelectCategoryFromHome = useCallback((categoryId: string) => {
    setSelectedCategory(categoryId);
    setActiveTab('categories');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOrderConfirmed = useCallback(() => {
    setQuantities({});
    setReorderNotice(null);
    loadStoreData();
    loadMyOrders();
  }, [loadStoreData, loadMyOrders]);

  const handleReorder = useCallback(
    (order: Order): { ok: boolean; message?: string } => {
      if (!order.items || order.items.length === 0) {
        return { ok: false, message: 'لا توجد منتجات مسجلة في هذا الطلب.' };
      }

      const additions: Record<string, number> = {};
      const unavailableNames: string[] = [];
      const cappedNames: string[] = [];
      let addedCount = 0;

      for (const item of order.items) {
        const prod = productMap[item.productId];
        if (!prod || !prod.isAvailable || prod.stockQuantity <= 0) {
          unavailableNames.push(item.productName);
          continue;
        }
        const qty = Math.min(prod.stockQuantity, Math.max(1, item.quantity));
        if (qty < item.quantity) {
          cappedNames.push(prod.name);
        }
        additions[item.productId] = qty;
        addedCount += 1;
      }

      if (addedCount === 0) {
        return {
          ok: false,
          message: 'عذرًا، جميع منتجات هذا الطلب غير متوفرة حاليًا في المتجر.',
        };
      }

      setQuantities((prev) => ({
        ...prev,
        ...additions,
      }));
      setReorderNotice({
        orderNumber: order.orderNumber,
        addedCount,
        unavailableNames,
        cappedNames,
      });
      setActiveTab('cart');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return { ok: true };
    },
    [productMap],
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAF8] text-[#0F2417]">
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}

      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <TopBar
        storeName={settings.storeName}
        activeTab={activeTab}
        totalCartCount={totalCartCount}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-6 pt-5 pb-20 md:pb-10">
        {loadError && (
          <div className="mb-5 rounded-2xl bg-red-50 border border-red-200 p-4 flex items-center justify-between gap-3 text-xs text-red-900">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={loadStoreData}
              className="px-3 py-1.5 rounded-lg bg-white border border-red-200 font-bold cursor-pointer"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {loadingStore && categories.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#4A6353]">
            جاري تحميل بيانات {settings.storeName}...
          </div>
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeView
                categories={categories}
                products={products}
                settings={settings}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                address={address}
                selectedZoneFee={selectedZoneFee}
                onOpenAddress={() => setIsAddressOpen(true)}
                quantities={quantities}
                onIncrement={handleIncrement}
                onDecrement={handleDecrement}
                onOpenDetail={setDetailProduct}
                onSelectCategory={handleSelectCategoryFromHome}
                onOpenAdmin={() => setActiveTab('admin')}
              />
            )}

            {activeTab === 'categories' && (
              <CategoriesView
                categories={categories}
                products={products}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                quantities={quantities}
                onIncrement={handleIncrement}
                onDecrement={handleDecrement}
                onOpenDetail={setDetailProduct}
              />
            )}

            {activeTab === 'cart' && (
              <CartCheckoutView
                products={products}
                zones={zones}
                settings={settings}
                quantities={quantities}
                address={address}
                customer={customer}
                runtimeMapsApiKey={runtimeMapsApiKey}
                reorderNotice={reorderNotice}
                onDismissReorderNotice={() => setReorderNotice(null)}
                onIncrement={handleIncrement}
                onDecrement={handleDecrement}
                onRemoveItem={handleRemoveItem}
                onUpdateAddress={setAddress}
                onOrderConfirmed={handleOrderConfirmed}
                onGoShopping={() => setActiveTab('home')}
              />
            )}

            {activeTab === 'orders' && (
              <OrdersView
                orders={myOrders}
                loading={loadingOrders}
                onRefresh={loadMyOrders}
                onGoShopping={() => setActiveTab('home')}
                onReorder={handleReorder}
              />
            )}

            {activeTab === 'account' && (
              <AccountView
                customer={customer}
                address={address}
                onCustomerChange={(c) => {
                  setCustomer(c);
                  loadMyOrders();
                }}
                onOpenAddress={() => setIsAddressOpen(true)}
                onOpenAdmin={() => setActiveTab('admin')}
              />
            )}

            {activeTab === 'admin' && (
              <AdminDashboardView onCatalogOrSettingsChanged={loadStoreData} />
            )}
          </>
        )}
      </main>

      <footer className="hidden md:block border-t border-[#DCE6DE] bg-white">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-[#4A6353]">
          <span>{settings.storeName} — سوبر ماركت وتوصيل منزلي</span>
          <span>جميع الحقوق محفوظة © {new Date().getFullYear()} {settings.storeName}</span>
        </div>
      </footer>

      <BottomNav
        activeTab={activeTab === 'admin' ? 'account' : activeTab}
        totalCartCount={totalCartCount}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <ProductDetailSheet
        product={detailProduct}
        categoryName={detailProduct ? (categoryNameMap[detailProduct.categoryId] || 'عام') : ''}
        quantity={detailProduct ? (quantities[detailProduct.id] ?? 0) : 0}
        customerName={customer?.name}
        onClose={() => setDetailProduct(null)}
        onIncrement={handleIncrement}
        onDecrement={handleDecrement}
      />

      <AddressSheet
        isOpen={isAddressOpen}
        zones={zones}
        currentAddress={address}
        runtimeMapsApiKey={runtimeMapsApiKey}
        onClose={() => setIsAddressOpen(false)}
        onSave={setAddress}
      />

      <OfflineIndicator />
    </div>
  );
}
