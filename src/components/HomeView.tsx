import React from 'react';
import { ArrowLeft, ChevronLeft, MapPin, Search, ShieldCheck, ShoppingBasket, X } from 'lucide-react';
import heroBannerImage from '../assets/images/oasis_hero_banner_1795123416006.jpg';
import { Category, DeliveryAddress, Product, StoreSettings } from '../types/catalog';
import { CategoryIcon } from './CategoryIcon';
import { ProductCard } from './ProductCard';

const HERO_BANNER_IMAGE = heroBannerImage;

interface HomeViewProps {
  categories: Category[];
  products: Product[];
  settings: StoreSettings;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  address: DeliveryAddress;
  selectedZoneFee: number | null;
  onOpenAddress: () => void;
  quantities: Record<string, number>;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onOpenDetail: (product: Product) => void;
  onSelectCategory: (categoryId: string) => void;
  onOpenAdmin: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  categories,
  products,
  settings,
  searchQuery,
  onSearchChange,
  address,
  selectedZoneFee,
  onOpenAddress,
  quantities,
  onIncrement,
  onDecrement,
  onOpenDetail,
  onSelectCategory,
  onOpenAdmin,
}) => {
  const categoryNameMap = Object.fromEntries(categories.map((c) => [c.id, c.name])) as Record<
    string,
    string
  >;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredProducts = normalizedQuery
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(normalizedQuery) ||
          p.shortDescription.toLowerCase().includes(normalizedQuery) ||
          (categoryNameMap[p.categoryId] || '').toLowerCase().includes(normalizedQuery),
      )
    : products;

  const bestSellers = products.filter((p) => p.isBestSeller);
  const newArrivals = products.filter((p) => p.isNewArrival);
  const dailyDeals = products.filter((p) => p.isDailyDeal);

  return (
    <div className="space-y-8 pb-8">
      {!settings.isOpen && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900 font-medium">
          المتجر مغلق مؤقتًا من الإدارة ولا يستقبل طلبات جديدة في الوقت الحالي.
        </div>
      )}

      {/* Search & Delivery Location Bar */}
      <section aria-label="البحث وموقع التوصيل" className="space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
          <div className="lg:col-span-8 relative">
            <Search
              className="w-5 h-5 text-[#4A6353] absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="ابحث عن أي منتج متاح في السوبر ماركت..."
              aria-label="البحث عن المنتجات"
              className="w-full min-h-[48px] pr-12 pl-11 rounded-2xl bg-white border border-[#DCE6DE] text-sm text-[#0F2417] placeholder:text-[#4A6353]/75 focus:outline-2 focus:outline-[#15803D]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="مسح البحث"
                className="absolute left-2 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] rounded-xl text-[#4A6353] hover:bg-[#EDF3EE] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenAddress}
            className="lg:col-span-4 min-h-[48px] px-4 py-2.5 rounded-2xl bg-white border border-[#DCE6DE] hover:border-[#15803D] transition-colors flex items-center justify-between gap-3 text-right cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <MapPin className="w-5 h-5 text-[#15803D] shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <span className="block text-[11px] text-[#4A6353]">
                  التوصيل إلى {selectedZoneFee !== null ? `· الرسوم ${selectedZoneFee} ج.م` : ''}
                </span>
                <span className="block text-sm font-bold text-[#0F2417] truncate">
                  {address.area || 'اختر منطقة التوصيل وحدد موقعك'}
                </span>
              </div>
            </div>
            <span className="text-xs font-bold text-[#15803D] whitespace-nowrap shrink-0">
              تحديد
            </span>
          </button>
        </div>
      </section>

      {normalizedQuery ? (
        <section aria-label="نتائج البحث" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg md:text-xl font-bold text-[#0F2417]">
              نتائج البحث عن «{searchQuery}»
            </h2>
            <span className="text-xs text-[#4A6353] tabular-nums">
              {filteredProducts.length} منتج
            </span>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#DCE6DE] p-10 text-center space-y-3">
              <p className="text-base font-bold text-[#0F2417]">
                لم نجد منتجات مطابقة لبحثك
              </p>
              <p className="text-sm text-[#4A6353]">
                جرّب البحث باسم آخر أو تصفح الأقسام المتاحة.
              </p>
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="min-h-[44px] px-5 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] cursor-pointer"
              >
                عرض جميع المنتجات
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  categoryName={categoryNameMap[product.categoryId] || 'عام'}
                  quantity={quantities[product.id] ?? 0}
                  onIncrement={onIncrement}
                  onDecrement={onDecrement}
                  onOpenDetail={onOpenDetail}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Hero Banner */}
          <section aria-label="بانر الترحيب والعروض">
            <div className="relative rounded-3xl overflow-hidden border border-[#DCE6DE] aspect-[16/10] sm:aspect-[16/7] lg:aspect-[16/6] bg-[#0F2417]">
              <img
                src={HERO_BANNER_IMAGE}
                alt={settings.storeName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-l from-[#0F2417]/90 via-[#0F2417]/65 to-[#0F2417]/20" />
              <div className="absolute inset-0 p-6 md:p-10 flex flex-col justify-center max-w-xl text-white">
                <span className="text-xs md:text-sm font-bold text-[#D4AF37]">
                  {settings.announcement || `${settings.storeName} · توصيل منزلي سريع`}
                </span>
                <h1 className="mt-2 text-2xl sm:text-3xl md:text-4xl font-bold leading-tight text-balance">
                  تسوق احتياجات بيتك مباشرة من {settings.storeName}
                </h1>
                <p className="mt-2.5 text-sm md:text-base text-white/90 leading-relaxed max-w-md">
                  أسعار حقيقية محدثة لحظيًا من إدارة السوبر ماركت مع تحديد دقيق لموقع التوصيل.
                </p>
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => onSelectCategory(categories[0]?.id || 'vegetables')}
                    className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] border border-[#D4AF37]/40 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <span>تصفح الأقسام والمنتجات</span>
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Main Categories */}
          <section aria-label="الأقسام الرئيسية" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-[#0F2417]">
                  الأقسام الرئيسية
                </h2>
                <p className="text-xs md:text-sm text-[#4A6353] mt-0.5 tabular-nums">
                  {categories.length} قسمًا متاحًا للتسوق
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectCategory('all')}
                className="min-h-[44px] px-3 text-sm font-bold text-[#15803D] hover:text-[#166534] inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>كل الأقسام</span>
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSelectCategory(cat.id)}
                  className="group flex flex-col items-start p-3.5 rounded-2xl bg-white border border-[#DCE6DE] hover:border-[#15803D] transition-all text-right cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#EDF3EE] text-[#15803D] group-hover:bg-[#15803D] group-hover:text-white transition-colors flex items-center justify-center mb-2.5">
                    <CategoryIcon iconKey={cat.iconKey} className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-bold text-[#0F2417] line-clamp-1">
                    {cat.name}
                  </span>
                  <span className="text-[11px] text-[#4A6353] mt-0.5 line-clamp-1">
                    {cat.subtitle}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Store Empty State when Manager hasn't added products yet (ZERO mock products!) */}
          {products.length === 0 ? (
            <section className="bg-white rounded-3xl border border-[#DCE6DE] p-8 md:p-12 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[#EDF3EE] text-[#15803D] flex items-center justify-center mx-auto">
                <ShoppingBasket className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h2 className="text-xl font-bold text-[#0F2417]">
                  لم تُضف منتجات إلى المتجر بعد
                </h2>
                <p className="text-sm text-[#4A6353] leading-relaxed">
                  لا يعرض التطبيق أي منتجات أو أسعار وهمية. يقوم مدير السوبر ماركت بإضافة المنتجات وصورها وأسعارها من لوحة التحكم لتظهر للعملاء فورًا.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenAdmin}
                className="min-h-[44px] px-6 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] inline-flex items-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>دخول مدير السوبر ماركت لإضافة المنتجات</span>
              </button>
            </section>
          ) : (
            <>
              {bestSellers.length > 0 && (
                <section id="best-sellers" aria-label="المنتجات الأكثر مبيعًا" className="space-y-4">
                  <div className="flex items-baseline justify-between gap-4 border-b border-[#DCE6DE] pb-3">
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold text-[#0F2417]">
                        المنتجات الأكثر مبيعًا
                      </h2>
                      <p className="text-xs md:text-sm text-[#4A6353] mt-0.5">
                        اختيارات العملاء المفضلة
                      </p>
                    </div>
                    <span className="text-xs font-medium text-[#B68A1E] tabular-nums whitespace-nowrap">
                      {bestSellers.length} منتجات
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                    {bestSellers.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        categoryName={categoryNameMap[product.categoryId] || 'عام'}
                        quantity={quantities[product.id] ?? 0}
                        onIncrement={onIncrement}
                        onDecrement={onDecrement}
                        onOpenDetail={onOpenDetail}
                      />
                    ))}
                  </div>
                </section>
              )}

              {newArrivals.length > 0 && (
                <section id="new-arrivals" aria-label="المنتجات الجديدة" className="space-y-4">
                  <div className="flex items-baseline justify-between gap-4 border-b border-[#DCE6DE] pb-3">
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold text-[#0F2417]">
                        المنتجات الجديدة
                      </h2>
                      <p className="text-xs md:text-sm text-[#4A6353] mt-0.5">
                        أحدث ما تمت إضافته للمتجر
                      </p>
                    </div>
                    <span className="text-xs font-medium text-[#15803D] tabular-nums whitespace-nowrap">
                      {newArrivals.length} منتجات
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                    {newArrivals.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        categoryName={categoryNameMap[product.categoryId] || 'عام'}
                        quantity={quantities[product.id] ?? 0}
                        onIncrement={onIncrement}
                        onDecrement={onDecrement}
                        onOpenDetail={onOpenDetail}
                      />
                    ))}
                  </div>
                </section>
              )}

              {dailyDeals.length > 0 && (
                <section id="daily-deals" aria-label="العروض اليومية" className="space-y-4">
                  <div className="flex items-baseline justify-between gap-4 border-b border-[#DCE6DE] pb-3">
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold text-[#0F2417]">
                        العروض اليومية
                      </h2>
                      <p className="text-xs md:text-sm text-[#4A6353] mt-0.5">
                        عروض وتخفيضات مفعّلة من الإدارة
                      </p>
                    </div>
                    <span className="text-xs font-medium text-[#B68A1E] tabular-nums whitespace-nowrap">
                      {dailyDeals.length} عروض
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                    {dailyDeals.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        categoryName={categoryNameMap[product.categoryId] || 'عام'}
                        quantity={quantities[product.id] ?? 0}
                        onIncrement={onIncrement}
                        onDecrement={onDecrement}
                        onOpenDetail={onOpenDetail}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* All Live Products Grid */}
              <section aria-label="جميع المنتجات المتاحة" className="space-y-4">
                <div className="flex items-baseline justify-between gap-4 border-b border-[#DCE6DE] pb-3">
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold text-[#0F2417]">
                      كل المنتجات المتاحة
                    </h2>
                    <p className="text-xs md:text-sm text-[#4A6353] mt-0.5">
                      محدثة مباشرة من قاعدة بيانات السوبر ماركت
                    </p>
                  </div>
                  <span className="text-xs font-medium text-[#4A6353] tabular-nums whitespace-nowrap">
                    {products.length} منتج
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                  {products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      categoryName={categoryNameMap[product.categoryId] || 'عام'}
                      quantity={quantities[product.id] ?? 0}
                      onIncrement={onIncrement}
                      onDecrement={onDecrement}
                      onOpenDetail={onOpenDetail}
                    />
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
};
