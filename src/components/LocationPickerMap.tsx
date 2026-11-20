import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMap,
  MapMouseEvent,
  Pin,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  ExternalLink,
  Loader2,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';

interface LocationPickerMapProps {
  lat: number | null;
  lng: number | null;
  gpsAccuracy: number | null;
  runtimeMapsApiKey?: string;
  onChange: (coords: { lat: number | null; lng: number | null; gpsAccuracy: number | null }) => void;
}

// Viewport center only (NEVER stored or submitted as the customer's location)
const VIEWPORT_DEFAULT_CENTER = { lat: 30.0444, lng: 31.2357 };

type GpsErrorKind =
  | 'iframe_blocked'
  | 'permission_denied'
  | 'insecure_origin'
  | 'timeout'
  | 'unavailable'
  | 'unsupported'
  | null;

const TILE_SIZE = 256;

function clampLat(lat: number): number {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

function latLngToWorldPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const clamped = clampLat(lat);
  const sinLat = Math.sin((clamped * Math.PI) / 180);
  const x = ((lng + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function worldPixelToLatLng(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const scale = TILE_SIZE * Math.pow(2, zoom);
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return {
    lat: Number(clampLat(lat).toFixed(6)),
    lng: Number((((lng + 180) % 360 + 360) % 360 - 180).toFixed(6)),
  };
}

interface FallbackMapProps {
  markerPosition: { lat: number; lng: number } | null;
  onSelectPosition: (coords: { lat: number; lng: number }) => void;
}

const InteractiveOsmFallbackMap: React.FC<FallbackMapProps> = ({
  markerPosition,
  onSelectPosition,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 600, height: 300 });
  const [zoom, setZoom] = useState(markerPosition ? 17 : 12);
  const [viewCenter, setViewCenter] = useState(markerPosition ?? VIEWPORT_DEFAULT_CENTER);
  const dragStateRef = useRef<{
    mode: 'pan' | 'marker' | null;
    startX: number;
    startY: number;
    moved: boolean;
    origWorldX: number;
    origWorldY: number;
  }>({ mode: null, startX: 0, startY: 0, moved: false, origWorldX: 0, origWorldY: 0 });

  useEffect(() => {
    if (markerPosition) {
      setViewCenter(markerPosition);
      setZoom((z) => (z < 15 ? 17 : z));
    }
  }, [markerPosition?.lat, markerPosition?.lng]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const obs = new ResizeObserver(update);
      obs.observe(el);
      return () => obs.disconnect();
    }
  }, []);

  const centerPx = latLngToWorldPixel(viewCenter.lat, viewCenter.lng, zoom);
  const topLeftX = centerPx.x - size.width / 2;
  const topLeftY = centerPx.y - size.height / 2;
  const maxTileIndex = Math.pow(2, zoom);

  const minTx = Math.floor(topLeftX / TILE_SIZE);
  const maxTx = Math.floor((topLeftX + size.width) / TILE_SIZE);
  const minTy = Math.max(0, Math.floor(topLeftY / TILE_SIZE));
  const maxTy = Math.min(maxTileIndex - 1, Math.floor((topLeftY + size.height) / TILE_SIZE));

  const tiles: { key: string; url: string; left: number; top: number }[] = [];
  for (let tx = minTx; tx <= maxTx; tx++) {
    for (let ty = minTy; ty <= maxTy; ty++) {
      const wrappedTx = ((tx % maxTileIndex) + maxTileIndex) % maxTileIndex;
      tiles.push({
        key: `${zoom}-${tx}-${ty}`,
        url: `https://tile.openstreetmap.org/${zoom}/${wrappedTx}/${ty}.png`,
        left: tx * TILE_SIZE - topLeftX,
        top: ty * TILE_SIZE - topLeftY,
      });
    }
  }

  const markerScreen = markerPosition
    ? (() => {
        const mp = latLngToWorldPixel(markerPosition.lat, markerPosition.lng, zoom);
        return { left: mp.x - topLeftX, top: mp.y - topLeftY };
      })()
    : null;

  const handlePointerDownMap = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      mode: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      origWorldX: centerPx.x,
      origWorldY: centerPx.y,
    };
  };

  const handlePointerDownMarker = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!markerPosition) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const mp = latLngToWorldPixel(markerPosition.lat, markerPosition.lng, zoom);
    dragStateRef.current = {
      mode: 'marker',
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      origWorldX: mp.x,
      origWorldY: mp.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st.mode) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (Math.hypot(dx, dy) > 4) {
      st.moved = true;
    }
    if (!st.moved) return;

    if (st.mode === 'pan') {
      const nextCenter = worldPixelToLatLng(st.origWorldX - dx, st.origWorldY - dy, zoom);
      setViewCenter(nextCenter);
    } else if (st.mode === 'marker') {
      const nextPos = worldPixelToLatLng(st.origWorldX + dx, st.origWorldY + dy, zoom);
      onSelectPosition(nextPos);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (st.mode === 'pan' && !st.moved && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const clickWorldX = topLeftX + (e.clientX - rect.left);
      const clickWorldY = topLeftY + (e.clientY - rect.top);
      onSelectPosition(worldPixelToLatLng(clickWorldX, clickWorldY, zoom));
    }
    dragStateRef.current.mode = null;
  };

  return (
    <div className="rounded-2xl overflow-hidden border border-[#DCE6DE] bg-[#E8EFE9]">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDownMap}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragStateRef.current.mode = null;
        }}
        className="relative w-full h-[280px] sm:h-[320px] select-none touch-none cursor-crosshair overflow-hidden"
        aria-label="خريطة تفاعلية لتحديد موقع التوصيل"
      >
        {tiles.map((t) => (
          <img
            key={t.key}
            src={t.url}
            alt=""
            draggable={false}
            className="absolute pointer-events-none select-none max-w-none"
            style={{
              left: `${t.left}px`,
              top: `${t.top}px`,
              width: `${TILE_SIZE}px`,
              height: `${TILE_SIZE}px`,
            }}
          />
        ))}

        {/* Draggable Delivery Marker */}
        {markerScreen && (
          <div
            onPointerDown={handlePointerDownMarker}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            title="اسحب العلامة لتعديل موقع التوصيل بدقة"
            className="absolute z-20 -translate-x-1/2 -translate-y-full cursor-grab active:cursor-grabbing touch-none"
            style={{ left: `${markerScreen.left}px`, top: `${markerScreen.top}px` }}
          >
            <div className="flex flex-col items-center">
              <div className="w-9 h-9 rounded-full bg-[#15803D] border-2 border-white shadow-lg flex items-center justify-center text-white">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="w-2.5 h-2.5 bg-[#15803D] rotate-45 -mt-1.5 border-r border-b border-white" />
            </div>
          </div>
        )}

        {/* Zoom Controls */}
        <div
          className="absolute top-3 left-3 z-30 flex flex-col gap-1.5"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(19, z + 1))}
            aria-label="تكبير الخريطة"
            className="w-9 h-9 rounded-xl bg-white/95 border border-[#DCE6DE] shadow-sm text-[#0F2417] flex items-center justify-center hover:bg-[#EDF3EE] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(5, z - 1))}
            aria-label="تصغير الخريطة"
            className="w-9 h-9 rounded-xl bg-white/95 border border-[#DCE6DE] shadow-sm text-[#0F2417] flex items-center justify-center hover:bg-[#EDF3EE] cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        <div className="absolute bottom-2 right-2 z-20 bg-white/85 px-2 py-0.5 rounded text-[10px] text-[#4A6353] pointer-events-none">
          © OpenStreetMap
        </div>
      </div>

      <div className="px-3.5 py-2 bg-white border-t border-[#DCE6DE] text-[11px] text-[#4A6353] flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
        <span>
          اضغط على أي نقطة في الخريطة أو اسحب العلامة الخضراء لوضعها أمام مدخل منزلك بدقة.
        </span>
      </div>
    </div>
  );
};

export const LocationPickerMap: React.FC<LocationPickerMapProps> = ({
  lat,
  lng,
  gpsAccuracy,
  runtimeMapsApiKey,
  onChange,
}) => {
  const apiKey =
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || runtimeMapsApiKey;
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<GpsErrorKind>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  const markerPosition = lat !== null && lng !== null ? { lat, lng } : null;
  const mapCenter = markerPosition ?? VIEWPORT_DEFAULT_CENTER;
  const isInIframe =
    typeof window !== 'undefined' && (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

  const handleSuccess = useCallback(
    (position: GeolocationPosition) => {
      setLocating(false);
      setGpsError(null);
      setErrorKind(null);
      const nextLat = Number(position.coords.latitude.toFixed(6));
      const nextLng = Number(position.coords.longitude.toFixed(6));
      const acc =
        typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
          ? Math.round(position.coords.accuracy)
          : null;
      onChange({ lat: nextLat, lng: nextLng, gpsAccuracy: acc });
    },
    [onChange],
  );

  const classifyPermissionError = useCallback(
    async (err: GeolocationPositionError) => {
      const msg = (err.message || '').toLowerCase();
      if (
        msg.includes('permissions policy') ||
        msg.includes('feature policy') ||
        msg.includes('disabled in this document') ||
        msg.includes('blocked')
      ) {
        setErrorKind('iframe_blocked');
        setGpsError(
          'تم حظر إذن الموقع الجغرافي لأن التطبيق مفتوح داخل إطار معاينة مدمج (iframe). افتح الرابط المباشر في نافذة متصفح مستقلة لتفعيل GPS بسهولة.',
        );
        return;
      }

      if (isInIframe && 'permissions' in navigator) {
        try {
          const perm = await navigator.permissions.query({ name: 'geolocation' });
          if (perm.state !== 'denied') {
            setErrorKind('iframe_blocked');
            setGpsError(
              'المعاينة المدمجة لا تسمح بطلب GPS من المتصفح. افتح التطبيق في تبويب مستقل خارج المعاينة أو حدد موقعك على الخريطة يدويًا.',
            );
            return;
          }
        } catch {
          // ignore
        }
      }

      setErrorKind('permission_denied');
      setGpsError(
        'تم رفض إذن الوصول إلى الموقع الجغرافي في المتصفح. يرجى السماح بصلاحية الموقع باتباع الخطوات أدناه ثم الضغط على «إعادة المحاولة».',
      );
    },
    [isInIframe],
  );

  // Triggered strictly by explicit user click (no background watchPosition)
  const handleRequestGps = useCallback(() => {
    setGpsError(null);
    setErrorKind(null);

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setErrorKind('insecure_origin');
      setGpsError(
        'المتصفح يمنع الوصول إلى GPS على الروابط غير الآمنة (HTTP). استخدم رابط الموقع الآمن HTTPS أو اكتب عنوانك يدويًا.',
      );
      return;
    }

    if (!('geolocation' in navigator)) {
      setErrorKind('unsupported');
      setGpsError(
        'المتصفح الحالي لا يدعم واجهة الموقع الجغرافي (Geolocation API). يمكنك الضغط على الخريطة أو كتابة العنوان يدويًا.',
      );
      return;
    }

    setLocating(true);

    // Primary high-accuracy single request
    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLocating(false);
          void classifyPermissionError(err);
          return;
        }

        // Graceful secondary attempt for indoor GPS timeout / unavailable (never fakes location)
        if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
          navigator.geolocation.getCurrentPosition(
            handleSuccess,
            (fallbackErr) => {
              setLocating(false);
              if (fallbackErr.code === fallbackErr.PERMISSION_DENIED) {
                void classifyPermissionError(fallbackErr);
              } else if (fallbackErr.code === fallbackErr.TIMEOUT) {
                setErrorKind('timeout');
                setGpsError(
                  'انتهت مهلة تحديد الموقع. تأكد من تفعيل خدمة الموقع (GPS) على الهاتف أو اقترب من النافذة ثم أعد المحاولة، أو حدد موقعك على الخريطة يدويًا.',
                );
              } else {
                setErrorKind('unavailable');
                setGpsError(
                  'تعذر استقبال إشارة GPS من الجهاز حاليًا. يمكنك وضع العلامة يدويًا على الخريطة أو إدخال العنوان بالتفصيل بالأسفل.',
                );
              }
            },
            {
              enableHighAccuracy: false,
              timeout: 12000,
              maximumAge: 15000,
            },
          );
          return;
        }

        setLocating(false);
        setErrorKind('unavailable');
        setGpsError('تعذر تحديد الموقع حاليًا، يمكنك وضع العلامة يدويًا على الخريطة أو كتابة العنوان.');
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  }, [classifyPermissionError, handleSuccess]);

  const handleMapClick = useCallback(
    (e: MapMouseEvent) => {
      const latLng = e.detail.latLng;
      if (!latLng) return;
      setGpsError(null);
      setErrorKind(null);
      onChange({
        lat: Number(latLng.lat.toFixed(6)),
        lng: Number(latLng.lng.toFixed(6)),
        gpsAccuracy: null,
      });
    },
    [onChange],
  );

  const showGoogleMap = Boolean(apiKey && !quotaExceeded);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleRequestGps}
          disabled={locating}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-[#15803D] text-white text-xs sm:text-sm font-bold hover:bg-[#166534] disabled:opacity-70 inline-flex items-center gap-2 cursor-pointer transition-colors"
        >
          {locating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جاري تحديد موقعك الدقيق عبر GPS...</span>
            </>
          ) : (
            <>
              <Crosshair className="w-4 h-4" />
              <span>تحديد موقعي الدقيق (GPS)</span>
            </>
          )}
        </button>

        {markerPosition ? (
          <button
            type="button"
            onClick={() => onChange({ lat: null, lng: null, gpsAccuracy: null })}
            className="min-h-[38px] px-3 rounded-xl border border-[#DCE6DE] bg-white text-xs font-bold text-[#9A3412] hover:bg-red-50 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>مسح الإحداثيات</span>
          </button>
        ) : (
          <span className="text-xs text-[#4A6353] flex items-center gap-1">
            <Navigation className="w-3.5 h-3.5 shrink-0" />
            <span>لم يتم تحديد إحداثيات بعد</span>
          </span>
        )}
      </div>

      {/* Explicit Coordinates & Accuracy Panel when set */}
      {markerPosition && (
        <div className="rounded-xl bg-[#ECFDF5] border border-[#86EFAC] p-3 text-xs text-[#0F2417] space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-[#166534]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>تم تثبيت إحداثيات التوصيل بنجاح (سيتم إرسالها مع الطلب)</span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1 tabular-nums text-[11px] sm:text-xs">
            <div className="bg-white rounded-lg px-2.5 py-1.5 border border-[#BBF7D0]">
              <span className="block text-[#4A6353] text-[10px]">خط العرض (Lat)</span>
              <span className="font-bold">{markerPosition.lat.toFixed(6)}</span>
            </div>
            <div className="bg-white rounded-lg px-2.5 py-1.5 border border-[#BBF7D0]">
              <span className="block text-[#4A6353] text-[10px]">خط الطول (Lng)</span>
              <span className="font-bold">{markerPosition.lng.toFixed(6)}</span>
            </div>
            <div className="bg-white rounded-lg px-2.5 py-1.5 border border-[#BBF7D0]">
              <span className="block text-[#4A6353] text-[10px]">دقة الموقع</span>
              <span className="font-bold text-[#15803D]">
                {gpsAccuracy !== null ? `±${gpsAccuracy} متر` : 'تحديد يدوي'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Actionable GPS Error & Permission Recovery Instructions */}
      {gpsError && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 space-y-2.5 leading-relaxed"
        >
          <div className="flex items-start gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>{gpsError}</span>
          </div>

          {errorKind === 'iframe_blocked' && typeof window !== 'undefined' && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#15803D] text-white font-bold inline-flex items-center gap-1.5 hover:bg-[#166534]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>فتح التطبيق في نافذة مستقلة لتفعيل GPS</span>
              </a>
            </div>
          )}

          {errorKind === 'permission_denied' && (
            <div className="bg-white/80 rounded-xl border border-amber-200 p-3 space-y-2 text-[11px] text-[#0F2417]">
              <p className="font-bold text-amber-900">خطوات تفعيل إذن الموقع ثم إعادة المحاولة:</p>
              <ul className="list-disc list-inside space-y-1 text-[#4A6353]">
                <li>
                  <strong>على أندرويد (Google Chrome):</strong> اضغط على أيقونة القفل أو الإعدادات
                  بجانب رابط الموقع أعلى الشاشة ← اختر <strong>الأذونات (Permissions)</strong> ←{' '}
                  <strong>الموقع الجغرافي (Location)</strong> ← اختر <strong>السماح (Allow)</strong>،
                  وتأكد من تشغيل GPS في الهاتف.
                </li>
                <li>
                  <strong>على آيفون (Safari):</strong> افتح <strong>الإعدادات ← الخصوصية والأمن ←
                  خدمات الموقع ← مواقع Safari</strong> واختر <strong>أثناء استخدام التطبيق</strong>.
                </li>
              </ul>
              <button
                type="button"
                onClick={handleRequestGps}
                className="min-h-[36px] px-3.5 rounded-xl bg-[#15803D] text-white font-bold inline-flex items-center gap-1.5 hover:bg-[#166534] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة المحاولة بعد السماح</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Map View: Google Maps if configured & healthy, otherwise interactive OSM fallback */}
      {showGoogleMap ? (
        <div className="rounded-2xl overflow-hidden border border-[#DCE6DE] bg-[#EDF3EE]">
          <div className="w-full h-[280px] sm:h-[320px]">
            <APIProvider apiKey={apiKey!} language="ar" region="EG" libraries={['marker']}>
              <GoogleMap
                mapId="DEMO_MAP_ID"
                defaultCenter={mapCenter}
                center={mapCenter}
                defaultZoom={markerPosition ? 17 : 12}
                zoom={markerPosition ? 17 : 12}
                gestureHandling="greedy"
                onClick={handleMapClick}
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                style={{ width: '100%', height: '100%' }}
              >
                {markerPosition && (
                  <AdvancedMarker
                    position={markerPosition}
                    draggable={true}
                    title="موقع التوصيل — اسحب العلامة لتعديل الموقع"
                    onDragEnd={(e) => {
                      if (e.latLng) {
                        onChange({
                          lat: Number(e.latLng.lat().toFixed(6)),
                          lng: Number(e.latLng.lng().toFixed(6)),
                          gpsAccuracy: null,
                        });
                      }
                    }}
                  >
                    <Pin background="#15803D" borderColor="#166534" glyphColor="#FFFFFF" />
                  </AdvancedMarker>
                )}
              </GoogleMap>
            </APIProvider>
          </div>
          <div className="px-3.5 py-2 bg-white border-t border-[#DCE6DE] text-[11px] text-[#4A6353] flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
            <span>
              اضغط على الخريطة أو اسحب العلامة الخضراء للتأكد من وضعها أمام مدخل منزلك تمامًا.
            </span>
          </div>
        </div>
      ) : (
        <InteractiveOsmFallbackMap
          markerPosition={markerPosition}
          onSelectPosition={({ lat: nextLat, lng: nextLng }) => {
            setGpsError(null);
            setErrorKind(null);
            onChange({ lat: nextLat, lng: nextLng, gpsAccuracy: null });
          }}
        />
      )}
    </div>
  );
};
