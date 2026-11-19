import React, { useCallback, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMap,
  MapMouseEvent,
  Pin,
} from '@vis.gl/react-google-maps';
import { Crosshair, Loader2, MapPin, Navigation } from 'lucide-react';

interface LocationPickerMapProps {
  lat: number | null;
  lng: number | null;
  gpsAccuracy: number | null;
  runtimeMapsApiKey?: string;
  onChange: (coords: { lat: number; lng: number; gpsAccuracy: number | null }) => void;
}

const DEFAULT_CENTER = { lat: 30.0444, lng: 31.2357 }; // Cairo default view until GPS/tap

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
  const [permissionDenied, setPermissionDenied] = useState(false);

  const markerPosition =
    lat !== null && lng !== null ? { lat, lng } : null;
  const mapCenter = markerPosition ?? DEFAULT_CENTER;

  const handleRequestGps = useCallback(() => {
    setGpsError(null);
    setPermissionDenied(false);

    if (!('geolocation' in navigator)) {
      setGpsError('المتصفح الحالي لا يدعم خدمة تحديد الموقع الجغرافي (GPS)، يمكنك تحريك الدبوس على الخريطة أو كتابة العنوان يدويًا.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const nextLat = Number(position.coords.latitude.toFixed(6));
        const nextLng = Number(position.coords.longitude.toFixed(6));
        const acc = Math.round(position.coords.accuracy);
        onChange({ lat: nextLat, lng: nextLng, gpsAccuracy: acc });
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionDenied(true);
          setGpsError(
            'تم رفض إذن الوصول إلى الموقع الدقيق. يمكنك السماح بالموقع من إعدادات المتصفح، أو الضغط على الخريطة وكتابة عنوانك بالتفصيل.',
          );
        } else if (err.code === err.TIMEOUT) {
          setGpsError('استغرق تحديد الموقع وقتًا أطول من المعتاد. تأكد من تشغيل GPS في الهاتف وحاول مجددًا أو حدد مكانك على الخريطة.');
        } else {
          setGpsError('تعذر تحديد الموقع تلقائيًا، يمكنك الضغط على الخريطة لوضع العلامة أو كتابة العنوان يدويًا.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  }, [onChange]);

  const handleMapClick = useCallback(
    (e: MapMouseEvent) => {
      const latLng = e.detail.latLng;
      if (!latLng) return;
      onChange({
        lat: Number(latLng.lat.toFixed(6)),
        lng: Number(latLng.lng.toFixed(6)),
        gpsAccuracy: null,
      });
    },
    [onChange],
  );

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

        {markerPosition && (
          <div className="text-xs text-[#15803D] font-medium flex items-center gap-1.5 tabular-nums">
            <Navigation className="w-3.5 h-3.5 shrink-0" />
            <span>
              {markerPosition.lat.toFixed(5)}, {markerPosition.lng.toFixed(5)}
              {gpsAccuracy !== null ? ` (دقة ±${gpsAccuracy} م)` : ' (تحديد يدوي)'}
            </span>
          </div>
        )}
      </div>

      {gpsError && (
        <div
          role="alert"
          className={`rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${
            permissionDenied
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-[#EDF3EE] border-[#DCE6DE] text-[#0F2417]'
          }`}
        >
          {gpsError}
        </div>
      )}

      {apiKey ? (
        <div className="rounded-2xl overflow-hidden border border-[#DCE6DE] bg-[#EDF3EE]">
          <div className="w-full h-[280px] sm:h-[320px]">
            <APIProvider apiKey={apiKey} language="ar" region="EG" libraries={['marker']}>
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
                    <Pin
                      background="#15803D"
                      borderColor="#166534"
                      glyphColor="#FFFFFF"
                    />
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
        <div className="rounded-2xl border border-[#DCE6DE] bg-[#EDF3EE] p-4 text-xs text-[#4A6353]">
          مفتاح الخريطة غير متاح في هذه اللحظة؛ يمكنك تحديد الإحداثيات عبر زر GPS أعلاه أو إدخال العنوان التفصيلي يدويًا بالأسفل.
        </div>
      )}
    </div>
  );
};
