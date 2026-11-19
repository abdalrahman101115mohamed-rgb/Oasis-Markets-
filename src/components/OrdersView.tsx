import React from 'react';
import { CheckCircle2, ClipboardList, Clock, PackageCheck, RefreshCw, Truck, XCircle } from 'lucide-react';
import { Order, OrderStatus } from '../types/catalog';

interface OrdersViewProps {
  orders: Order[];
  loading: boolean;
  onRefresh: () => void;
  onGoShopping: () => void;
}

const STATUS_LABELS: Record<OrderStatus, { label: string; color: string; icon: React.ReactNode }> = {
  new: {
    label: 'تم استلام الطلب (جديد)',
    color: 'text-[#B68A1E]',
    icon: <Clock className="w-4 h-4" />,
  },
  preparing: {
    label: 'جاري تجهيز الطلب',
    color: 'text-[#15803D]',
    icon: <PackageCheck className="w-4 h-4" />,
  },
  out_for_delivery: {
    label: 'خرج للتوصيل',
    color: 'text-[#0369A1]',
    icon: <Truck className="w-4 h-4" />,
  },
  completed: {
    label: 'تم التسليم بنجاح',
    color: 'text-[#15803D]',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  cancelled: {
    label: 'ملغي',
    color: 'text-[#9A3412]',
    icon: <XCircle className="w-4 h-4" />,
  },
};

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  loading,
  onRefresh,
  onGoShopping,
}) => {
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
            const st = STATUS_LABELS[order.status];
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
                  <div className={`inline-flex items-center gap-1.5 text-xs font-bold ${st.color}`}>
                    {st.icon}
                    <span>{st.label}</span>
                  </div>
                </div>

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
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
