import React from 'react';
import { ClipboardList, Home, LayoutGrid, ShoppingBag, User } from 'lucide-react';
import { AppTab } from '../types/catalog';

interface BottomNavProps {
  activeTab: AppTab;
  totalCartCount: number;
  onSelectTab: (tab: AppTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  totalCartCount,
  onSelectTab,
}) => {
  const items: { id: AppTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'home', label: 'الرئيسية', icon: <Home className="w-5 h-5" /> },
    { id: 'categories', label: 'الأقسام', icon: <LayoutGrid className="w-5 h-5" /> },
    {
      id: 'cart',
      label: 'السلة',
      icon: <ShoppingBag className="w-5 h-5" />,
      count: totalCartCount,
    },
    { id: 'orders', label: 'طلباتي', icon: <ClipboardList className="w-5 h-5" /> },
    { id: 'account', label: 'حسابي', icon: <User className="w-5 h-5" /> },
  ];

  return (
    <nav
      aria-label="شريط التنقل السفلي"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 backdrop-blur-md border-t border-[#DCE6DE]"
    >
      <div className="grid grid-cols-5 h-full max-w-lg mx-auto">
        {items.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center min-h-[44px] transition-colors cursor-pointer ${
                isActive ? 'text-[#15803D]' : 'text-[#4A6353] hover:text-[#0F2417]'
              }`}
            >
              <div className="relative flex items-center justify-center">
                {item.icon}
                {typeof item.count === 'number' && item.count > 0 && (
                  <span className="absolute -top-1.5 -left-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#B68A1E] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {item.count}
                  </span>
                )}
              </div>
              <span
                className={`text-[11px] mt-0.5 whitespace-nowrap ${
                  isActive ? 'font-bold' : 'font-medium'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
