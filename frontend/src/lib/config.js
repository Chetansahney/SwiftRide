// Product switches for the new UI.
//
// rideGuarantee: shows the "₹50 back if your driver cancels" promise. Keep this
//   off until the backend actually issues guarantee credits — otherwise the app
//   promises riders money it can't pay.
// fareSplit: shows the "Where your fare goes" bar. The split is computed on the
//   client from FARE_SPLIT below until the backend stores a real breakdown.
export const FEATURES = {
    rideGuarantee: false,
    fareSplit: true,
};

export const FARE_SPLIT = {
    platformRate: 0.13,
    gstRate: 0.05,
};

export function fareBreakdown(fare) {
    const total = Number(fare);
    if (!Number.isFinite(total) || total <= 0) {
        return null;
    }
    const platform = Math.round(total * FARE_SPLIT.platformRate);
    const gst = Math.round(total * FARE_SPLIT.gstRate);
    return { total, driver: total - platform - gst, platform, gst };
}

export const formatFare = (value) => (value || value === 0 ? `₹${value}` : '₹--');

// The backend's fare keys are moto / auto / car; captains can also register as "bike".
export const VEHICLES = [
    { key: 'moto', art: 'bike', nameKey: 'vehicle.moto', noteKey: 'vehicle.motoNote' },
    { key: 'auto', art: 'auto', nameKey: 'vehicle.auto', noteKey: 'vehicle.autoNote' },
    { key: 'car', art: 'cab', nameKey: 'vehicle.car', noteKey: 'vehicle.carNote' },
];

export function vehicleMeta(type) {
    const key = type === 'bike' ? 'moto' : type;
    return VEHICLES.find((vehicle) => vehicle.key === key) || VEHICLES[2];
}

export const shortPlace = (place) => (place ? String(place).split(',')[0].trim() : '');

// 180 → "200 m", 1340 → "1.3 km"
export function formatDistance(meters) {
    const value = Number(meters);
    if (!Number.isFinite(value)) return '';
    if (value < 1000) return `${Math.max(50, Math.round(value / 50) * 50)} m`;
    return `${(value / 1000).toFixed(1)} km`;
}

export const isCoordinatePair = (value) => /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(String(value || ''));
