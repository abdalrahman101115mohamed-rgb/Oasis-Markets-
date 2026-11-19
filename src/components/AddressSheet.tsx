import React, { useEffect, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { DeliveryAddress, DeliveryZone } from '../types/catalog';
import { LocationPickerMap } from './LocationPickerMap';

interface AddressSheetProps {
  isOpen: boolean;
  zones: DeliveryZone[];
  currentAddress: DeliveryAddress;
  onClose: () => void;
  onSave: (address: DeliveryAddress) => void;
}

export const AddressSheet: React.FC<AddressSheetProps> = ({
  isOpen,
  zones,
  currentAddress,
  onClose,
  onSave,
}) => {
  const [zoneId, setZoneId] = useState(currentAddress.zoneId);
  const [streetDetails, setStreetDetails] = useState(currentAddress.streetDetails);
  const [buildingNumber, setBuildingNumber] = useState(currentAddress.buildingNumber);
  const [floor, setFloor] = useState(currentAddress.floor);
  const [apartment, setApartment] = useState(currentAddress.apartment);
  const [lat, setLat] = useState<number | null>(currentAddress.lat);
  const [lng, setLng] = useState<number | null>(currentAddress.lng);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(currentAddress.gpsAccuracy);

  useEffect(() => {
    if (isOpen) {
      setZoneId(currentAddress.zoneId || zones[0]?.id || '');
      setStreetDetails(currentAddress.streetDetails);
      setBuildingNumber(currentAddress.buildingNumber);
      setFloor(currentAddress.floor);
      setApartment(currentAddress.apartment);
      setLat(currentAddress.lat);
      setLng(currentAddress.lng);
      setGpsAccuracy(currentAddress.gpsAccuracy);
    }
  }, [isOpen, currentAddress, zones]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const chosenZone = zones.find((z) => z.id === zoneId) ?? zones[0];
    onSave({
      zoneId: chosenZone?.id ?? '',
      area: chosenZone?.name ?? currentAddress.area,
      streetDetails: streetDetails.trim(),
      buildingNumber: buildingNumber.trim(),
      floor: floor.trim(),
      apartment: apartment.trim(),
      lat,
      lng,
      gpsAccuracy,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="تحديد عنوان التوصيل والموقع الدقيق"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-2xl bg-white rounded-t-3xl md:rounded-3xl border border-[#DCE6DE] shadow-xl p-5 space-y-5 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#EDF3EE] text-[#15803D] flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0F2417]">عنوان التوصيل والموقع الدقيق</h2>
              <p className="text-xs text-[#4A6353]">اختر منطقة التوصيل وحدد موقعك على الخريطة بدقة</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة العنوان"
            className="min-w-[44px] min-h-[44px] rounded-xl text-[#4A6353] hover:bg-[#EDF3EE] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#0F2417] mb-2">
              مناطق التوصيل المتاحة (ورسوم التوصيل)
            </label>
            {zones.length === 0 ? (
              <p className="text-xs text-[#9A3412] bg-amber-50 border border-amber-200 rounded-xl p-3">
                لا توجد مناطق توصيل مفعّلة حاليًا من إدارة السوبر ماركت.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {zones.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setZoneId(z.id)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium text-right border transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                      zoneId === z.id
                        ? 'bg-[#15803D] text-white border-[#15803D]'
                        : 'bg-[#F8FAF8] text-[#0F2417] border-[#DCE6DE] hover:border-[#15803D]'
                    }`}
                  >
                    <span className="truncate font-bold">{z.name}</span>
                    <span className="tabular-nums shrink-0 opacity-90">{z.deliveryFee} ج.م</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <LocationPickerMap
            lat={lat}
            lng={lng}
            gpsAccuracy={gpsAccuracy}
            onChange={(coords) => {
              setLat(coords.lat);
              setLng(coords.lng);
              setGpsAccuracy(coords.gpsAccuracy);
            }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="sheet-street" className="block text-xs font-bold text-[#0F2417] mb-1">
                اسم الشارع والعلامة المميزة
              </label>
              <input
                id="sheet-street"
                type="text"
                value={streetDetails}
                onChange={(e) => setStreetDetails(e.target.value)}
                placeholder="مثال: شارع 9، بجوار الصيدلية"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] bg-white text-sm text-[#0F2417] focus:outline-2 focus:outline-[#15803D]"
              />
            </div>
            <div>
              <label htmlFor="sheet-building" className="block text-xs font-bold text-[#0F2417] mb-1">
                رقم العمارة / المنزل
              </label>
              <input
                id="sheet-building"
                type="text"
                value={buildingNumber}
                onChange={(e) => setBuildingNumber(e.target.value)}
                placeholder="مثال: 14"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] bg-white text-sm text-[#0F2417] focus:outline-2 focus:outline-[#15803D]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="sheet-floor" className="block text-xs font-bold text-[#0F2417] mb-1">
                  الدور
                </label>
                <input
                  id="sheet-floor"
                  type="text"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  placeholder="3"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] bg-white text-sm text-[#0F2417] focus:outline-2 focus:outline-[#15803D]"
                />
              </div>
              <div>
                <label htmlFor="sheet-apt" className="block text-xs font-bold text-[#0F2417] mb-1">
                  الشقة
                </label>
                <input
                  id="sheet-apt"
                  type="text"
                  value={apartment}
                  onChange={(e) => setApartment(e.target.value)}
                  placeholder="12"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#DCE6DE] bg-white text-sm text-[#0F2417] focus:outline-2 focus:outline-[#15803D]"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full min-h-[48px] rounded-xl bg-[#15803D] text-white font-bold text-sm hover:bg-[#166534] active:scale-[0.98] transition-all cursor-pointer"
          >
            حفظ الموقع وعنوان التوصيل
          </button>
        </form>
      </div>
    </div>
  );
};
