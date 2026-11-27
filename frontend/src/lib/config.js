// Product switches for the new UI.
//
// rideGuarantee: shows the "₹50 back if your driver cancels" promise. Only on
//   because the backend really issues that credit (cancelRide in
//   Backend/services/ride.services.js) and spends it at the next payment.
// fareSplit: shows the "Where your fare goes" bar. The split is computed on the
//   client from FARE_SPLIT below until the backend stores a real breakdown.
export const FEATURES = {
    rideGuarantee: true,
    fareSplit: true,
};

export const FARE_SPLIT = {
    platformRate: 0.13,
    gstRate: 0.05,
};

// Who gets what from a fare. With the backend's breakdown, SwiftRide's fee and
// GST come only from the ride part — return-trip fee, night charge, waiting
// charge and tip all go to the driver.
export function fareBreakdown(fare, breakdown) {
    const total = Number(fare);
    if (!Number.isFinite(total) || total <= 0) {
        return null;
    }
    const ridePart = Number(breakdown?.ride) > 0 ? Number(breakdown.ride) : total;
    const platform = Math.round(ridePart * FARE_SPLIT.platformRate);
    const gst = Math.round(ridePart * FARE_SPLIT.gstRate);
    return {
        total,
        driver: total - platform - gst,
        platform,
        gst,
        returnFee: Number(breakdown?.returnFee) || 0,
        nightFee: Number(breakdown?.nightFee) || 0,
        waitingFee: Number(breakdown?.waitingFee) || 0,
        tip: Number(breakdown?.tip) || 0,
    };
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

// Per-minute waiting charge after the 3 free minutes (mirrors the backend).
export const WAIT_PER_MIN = { moto: 1, auto: 1.5, car: 2 };
export const FREE_WAIT_MIN = 3;

// 10 pm – 6 am India time.
export function isNightInIndia(date = new Date()) {
    const istHour = (date.getUTCHours() + 5.5 + date.getUTCMinutes() / 60) % 24;
    return istHour >= 22 || istHour < 6;
}

// The "share your trip" nudge starts at 9 pm.
export function isLateEvening(date = new Date()) {
    const istHour = (date.getUTCHours() + 5.5 + date.getUTCMinutes() / 60) % 24;
    return istHour >= 21 || istHour < 6;
}

// Indian mobile numbers, as the backend stores them: 10 digits starting 6–9.
// "+91 98765 43210" / "098765 43210" → "9876543210"
export const normalizePhone = (value) => String(value ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
export const isIndianMobile = (value) => /^[6-9]\d{9}$/.test(normalizePhone(value));
export const telLink = (phone) => `tel:+91${normalizePhone(phone)}`;

// Contact details shown on the Help, Terms and Privacy pages. Set them in the
// frontend's environment (Vercel → Settings → Environment Variables); until
// then the pages show a visible "To be added" placeholder.
export const SUPPORT = {
    company: import.meta.env.VITE_COMPANY_NAME || '',
    address: import.meta.env.VITE_COMPANY_ADDRESS || '',
    email: import.meta.env.VITE_SUPPORT_EMAIL || '',
    phone: import.meta.env.VITE_SUPPORT_PHONE || '',
    grievanceName: import.meta.env.VITE_GRIEVANCE_OFFICER || '',
    grievanceEmail: import.meta.env.VITE_GRIEVANCE_EMAIL || '',
    // The city whose courts handle disputes (Terms of Use).
    city: import.meta.env.VITE_LEGAL_CITY || '',
};
