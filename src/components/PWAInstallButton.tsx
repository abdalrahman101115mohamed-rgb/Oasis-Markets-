import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'card' | 'compact';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'card' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleAction = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  if (variant === 'compact') {
    if (!isInstallable && !isIOS) {
      return null;
    }
    return (
      <>
        <button
          type="button"
          onClick={handleAction}
          className="min-h-[36px] px-3 rounded-xl bg-[#EDF3EE] text-[#15803D] border border-[#DCE6DE] text-xs font-bold hover:bg-[#DCE6DE] inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>تثبيت التطبيق</span>
        </button>

        {showGuide && <InstallGuideModal isIOS={isIOS} onClose={() => setShowGuide(false)} />}
      </>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-[#DCE6DE] p-5 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Smartphone className="w-6 h-6 text-[#15803D] mt-0.5 shrink-0" />
          <div>
            <h2 className="text-sm font-bold text-[#0F2417]">تثبيت تطبيق «أسواق الواحة» على الهاتف</h2>
            <p className="text-xs text-[#4A6353] mt-0.5">
              {isInstallable
                ? 'ثبّت التطبيق على شاشة هاتفك الرئيسية للوصول السريع مثل التطبيقات الأصلية.'
                : 'يمكنك تثبيت التطبيق مباشرة على هاتفك أندرويد أو آيفون من المتصفح بضغطة واحدة.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleAction}
          className="min-h-[44px] px-4 rounded-xl bg-[#15803D] text-white text-xs font-bold hover:bg-[#166534] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>{isInstallable ? 'تثبيت الآن' : 'طريقة التثبيت'}</span>
        </button>
      </div>

      {showGuide && <InstallGuideModal isIOS={isIOS} onClose={() => setShowGuide(false)} />}
    </>
  );
};

const InstallGuideModal: React.FC<{ isIOS: boolean; onClose: () => void }> = ({ isIOS, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-[#DCE6DE] space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-[#0F2417]">
          {isIOS ? 'التثبيت على iPhone / iPad' : 'التثبيت على هاتف Android'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="p-1.5 rounded-lg text-[#4A6353] hover:bg-[#EDF3EE] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {isIOS ? (
        <ol className="text-xs text-[#4A6353] space-y-2 list-decimal list-inside leading-relaxed">
          <li>افتح الموقع داخل متصفح Safari.</li>
          <li>اضغط على زر المشاركة (Share) في شريط المتصفح.</li>
          <li>اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).</li>
        </ol>
      ) : (
        <ol className="text-xs text-[#4A6353] space-y-2 list-decimal list-inside leading-relaxed">
          <li>افتح رابط التطبيق المنشور في متصفح Google Chrome.</li>
          <li>اضغط على قائمة المتصفح (⋮) في الأعلى.</li>
          <li>اختر «تثبيت التطبيق» أو «الإضافة إلى الشاشة الرئيسية».</li>
        </ol>
      )}
      <button
        type="button"
        onClick={onClose}
        className="w-full min-h-[44px] rounded-xl bg-[#15803D] text-white text-xs font-bold hover:bg-[#166534] cursor-pointer"
      >
        حسناً
      </button>
    </div>
  </div>
);
