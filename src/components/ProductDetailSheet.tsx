import React, { useState } from 'react';
import { CheckCircle2, Minus, Plus, ShoppingBasket, X, XCircle } from 'lucide-react';
import { Product } from '../types/catalog';

interface ProductDetailSheetProps {
  product: Product | null;
  categoryName: string;
  quantity: number;
  onClose: () => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
}

export const ProductDetailSheet: React.FC<ProductDetailSheetProps> = ({
  product,
  categoryName,
  quantity,
  onClose,
  onIncrement,
  onDecrement,
}) => {
  const [imgError, setImgError] = useState(false);

  if (!product) return null;

  const canOrder = product.isAvailable && product.stockQuantity > 0;
  const reachedMaxStock = quantity >= product.stockQuantity;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-3xl overflow-hidden border border-[#DCE6DE] shadow-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden w-10 h-1.5 bg-[#DCE6DE] rounded-full mx-auto my-3 shrink-0" />

        <div className="relative aspect-[4/3] w-full bg-[#EDF3EE] shrink-0">
          {product.image && !imgError ? (
            <img
              src={product.image}
              alt={product.name}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-[#15803D]">
              <ShoppingBasket className="w-10 h-10 mb-2 opacity-70" />
              <span className="text-sm font-medium">{product.name}</span>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق التفاصيل"
            className="absolute top-3 left-3 min-w-[44px] min-h-[44px] rounded-full bg-white/95 text-[#0F2417] border border-[#DCE6DE] flex items-center justify-center shadow-sm hover:bg-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <div className="flex items-center justify-between gap-3 text-xs text-[#4A6353]">
            <span>{categoryName} · وحدة البيع: {product.unit}</span>
            <span
              className={`inline-flex items-center gap-1 font-bold ${
                canOrder ? 'text-[#15803D]' : 'text-[#9A3412]'
              }`}
            >
              {canOrder ? (
                <>
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>متوفر ({product.stockQuantity} متاح)</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" aria-hidden="true" />
                  <span>غير متوفر حاليًا</span>
                </>
              )}
            </span>
          </div>

          <div>
            <h2 className="text-xl font-bold text-[#0F2417]">{product.name}</h2>
            <p className="mt-2 text-sm text-[#4A6353] leading-relaxed">
              {product.shortDescription || 'منتج طازج من أسواق الواحة'}
            </p>
          </div>

          <div className="flex items-baseline justify-between pt-3 border-t border-[#EDF3EE]">
            <div>
              <span className="text-xs text-[#4A6353] block">السعر</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[#0F2417] tabular-nums">
                  {product.priceEgp}
                </span>
                <span className="text-sm font-medium text-[#4A6353]">جنيه مصري</span>
                {product.oldPriceEgp && (
                  <span className="text-sm text-[#4A6353] line-through tabular-nums">
                    {product.oldPriceEgp} ج.م
                  </span>
                )}
              </div>
            </div>

            {canOrder && quantity > 0 && (
              <div className="text-left">
                <span className="text-xs text-[#4A6353] block">الإجمالي</span>
                <span className="text-base font-bold text-[#15803D] tabular-nums">
                  {(product.priceEgp * quantity).toFixed(2).replace(/\.00$/, '')} ج.م
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-[#DCE6DE] bg-[#F8FAF8] flex items-center justify-between gap-3">
          {!canOrder ? (
            <button
              type="button"
              disabled
              className="w-full min-h-[48px] rounded-xl bg-[#DCE6DE] text-[#4A6353] font-bold text-sm cursor-not-allowed"
            >
              هذا المنتج غير متوفر حاليًا
            </button>
          ) : quantity === 0 ? (
            <button
              type="button"
              onClick={() => onIncrement(product.id)}
              className="w-full min-h-[48px] rounded-xl bg-[#15803D] text-white font-bold text-sm hover:bg-[#166534] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              <span>إضافة إلى السلة ({product.priceEgp} ج.م)</span>
            </button>
          ) : (
            <div className="w-full flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 bg-white border border-[#DCE6DE] rounded-xl p-1">
                <button
                  type="button"
                  disabled={reachedMaxStock}
                  onClick={() => onIncrement(product.id)}
                  aria-label="زيادة الكمية"
                  className="min-w-[44px] min-h-[44px] rounded-lg bg-[#15803D] text-white flex items-center justify-center hover:bg-[#166534] disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <span className="min-w-[36px] text-center text-base font-bold text-[#0F2417] tabular-nums">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => onDecrement(product.id)}
                  aria-label="تقليل الكمية"
                  className="min-w-[44px] min-h-[44px] rounded-lg bg-[#EDF3EE] text-[#0F2417] flex items-center justify-center hover:bg-[#DCE6DE] cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[48px] rounded-xl bg-[#15803D] text-white font-bold text-sm hover:bg-[#166534] cursor-pointer"
              >
                متابعة التسوق
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
