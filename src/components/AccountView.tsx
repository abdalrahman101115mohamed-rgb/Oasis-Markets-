import React, { useState } from 'react';
import { LogOut, MapPin, ShieldCheck, User } from 'lucide-react';
import { loginCustomer, logoutCustomer, registerCustomer } from '../services/api';
import { CustomerProfile, DeliveryAddress } from '../types/catalog';

interface AccountViewProps {
  customer: CustomerProfile | null;
  address: DeliveryAddress;
  onCustomerChange: (customer: CustomerProfile | null) => void;
  onOpenAddress: () => void;
  onOpenAdmin: () => void;
}

export const AccountView: React.FC<AccountViewProps> = ({
  customer,
  address,
  onCustomerChange,
  onOpenAddress,
  onOpenAdmin,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      if (mode === 'register') {
        const res = await registerCustomer({ name, phone, email, password });
        onCustomerChange(res.customer);
      } else {
        const res = await loginCustomer({ email, password });
        onCustomerChange(res.customer);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutCustomer();
    onCustomerChange(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8">
      {customer ? (
        <div className="bg-white rounded-2xl border border-[#DCE6DE] p-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#15803D] text-white flex items-center justify-center shrink-0">
              <User className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#0F2417]">{customer.name}</h1>
              <p className="text-xs text-[#4A6353] mt-0.5 tabular-nums">
                {customer.phone} · {customer.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="min-h-[44px] px-4 rounded-xl bg-[#EDF3EE] text-[#9A3412] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>خروج</span>
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#DCE6DE] p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-[#0F2417]">حساب العميل</h1>
              <p className="text-xs text-[#4A6353]">
                سجل حسابك لحفظ طلباتك والوصول إليها بأمان من أي جهاز
              </p>
            </div>
            <div className="flex gap-1 bg-[#EDF3EE] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  mode === 'login' ? 'bg-white text-[#0F2417]' : 'text-[#4A6353]'
                }`}
              >
                دخول
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  mode === 'register' ? 'bg-white text-[#0F2417]' : 'text-[#4A6353]'
                }`}
              >
                حساب جديد
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'register' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="الاسم الكامل"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm"
                />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="رقم الهاتف"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm tabular-nums"
                />
              </div>
            )}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="البريد الإلكتروني"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة المرور (6 أحرف على الأقل)"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] text-sm"
            />
            {errorMsg && <p className="text-xs text-[#9A3412] font-bold">{errorMsg}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] cursor-pointer"
            >
              {loading ? 'جاري التنفيذ...' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب عميل'}
            </button>
          </form>
        </div>
      )}

      {/* Delivery Address Card */}
      <div className="bg-white rounded-2xl border border-[#DCE6DE] p-5 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 text-[#15803D] mt-0.5 shrink-0" />
          <div>
            <h2 className="text-sm font-bold text-[#0F2417]">عنوان التوصيل والموقع المحفوظ</h2>
            <p className="text-sm text-[#0F2417] mt-1">{address.area || 'لم يتم تحديد المنطقة'}</p>
            <p className="text-xs text-[#4A6353] mt-0.5">
              {address.streetDetails || 'اضغط تعديل لتحديد موقعك على الخريطة وكتابة العنوان'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenAddress}
          className="min-h-[44px] px-4 rounded-xl bg-[#EDF3EE] text-[#15803D] text-xs font-bold hover:bg-[#DCE6DE] whitespace-nowrap shrink-0 cursor-pointer"
        >
          تحديد / تعديل
        </button>
      </div>

      {/* Secure Admin Portal Entry */}
      <div className="bg-white rounded-2xl border border-[#DCE6DE] p-5 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-[#B68A1E] mt-0.5 shrink-0" />
          <div>
            <h2 className="text-sm font-bold text-[#0F2417]">إدارة السوبر ماركت (حساب المدير)</h2>
            <p className="text-xs text-[#4A6353] mt-0.5">
              إضافة المنتجات، تعديل الأسعار، إدارة الطلبات، مناطق التوصيل، والمبيعات.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenAdmin}
          className="min-h-[44px] px-4 rounded-xl bg-[#0F2417] text-white text-xs font-bold hover:bg-[#1E3A2B] whitespace-nowrap shrink-0 cursor-pointer"
        >
          لوحة الإدارة
        </button>
      </div>
    </div>
  );
};
