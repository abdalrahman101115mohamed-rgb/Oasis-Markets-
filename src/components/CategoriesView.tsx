import React from 'react';
import { ShoppingBasket } from 'lucide-react';
import { Category, Product } from '../types/catalog';
import { CategoryIcon } from './CategoryIcon';
import { ProductCard } from './ProductCard';

interface CategoriesViewProps {
  categories: Category[];
  products: Product[];
  selectedCategory: string;
  onSelectCategory: (id: string) => void;
  quantities: Record<string, number>;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onOpenDetail: (product: Product) => void;
}

export const CategoriesView: React.FC<CategoriesViewProps> = ({
  categories,
  products,
  selectedCategory,
  onSelectCategory,
  quantities,
  onIncrement,
  onDecrement,
  onOpenDetail,
}) => {
  const categoryNameMap = Object.fromEntries(categories.map((c) => [c.id, c.name])) as Record<
    string,
    string
  >;

  const visibleProducts =
    selectedCategory === 'all'
      ? products
      : products.filter((p) => p.categoryId === selectedCategory);

  const activeCategoryObj =
    selectedCategory === 'all'
      ? null
      : categories.find((c) => c.id === selectedCategory) ?? null;

  return (
    <div className="space-y-6 pb-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-[#0F2417]">أقسام أسواق الواحة</h1>
        <p className="text-sm text-[#4A6353]">
          تصفح الأقسام واختر منتجاتك بسهولة
        </p>
      </div>

      <div
        role="tablist"
        aria-label="تصفية حسب القسم"
        className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={selectedCategory === 'all'}
          onClick={() => onSelectCategory('all')}
          className={`min-h-[44px] px-4 rounded-xl text-sm font-bold whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
            selectedCategory === 'all'
              ? 'bg-[#15803D] text-white border-[#15803D]'
              : 'bg-white text-[#0F2417] border-[#DCE6DE] hover:border-[#15803D]'
          }`}
        >
          جميع الأقسام ({products.length})
        </button>

        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => onSelectCategory(cat.id)}
              className={`min-h-[44px] px-4 rounded-xl text-sm font-bold whitespace-nowrap shrink-0 border inline-flex items-center gap-2 transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[#15803D] text-white border-[#15803D]'
                  : 'bg-white text-[#0F2417] border-[#DCE6DE] hover:border-[#15803D]'
              }`}
            >
              <CategoryIcon iconKey={cat.iconKey} className="w-4 h-4" />
              <span>{cat.name}</span>
            </button>
          );
        })}
      </div>

      {activeCategoryObj && (
        <div className="bg-white rounded-2xl border border-[#DCE6DE] p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#EDF3EE] text-[#15803D] flex items-center justify-center shrink-0">
              <CategoryIcon iconKey={activeCategoryObj.iconKey} className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F2417]">{activeCategoryObj.name}</h2>
              <p className="text-xs text-[#4A6353]">{activeCategoryObj.subtitle}</p>
            </div>
          </div>
          <span className="text-xs font-bold text-[#15803D] tabular-nums whitespace-nowrap">
            {visibleProducts.length} منتج
          </span>
        </div>
      )}

      {visibleProducts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#DCE6DE] p-10 text-center space-y-2">
          <ShoppingBasket className="w-8 h-8 text-[#15803D] mx-auto opacity-75" />
          <p className="text-base font-bold text-[#0F2417]">لا توجد منتجات في هذا القسم حاليًا</p>
          <p className="text-sm text-[#4A6353]">
            عندما يضيف المدير منتجات لهذا القسم ستظهر هنا تلقائيًا.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {visibleProducts.map((product) => (
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
    </div>
  );
};
