import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'حدث خطأ غير متوقع في واجهة التطبيق',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Al-Waha UI boundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen bg-[#F8FAF8] text-[#0F2417] flex items-center justify-center p-6"
        >
          <div className="max-w-md w-full bg-white rounded-3xl border border-[#DCE6DE] p-6 text-center space-y-4">
            <h1 className="text-xl font-bold text-[#0F2417]">تعذر عرض التطبيق مؤقتًا</h1>
            <p className="text-sm text-[#4A6353] leading-relaxed">
              حدث خطأ غير متوقع أثناء تشغيل «أسواق الواحة». يمكنك إعادة تحميل الصفحة للمحاولة مرة أخرى.
            </p>
            {this.state.message && (
              <p className="text-xs text-[#9A3412] bg-red-50 border border-red-200 rounded-xl p-2.5 break-words">
                {this.state.message}
              </p>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[44px] rounded-xl bg-[#15803D] text-white text-sm font-bold hover:bg-[#166534] cursor-pointer"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
