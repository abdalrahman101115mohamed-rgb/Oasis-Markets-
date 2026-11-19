import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { AppTab } from '../types/catalog';
import { OasisLogo } from './OasisLogo';

interface TopBarProps {
  storeName: string;
  activeTab: AppTab;
  totalCartCount: number;
  onSelectTab: (tab: AppTab) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  storeName,
  activeTab,
  totalCartCount,
  onSelectTab,
}) => {
  return (
    <header className="sticky top-0 z-30 h-12 md:h-16 bg-white/95 backdrop-blur-md border-b border-[#DCE6DE]">
      <div className="max-w-7xl mx-auto h-full px-4 md:px-6 flex items-center justify-between gap-8">
        {/* Zone 1: Brand wordmark + emblem */}
        <button
          type="button"
          onClick={() => onSelectTab('home')}
          className="flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#15803D] rounded-lg"
        >
          <OasisLogo size={30} />
          <span className="font-display text-lg md:text-xl font-bold text-[#0F2417]">
            {storeName || 'أسواق الواحة'}
          </span>
        </button>

        {/* Zone 2: Clean single-line navigation links on desktop */}
        <nav
          aria-label="التنقل الرئيسي"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-[#4A6353]"
        >
          <button
            type="button"
            onClick={() => onSelectTab('home')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'home'
                ? 'text-[#15803D] border-[#15803D] font-bold'
                : 'border-transparent hover:text-[#0F2417]'
            }`}
          >
            الرئيسية
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('categories')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'categories'
                ? 'text-[#15803D] border-[#15803D] font-bold'
                : 'border-transparent hover:text-[#0F2417]'
            }`}
          >
            الأقسام
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('orders')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'orders'
                ? 'text-[#15803D] border-[#15803D] font-bold'
                : 'border-transparent hover:text-[#0F2417]'
            }`}
          >
            طلباتي
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('account')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'account'
                ? 'text-[#15803D] border-[#15803D] font-bold'
                : 'border-transparent hover:text-[#0F2417]'
            }`}
          >
            حسابي
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('admin')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'admin'
                ? 'text-[#15803D] border-[#15803D] font-bold'
                : 'border-transparent hover:text-[#0F2417]'
            }`}
          >
            إدارة المتجر
          </button>
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => onSelectTab('cart')}
            aria-label={`سلة المشتريات (${totalCartCount})`}
            className="min-h-[40px] md:min-h-[44px] px-3.5 md:px-4 rounded-xl bg-[#15803D] text-white text-xs md:text-sm font-bold hover:bg-[#166534] active:scale-[0.98] transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" aria-hidden="true" />
            <span>السلة</span>
            <span className="tabular-nums text-[#D4AF37] font-bold">
              ({totalCartCount})
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
