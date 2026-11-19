import React, { useState } from 'react';
import { CheckCircle2, Minus, Plus, ShoppingBasket, XCircle } from 'lucide-react';
import { Product } from '../types/catalog';

interface ProductCardProps {
  product: Product;
  categoryName: string;
  quantity: number;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onOpenDetail: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  categoryName,
  quantity,
  onIncrement,
  onDecrement,
  onOpenDetail,
}) => {
  const [imgError, setImgError] = useState(false);
  const canOrder = product.isAvailable && product.stockQuantity > 0;
  const reachedMaxStock = quantity >= product.stockQuantity;

  return (
    <article className="group flex flex-col bg-white rounded-2xl border border-[#DCE6DE] overflow-hidden transition-transform duration-200 hover:-translate-y-0.5">
      <button
        type="button"
        onClick={() => onOpenDetail(product)}
        className="relative aspect-[4/3] w-full bg-[#EDF3EE] overflow-hidden text-right cursor-pointer focus-visible:outline-2 focus-visible:outline-[#15803D]"
        aria-label={`عرض تفاصيل ${product.name}`}
      >
        {product.image && !imgError ? (
          <img
            src={product.image}
            alt={product.name}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${
              !canOrder ? 'opacity-55 grayscale-[35%]' : ''
            }`}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#EDF3EE] to-[#DCE6DE] text-[#15803D] p-4">
            <ShoppingBasket className="w-8 h-8 mb-2 opacity-70" />
            <span className="text-xs font-medium text-[#4A6353] text-center">{product.name}</span>
          </div>
        )}
      </button>

      <div className="flex flex-col flex-1 p-4 gap-2.5">
        <div className="flex items-center justify-between gap-2 text-xs text-[#4A6353]">
          <span className="truncate">{categoryName} · {product.unit}</span>
          <span
            className={`inline-flex items-center gap-1 font-medium shrink-0 ${
              canOrder ? 'text-[#15803D]' : 'text-[#9A3412]'
            }`}
          >
            {canOrder ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>متوفر ({product.stockQuantity})</span>
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>غير متوفر</span>
              </>
            )}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onOpenDetail(product)}
          className="text-right cursor-pointer focus-visible:outline-2 focus-visible:outline-[#15803D] rounded"
        >
          <h3 className="text-base font-bold text-[#0F2417] leading-snug line-clamp-1">
            {product.name}
          </h3>
          <p className="mt-1 text-sm text-[#4A6353] leading-relaxed line-clamp-2 min-h-[2.6rem]">
            {product.shortDescription || 'منتج طازج من أسواق الواحة'}
          </p>
        </button>

        <div className="mt-auto pt-3 border-t border-[#EDF3EE] flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-[#0F2417] tabular-nums">
                {product.priceEgp}
              </span>
              <span className="text-xs font-medium text-[#4A6353]">ج.م</span>
            </div>
            {product.oldPriceEgp && (
              <span className="text-xs text-[#4A6353] line-through tabular-nums">
                {product.oldPriceEgp} ج.م
              </span>
            )}
          </div>

          {!canOrder ? (
            <button
              type="button"
              disabled
              className="min-h-[44px] px-3.5 rounded-xl bg-[#EDF3EE] text-[#4A6353] text-xs font-medium cursor-not-allowed whitespace-nowrap shrink-0"
            >
              غير متوفر حاليًا
            </button>
          ) : quantity === 0 ? (
            <button
              type="button"
              onClick={() => onIncrement(product.id)}
              className="min-h-[44px] px-4 rounded-xl bg-[#15803D] text-white text-xs font-bold hover:bg-[#166534] active:scale-[0.98] transition-all inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>أضف للسلة</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 bg-[#EDF3EE] rounded-xl p-1">
              <button
                type="button"
                disabled={reachedMaxStock}
                onClick={() => onIncrement(product.id)}
                aria-label={`زيادة كمية ${product.name}`}
                className="min-w-[40px] min-h-[40px] rounded-lg bg-[#15803D] text-white flex items-center justify-center hover:bg-[#166534] disabled:opacity-50 active:scale-[0.96] transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
              <span className="min-w-[28px] text-center text-sm font-bold text-[#0F2417] tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => onDecrement(product.id)}
                aria-label={`تقليل كمية ${product.name}`}
                className="min-w-[40px] min-h-[40px] rounded-lg bg-white text-[#0F2417] border border-[#DCE6DE] flex items-center justify-center hover:bg-[#F8FAF8] active:scale-[0.96] transition-all cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
