import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MapPin,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import { createOrder } from '../services/api';
import {
  CustomerProfile,
  DeliveryAddress,
  DeliveryZone,
  Order,
  Product,
  ReorderNotice,
  StoreSettings,
} from '../types/catalog';
import { LocationPickerMap } from './LocationPickerMap';

interface CartCheckoutViewProps {
  products: Product[];
  zones: DeliveryZone[];
  settings: StoreSettings;
  quantities: Record<string, number>;
  address: DeliveryAddress;
  customer: CustomerProfile | null;
  runtimeMapsApiKey?: string;
  reorderNotice?: ReorderNotice | null;
  onDismissReorderNotice?: () => void;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onRemoveItem: (id: string) => void;
  onUpdateAddress: (addr: DeliveryAddress) => void;
  onOrderConfirmed: (order: Order) => void;
  onGoShopping: () => void;
}

export const CartCheckoutView: React.FC<CartCheckoutViewProps> = ({
  products,
  zones,
  settings,
  quantities,
  address,
  customer,
  runtimeMapsApiKey,
  reorderNotice,
  onDismissReorderNotice,
  onIncrement,
  onDecrement,
  onRemoveItem,
  onUpdateAddress,
  onOrderConfirmed,
  onGoShopping,
}) => {
  const [customerName, setCustomerName] = useState(customer?.name || '');
  const [customerPhone, setCustomerPhone] = useState(customer?.phone || '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  const productMap = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])) as Record<string, Product>,
    [products],
  );

  const cartLines = useMemo(() => {
    return Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([productId, quantity]) => ({
        productId,
        quantity,
        product: productMap[productId],
      }))
      .filter((line): line is { productId: string; quantity: number; product: Product } =>
        Boolean(line.product),
      );
  }, [quantities, productMap]);

  const subtotalEgp = useMemo(() => {
    const raw = cartLines.reduce((sum, line) => sum + line.product.priceEgp * line.quantity, 0);
    return Math.round(raw * 100) / 100;
  }, [cartLines]);

  const selectedZone = useMemo(
    () => zones.find((z) => z.id === address.zoneId) ?? zones[0] ?? null,
    [zones, address.zoneId],
  );

  const deliveryFeeEgp = selectedZone ? selectedZone.deliveryFee : settings.defaultDeliveryFee;
  const totalEgp = Math.round((subtotalEgp + deliveryFeeEgp) * 100) / 100;
  const belowMinimum = subtotalEgp < settings.minOrderEgp;
  const hasStockConflict = cartLines.some(
    (line) => !line.product.isAvailable || line.quantity > line.product.stockQuantity,
  );

  const handleConfirmOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!settings.isOpen) {
      setErrorMsg('المتجر مغلق مؤقتًا ولا يستقبل طلبات في الوقت الحالي.');
      return;
    }
    if (cartLines.length === 0) {
      setErrorMsg('سلة المشتريات فارغة.');
      return;
    }
    if (!selectedZone) {
      setErrorMsg('يرجى اختيار منطقة التوصيل المتاحة.');
      return;
    }
    if (customerName.trim().length < 2) {
      setErrorMsg('يرجى إدخال اسم العميل بالكامل.');
      return;
    }
    if (customerPhone.trim().length < 8) {
      setErrorMsg('يرجى إدخال رقم هاتف صحيح للتواصل عند التوصيل.');
      return;
    }
    if (address.streetDetails.trim().length < 3) {
      setErrorMsg('يرجى كتابة اسم الشارع وتفاصيل العنوان بوضوح.');
      return;
    }
    if (belowMinimum) {
      setErrorMsg(`الحد الأدنى للطلب هو ${settings.minOrderEgp} ج.م.`);
      return;
    }
    if (hasStockConflict) {
      setErrorMsg('يرجى تعديل الكميات لتتوافق مع المخزون المتاح قبل تأكيد الطلب.');
      return;
    }

    setSubmitting(true);
    try {
      const { order } = await createOrder({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        zoneId: selectedZone.id,
        streetAddress: address.streetDetails.trim(),
        buildingNumber: address.buildingNumber.trim(),
        floor: address.floor.trim(),
        apartment: address.apartment.trim(),
        notes: notes.trim(),
        lat: address.lat,
        lng: address.lng,
        gpsAccuracy: address.gpsAccuracy,
        items: cartLines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
        })),
      });
      setConfirmedOrder(order);
      onOrderConfirmed(order);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تأكيد الطلب، يرجى المحاولة مجددًا');
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmedOrder) {
    return (
      <div className="max-w-2xl mx-auto pb-8">
        <div className="bg-white rounded-3xl border border-[#DCE6DE] p-6 md:p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-[#EDF3EE] text-[#15803D] flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-[#B68A1E] tabular-nums">
              طلب رقم #{confirmedOrder.orderNumber}
            </span>
            <h1 className="text-2xl font-bold text-[#0F2417]">
              تم استلام طلبك بنجاح
            </h1>
            <p className="text-sm text-[#4A6353]">
              تم إرسال الطلب مع موقعك وعنوانك إلى إدارة السوبر ماركت، الدفع نقدًا عند الاستلام.
            </p>
          </div>

          <div className="bg-[#F8FAF8] rounded-2xl border border-[#DCE6DE] p-4 text-right space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#4A6353]">إجمالي المنتجات</span>
              <span className="font-bold tabular-nums">{confirmedOrder.subtotalEgp} ج.م</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4A6353]">رسوم التوصيل ({confirmedOrder.zoneName})</span>
              <span className="font-bold tabular-nums">{confirmedOrder.deliveryFeeEgp} ج.م</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-[#DCE6DE] text-base">
              <span className="font-bold text-[#0F2417]">الإجمالي النهائي المطلوب</span>
              <span className="font-bold text-[#15803D] tabular-nums">
                {confirmedOrder.totalEgp} ج.م
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setConfirmedOrder(null);
              onGoShopping();
            }}
            className="w-full min-h-[48px] rounded-xl bg-[#15803D] text-white font-bold text-sm hover:bg-[#166534] cursor-pointer"
          >
            العودة للتسوق
          </button>
        </div>
      </div>
    );
  }

  if (cartLines.length === 0) {
    return (
      <div className="max-w-2xl mx-auto pb-8">
        <div className="bg-white rounded-3xl border border-[#DCE6DE] p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#EDF3EE] text-[#15803D] flex items-center justify-center mx-auto">
            <ShoppingBag className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#0F2417]">سلة المشتريات فارغة</h1>
            <p className="text-sm text-[#4A6353] mt-1">
              أضف المنتجات التي تحتاجها من المتجر ليتم حساب الإجمالي ورسوم التوصيل تلقائيًا.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoShopping}
            className="min-h-[44px] px-6 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] cursor-pointer"
          >
            تصفح المنتجات
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-[#0F2417]">سلة المشتريات وتأكيد الطلب</h1>
        <p className="text-sm text-[#4A6353]">
          يتم تحديث الإجمالي ومراجعة المخزون والأسعار لحظيًا من قاعدة بيانات السوبر ماركت.
        </p>
      </div>

      {reorderNotice && (
        <div
          role="status"
          className="rounded-2xl bg-[#ECFDF5] border border-[#86EFAC] p-4 flex items-start justify-between gap-3 text-xs sm:text-sm text-[#14532D]"
        >
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">
                تمت إعادة ملء السلة بمنتجات الطلب #{reorderNotice.orderNumber} ({reorderNotice.addedCount} صنف).
              </p>
              {reorderNotice.unavailableNames.length > 0 && (
                <p className="text-xs text-[#92400E]">
                  منتجات غير متوفرة حاليًا وتم تخطيها: {reorderNotice.unavailableNames.join('، ')}.
                </p>
              )}
              {reorderNotice.cappedNames.length > 0 && (
                <p className="text-xs text-[#92400E]">
                  تم تعديل الكمية حسب المخزون المتاح لـ: {reorderNotice.cappedNames.join('، ')}.
                </p>
              )}
            </div>
          </div>
          {onDismissReorderNotice && (
            <button
              type="button"
              onClick={onDismissReorderNotice}
              aria-label="إغلاق التنبيه"
              className="p-1 rounded-lg hover:bg-white/70 text-[#14532D] cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Right Column (RTL): Cart Items & Price Summary */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl border border-[#DCE6DE] divide-y divide-[#EDF3EE]">
            {cartLines.map(({ product, quantity }) => {
              const lineTotal = Math.round(product.priceEgp * quantity * 100) / 100;
              const overStock = quantity > product.stockQuantity || !product.isAvailable;

              return (
                <div key={product.id} className="p-4 flex items-center gap-3.5">
                  <img
                    src={product.image}
                    alt={product.name}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-xl object-cover bg-[#EDF3EE] shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold text-[#0F2417] truncate">{product.name}</h2>
                    <p className="text-xs text-[#4A6353] mt-0.5 tabular-nums">
                      {product.priceEgp} ج.م · {product.unit}
                    </p>
                    <p className="text-sm font-bold text-[#15803D] mt-1 tabular-nums">
                      الإجمالي: {lineTotal} ج.م
                    </p>
                    {overStock && (
                      <p className="text-[11px] text-[#9A3412] font-bold mt-0.5">
                        {!product.isAvailable
                          ? 'تم إيقاف بيع هذا المنتج حاليًا'
                          : `المتاح في المخزون: ${product.stockQuantity} فقط`}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={quantity >= product.stockQuantity}
                      onClick={() => onIncrement(product.id)}
                      aria-label={`زيادة ${product.name}`}
                      className="min-w-[38px] min-h-[38px] rounded-lg bg-[#15803D] text-white flex items-center justify-center disabled:opacity-45 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <span className="min-w-[24px] text-center text-sm font-bold tabular-nums">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDecrement(product.id)}
                      aria-label={`تقليل ${product.name}`}
                      className="min-w-[38px] min-h-[38px] rounded-lg bg-[#EDF3EE] text-[#0F2417] flex items-center justify-center cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(product.id)}
                      aria-label={`حذف ${product.name}`}
                      className="min-w-[38px] min-h-[38px] rounded-lg text-[#9A3412] hover:bg-red-50 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Real-time Totals Card */}
          <div className="bg-white rounded-2xl border border-[#DCE6DE] p-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[#4A6353]">إجمالي المنتجات</span>
              <span className="font-bold text-[#0F2417] tabular-nums">{subtotalEgp} جنيه</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4A6353]">
                رسوم التوصيل {selectedZone ? `(${selectedZone.name})` : ''}
              </span>
              <span className="font-bold text-[#0F2417] tabular-nums">{deliveryFeeEgp} جنيه</span>
            </div>
            <div className="flex justify-between pt-3 border-t border-[#EDF3EE] text-base">
              <span className="font-bold text-[#0F2417]">المبلغ النهائي (الدفع عند الاستلام)</span>
              <span className="text-xl font-bold text-[#15803D] tabular-nums">
                {totalEgp} جنيه
              </span>
            </div>
            {belowMinimum && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 font-medium">
                الحد الأدنى للطلب هو {settings.minOrderEgp} ج.م. أضف منتجات بقيمة{' '}
                {Math.round((settings.minOrderEgp - subtotalEgp) * 100) / 100} ج.م لإتمام الطلب.
              </div>
            )}
          </div>
        </div>

        {/* Left Column (RTL): Customer Info + Precise GPS Location + Address + Confirm */}
        <form
          onSubmit={handleConfirmOrder}
          className="lg:col-span-7 bg-white rounded-2xl border border-[#DCE6DE] p-5 md:p-6 space-y-5"
        >
          <div className="flex items-center gap-2.5 border-b border-[#EDF3EE] pb-3">
            <MapPin className="w-5 h-5 text-[#15803D]" />
            <h2 className="text-lg font-bold text-[#0F2417]">بيانات العميل وموقع التوصيل</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="chk-name" className="block text-xs font-bold text-[#0F2417] mb-1.5">
                اسم العميل *
              </label>
              <input
                id="chk-name"
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="الاسم الثلاثي"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm focus:outline-2 focus:outline-[#15803D]"
              />
            </div>
            <div>
              <label htmlFor="chk-phone" className="block text-xs font-bold text-[#0F2417] mb-1.5">
                رقم الهاتف للتواصل *
              </label>
              <input
                id="chk-phone"
                type="tel"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm tabular-nums focus:outline-2 focus:outline-[#15803D]"
              />
            </div>
          </div>

          {/* Delivery Zone Selector */}
          <div>
            <label className="block text-xs font-bold text-[#0F2417] mb-2">
              اختر منطقة التوصيل *
            </label>
            {zones.length === 0 ? (
              <p className="text-xs text-[#9A3412] bg-amber-50 border border-amber-200 rounded-xl p-3">
                لم يتم تفعيل مناطق توصيل حاليًا من المدير.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {zones.map((z) => {
                  const active = (selectedZone?.id ?? '') === z.id;
                  return (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() =>
                        onUpdateAddress({
                          ...address,
                          zoneId: z.id,
                          area: z.name,
                        })
                      }
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-xs border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#15803D] text-white border-[#15803D]'
                          : 'bg-[#F8FAF8] text-[#0F2417] border-[#DCE6DE] hover:border-[#15803D]'
                      }`}
                    >
                      <span className="font-bold truncate">{z.name}</span>
                      <span className="tabular-nums shrink-0">{z.deliveryFee} ج.م</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Precise GPS Location Picker & Map */}
          <div className="space-y-2">
            <span className="block text-xs font-bold text-[#0F2417]">
              الموقع الجغرافي الدقيق على الخريطة (GPS)
            </span>
            <LocationPickerMap
              lat={address.lat}
              lng={address.lng}
              gpsAccuracy={address.gpsAccuracy}
              runtimeMapsApiKey={runtimeMapsApiKey}
              onChange={(coords) =>
                onUpdateAddress({
                  ...address,
                  lat: coords.lat,
                  lng: coords.lng,
                  gpsAccuracy: coords.gpsAccuracy,
                })
              }
            />
          </div>

          {/* Written Address Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="chk-street" className="block text-xs font-bold text-[#0F2417] mb-1">
                الشارع والعنوان التفصيلي *
              </label>
              <input
                id="chk-street"
                type="text"
                required
                value={address.streetDetails}
                onChange={(e) =>
                  onUpdateAddress({ ...address, streetDetails: e.target.value })
                }
                placeholder="اسم الشارع وأقرب علامة مميزة"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm focus:outline-2 focus:outline-[#15803D]"
              />
            </div>

            <div>
              <label htmlFor="chk-building" className="block text-xs font-bold text-[#0F2417] mb-1">
                رقم العمارة / البيت
              </label>
              <input
                id="chk-building"
                type="text"
                value={address.buildingNumber}
                onChange={(e) =>
                  onUpdateAddress({ ...address, buildingNumber: e.target.value })
                }
                placeholder="مثال: 14"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm focus:outline-2 focus:outline-[#15803D]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="chk-floor" className="block text-xs font-bold text-[#0F2417] mb-1">
                  الدور
                </label>
                <input
                  id="chk-floor"
                  type="text"
                  value={address.floor}
                  onChange={(e) => onUpdateAddress({ ...address, floor: e.target.value })}
                  placeholder="3"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm focus:outline-2 focus:outline-[#15803D]"
                />
              </div>
              <div>
                <label htmlFor="chk-apt" className="block text-xs font-bold text-[#0F2417] mb-1">
                  الشقة
                </label>
                <input
                  id="chk-apt"
                  type="text"
                  value={address.apartment}
                  onChange={(e) =>
                    onUpdateAddress({ ...address, apartment: e.target.value })
                  }
                  placeholder="12"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm focus:outline-2 focus:outline-[#15803D]"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="chk-notes" className="block text-xs font-bold text-[#0F2417] mb-1">
                ملاحظات إضافية لمندوب التوصيل
              </label>
              <input
                id="chk-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: الاتصال عند الوصول للبوابة"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm focus:outline-2 focus:outline-[#15803D]"
              />
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-900 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || belowMinimum || hasStockConflict || !settings.isOpen || zones.length === 0}
            className="w-full min-h-[48px] rounded-xl bg-[#15803D] text-white font-bold text-sm hover:bg-[#166534] disabled:opacity-55 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري التحقق من الأسعار والمخزون وتأكيد الطلب...</span>
              </>
            ) : (
              <span>تأكيد الطلب — الإجمالي {totalEgp} جنيه (الدفع عند الاستلام)</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
