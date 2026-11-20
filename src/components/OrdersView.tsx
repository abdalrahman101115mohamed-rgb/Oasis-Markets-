import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Truck,
  XCircle,
} from 'lucide-react';
import { Order, OrderStatus } from '../types/catalog';

interface OrdersViewProps {
  orders: Order[];
  loading: boolean;
  onRefresh: () => void;
  onGoShopping: () => void;
  onReorder: (order: Order) => { ok: boolean; message?: string };
}

interface StatusBadgeStyle {
  label: string;
  badgeClass: string;
  icon: React.ReactNode;
  stepIndex: number;
}

const STATUS_BADGES: Record<OrderStatus, StatusBadgeStyle> = {
  new: {
    label: 'قيد المعالجة · طلب جديد',
    badgeClass: 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]',
    icon: <Clock className="w-3.5 h-3.5 shrink-0" />,
    stepIndex: 0,
  },
  preparing: {
    label: 'قيد المعالجة · جاري التجهيز',
    badgeClass: 'bg-[#ECFDF5] text-[#15803D] border-[#86EFAC]',
    icon: <PackageCheck className="w-3.5 h-3.5 shrink-0" />,
    stepIndex: 1,
  },
  out_for_delivery: {
    label: 'قيد المعالجة · خرج للتوصيل',
    badgeClass: 'bg-[#E0F2FE] text-[#0369A1] border-[#7DD3FC]',
    icon: <Truck className="w-3.5 h-3.5 shrink-0" />,
    stepIndex: 2,
  },
  completed: {
    label: 'تم التوصيل',
    badgeClass: 'bg-[#DCFCE7] text-[#166534] border-[#4ADE80]',
    icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
    stepIndex: 3,
  },
  cancelled: {
    label: 'ملغى',
    badgeClass: 'bg-[#FEE2E2] text-[#B91C1C] border-[#FCA5A5]',
    icon: <XCircle className="w-3.5 h-3.5 shrink-0" />,
    stepIndex: -1,
  },
};

const TIMELINE_STEPS = [
  { key: 'new', label: 'تم الاستلام' },
  { key: 'preparing', label: 'قيد المعالجة' },
  { key: 'out_for_delivery', label: 'في الطريق' },
  { key: 'completed', label: 'تم التوصيل' },
] as const;

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  loading,
  onRefresh,
  onGoShopping,
  onReorder,
}) => {
  const [reorderErrorByOrder, setReorderErrorByOrder] = useState<Record<string, string>>({});

  const handleReorderClick = (order: Order) => {
    const result = onReorder(order);
    if (!result.ok && result.message) {
      setReorderErrorByOrder((prev) => ({
        ...prev,
        [order.id]: result.message!,
      }));
    } else {
      setReorderErrorByOrder((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F2417]">طلباتي</h1>
          <p className="text-sm text-[#4A6353]">
            متابعة فورية لحالة طلباتك من السوبر ماركت حتى باب منزلك
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="min-h-[44px] px-4 rounded-xl bg-white border border-[#DCE6DE] text-xs font-bold text-[#0F2417] hover:border-[#15803D] inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>تحديث</span>
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#DCE6DE] p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#EDF3EE] text-[#15803D] flex items-center justify-center mx-auto">
            <ClipboardList className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#0F2417]">لا توجد طلبات مسجلة لك بعد</h2>
            <p className="text-sm text-[#4A6353] mt-1">
              عند تأكيد أول طلب سيظهر هنا مع تحديثات الحالة المباشرة من المدير.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoShopping}
            className="min-h-[44px] px-6 rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] cursor-pointer"
          >
            ابدأ التسوق
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const st = STATUS_BADGES[order.status] || STATUS_BADGES.new;
            const reorderError = reorderErrorByOrder[order.id];
            return (
              <article
                key={order.id}
                className="bg-white rounded-2xl border border-[#DCE6DE] p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#EDF3EE]">
                  <div>
                    <span className="text-base font-bold text-[#0F2417] tabular-nums">
                      طلب رقم #{order.orderNumber}
                    </span>
                    <span className="block text-xs text-[#4A6353] mt-0.5">
                      {new Date(order.createdAt).toLocaleString('ar-EG')}
                    </span>
                  </div>
                  <span
                    role="status"
                    aria-label={`حالة الطلب: ${st.label}`}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold ${st.badgeClass}`}
                  >
                    {st.icon}
                    <span>{st.label}</span>
                  </span>
                </div>

                {/* Progress steps for active/completed orders, or clear notice if cancelled */}
                {order.status === 'cancelled' ? (
                  <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-2.5 text-xs font-medium text-[#991B1B] flex items-center gap-2">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>تم إلغاء هذا الطلب. يمكنك إعادة الطلب من المتجر في أي وقت.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5 pt-1" aria-label="مراحل حالة الطلب">
                    {TIMELINE_STEPS.map((step, idx) => {
                      const active = idx <= st.stepIndex;
                      return (
                        <div key={step.key} className="space-y-1">
                          <div
                            className={`h-1.5 rounded-full transition-colors ${
                              active ? 'bg-[#15803D]' : 'bg-[#E5ECE6]'
                            }`}
                          />
                          <span
                            className={`block text-[10px] sm:text-[11px] text-center font-medium ${
                              active ? 'text-[#0F2417] font-bold' : 'text-[#738A7B]'
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="divide-y divide-[#EDF3EE] text-sm">
                  {order.items.map((item) => (
                    <div key={item.id} className="py-2 flex items-center justify-between gap-3">
                      <span className="text-[#0F2417]">
                        {item.productName} × {item.quantity} ({item.unit})
                      </span>
                      <span className="font-bold tabular-nums text-[#0F2417]">
                        {item.lineTotalEgp} ج.م
                      </span>
                    </div>
                  ))}
                </div>

                <div className="bg-[#F8FAF8] rounded-xl p-3.5 text-xs space-y-1.5 text-[#4A6353]">
                  <div>
                    العنوان: {order.zoneName} · {order.streetAddress}
                    {order.buildingNumber ? ` · عمارة ${order.buildingNumber}` : ''}
                    {order.floor ? ` · دور ${order.floor}` : ''}
                    {order.apartment ? ` · شقة ${order.apartment}` : ''}
                  </div>
                  <div className="flex justify-between text-sm pt-1 text-[#0F2417]">
                    <span>الإجمالي (شامل التوصيل {order.deliveryFeeEgp} ج.م)</span>
                    <span className="font-bold text-[#15803D] tabular-nums">
                      {order.totalEgp} ج.م
                    </span>
                  </div>
                </div>

                {reorderError && (
                  <div
                    role="alert"
                    className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-2.5 text-xs font-bold text-[#991B1B] flex items-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{reorderError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => handleReorderClick(order)}
                    disabled={order.items.length === 0}
                    aria-label={`إعادة طلب الطلب رقم #${order.orderNumber}`}
                    className="w-full sm:w-auto min-h-[44px] px-5 rounded-xl bg-[#15803D] text-white text-xs sm:text-sm font-bold hover:bg-[#166534] active:scale-[0.99] disabled:opacity-50 inline-flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>إعادة طلب</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
