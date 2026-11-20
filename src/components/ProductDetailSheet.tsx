import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  MessageSquare,
  Minus,
  Plus,
  Send,
  ShoppingBasket,
  Star,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { fetchProductReviews, submitProductReview } from '../services/api';
import { Product, ProductReview, ProductReviewSummary } from '../types/catalog';

interface ProductDetailSheetProps {
  product: Product | null;
  categoryName: string;
  quantity: number;
  customerName?: string;
  onClose: () => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
}

const RATING_TEXT: Record<number, string> = {
  1: 'يحتاج تحسين',
  2: 'مقبول',
  3: 'جيد',
  4: 'جيد جدًا',
  5: 'ممتاز',
};

export const ProductDetailSheet: React.FC<ProductDetailSheetProps> = ({
  product,
  categoryName,
  quantity,
  customerName,
  onClose,
  onIncrement,
  onDecrement,
}) => {
  const [imgError, setImgError] = useState(false);

  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [summary, setSummary] = useState<ProductReviewSummary>({
    averageRating: 0,
    totalCount: 0,
  });
  const [loadingReviews, setLoadingReviews] = useState(false);

  const [selectedRating, setSelectedRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [authorName, setAuthorName] = useState(customerName || '');
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  const loadReviews = useCallback(async (productId: string) => {
    setLoadingReviews(true);
    try {
      const data = await fetchProductReviews(productId);
      setReviews(Array.isArray(data.reviews) ? data.reviews : []);
      setSummary(data.summary ?? { averageRating: 0, totalCount: 0 });
    } catch {
      // keep silent if offline
    } finally {
      setLoadingReviews(false);
    }
  }, []);

  useEffect(() => {
    setImgError(false);
    setReviewError(null);
    setReviewSuccess(null);
    setComment('');
    setSelectedRating(5);
    setHoverRating(0);
    if (customerName) {
      setAuthorName(customerName);
    }
    if (product?.id) {
      void loadReviews(product.id);
    }
  }, [product?.id, customerName, loadReviews]);

  if (!product) return null;

  const canOrder = product.isAvailable && product.stockQuantity > 0;
  const reachedMaxStock = quantity >= product.stockQuantity;
  const displayedStarValue = hoverRating || selectedRating;

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviewError(null);
    setReviewSuccess(null);

    if (authorName.trim().length < 2) {
      setReviewError('يرجى كتابة اسمك (حرفان على الأقل) قبل إرسال التقييم.');
      return;
    }

    setSubmittingReview(true);
    try {
      const res = await submitProductReview(product.id, {
        authorName: authorName.trim(),
        rating: selectedRating,
        comment: comment.trim(),
      });
      if (res.review) {
        setReviews((prev) => [res.review, ...prev]);
      } else {
        await loadReviews(product.id);
      }
      if (res.summary) {
        setSummary(res.summary);
      }
      setComment('');
      setReviewSuccess('شكرًا لك! تم حفظ تقييمك ومشاركته بنجاح.');
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'تعذر إرسال التقييم حاليًا');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-3xl overflow-hidden border border-[#DCE6DE] shadow-xl max-h-[92vh] flex flex-col"
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

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
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
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-xl font-bold text-[#0F2417]">{product.name}</h2>
              {/* Star Rating Summary Pill */}
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-xs font-bold text-[#92400E] tabular-nums"
                aria-label={`التقييم ${summary.averageRating} من 5`}
              >
                <Star className="w-3.5 h-3.5 fill-[#D4AF37] text-[#D4AF37]" />
                {summary.totalCount > 0 ? (
                  <span>
                    {summary.averageRating.toFixed(1)} ({summary.totalCount} تقييم)
                  </span>
                ) : (
                  <span>بدون تقييمات بعد</span>
                )}
              </div>
            </div>
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

          {/* Customer Star Ratings & Reviews Section */}
          <section
            aria-label="تقييمات وآراء العملاء"
            className="pt-4 border-t border-[#DCE6DE] space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0F2417] flex items-center gap-1.5">
                <Star className="w-4 h-4 fill-[#D4AF37] text-[#D4AF37]" />
                <span>تقييمات وآراء العملاء</span>
              </h3>
              {summary.totalCount > 0 && (
                <span className="text-xs text-[#4A6353] tabular-nums">
                  متوسط {summary.averageRating.toFixed(1)} / 5 ({summary.totalCount})
                </span>
              )}
            </div>

            {/* Add Review Form */}
            <form
              onSubmit={handleSubmitReview}
              className="rounded-2xl bg-[#F8FAF8] border border-[#DCE6DE] p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#0F2417]">قيّم هذا المنتج:</span>
                <div className="flex items-center gap-1" role="radiogroup" aria-label="اختر عدد النجوم">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const active = star <= displayedStarValue;
                    return (
                      <button
                        key={star}
                        type="button"
                        role="radio"
                        aria-checked={selectedRating === star}
                        aria-label={`تقييم ${star} من 5 نجوم`}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        onClick={() => setSelectedRating(star)}
                        className="p-1.5 rounded-lg hover:bg-white transition-transform active:scale-95 cursor-pointer"
                      >
                        <Star
                          className={`w-6 h-6 transition-colors ${
                            active
                              ? 'fill-[#D4AF37] text-[#D4AF37]'
                              : 'text-[#CBD5CE] fill-transparent'
                          }`}
                        />
                      </button>
                    );
                  })}
                  <span className="text-xs font-bold text-[#B68A1E] mr-1.5">
                    {RATING_TEXT[displayedStarValue]}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5">
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={60}
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="اسمك (مثال: أحمد محمد)"
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-[#DCE6DE] bg-white text-xs sm:text-sm text-[#0F2417] focus:outline-2 focus:outline-[#15803D]"
                />
                <textarea
                  rows={2}
                  maxLength={500}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="شارك رأيك حول جودة المنتج والطعم والتغليف (اختياري)..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DCE6DE] bg-white text-xs sm:text-sm text-[#0F2417] resize-none focus:outline-2 focus:outline-[#15803D]"
                />
              </div>

              {reviewError && (
                <p role="alert" className="text-xs font-bold text-[#9A3412]">
                  {reviewError}
                </p>
              )}
              {reviewSuccess && (
                <p role="status" className="text-xs font-bold text-[#15803D]">
                  {reviewSuccess}
                </p>
              )}

              <button
                type="submit"
                disabled={submittingReview}
                className="w-full min-h-[42px] rounded-xl bg-[#0F2417] text-white text-xs font-bold hover:bg-[#1E3A2B] disabled:opacity-60 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                {submittingReview ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري إرسال التقييم...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>إرسال التقييم</span>
                  </>
                )}
              </button>
            </form>

            {/* Customer Reviews List */}
            {loadingReviews ? (
              <div className="py-4 text-center text-xs text-[#4A6353] flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#15803D]" />
                <span>جاري تحميل التقييمات...</span>
              </div>
            ) : reviews.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#DCE6DE] p-4 text-center text-xs text-[#4A6353] flex flex-col items-center gap-1.5">
                <MessageSquare className="w-5 h-5 text-[#15803D] opacity-70" />
                <span>لا توجد تقييمات لهذا المنتج بعد — كن أول من يشارك رأيه!</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {reviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="rounded-xl border border-[#DCE6DE] bg-white p-3.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#EDF3EE] text-[#15803D] flex items-center justify-center shrink-0">
                          <User className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <span className="block text-xs font-bold text-[#0F2417]">
                            {rev.authorName}
                          </span>
                          <span className="block text-[10px] text-[#738A7B]">
                            {new Date(rev.createdAt).toLocaleDateString('ar-EG')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5" aria-label={`${rev.rating} من 5 نجوم`}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-3.5 h-3.5 ${
                              s <= rev.rating
                                ? 'fill-[#D4AF37] text-[#D4AF37]'
                                : 'text-[#DCE6DE]'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    {rev.comment && (
                      <p className="text-xs text-[#4A6353] leading-relaxed pt-0.5">
                        {rev.comment}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
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
