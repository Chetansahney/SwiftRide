import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { House, TriangleAlert } from 'lucide-react';
import UserRouteMap from '../components/UserRouteMap';
import RouteSummary from '../components/RouteSummary';
import VehicleArt from '../components/ui/VehicleArt';
import NumberPlate from '../components/ui/NumberPlate';
import FareSplit from '../components/ui/FareSplit';
import { useLanguage } from '../i18n/LanguageContext';
import { formatFare, vehicleMeta } from '../lib/config';

const Riding = () => {
    const { t } = useLanguage();
    const [ride, setRide] = useState(null);
    const [selectedVehicle, setSelectedVehicle] = useState('car');
    const [isPaying, setIsPaying] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const rideData = localStorage.getItem('activeRide');
        if (rideData) {
            try {
                setRide(JSON.parse(rideData));
            } catch (error) {
                console.error('Failed to parse activeRide:', error);
            }
        }
        const storedVehicle = localStorage.getItem('selectedVehicle');
        if (storedVehicle) setSelectedVehicle(storedVehicle);
    }, []);

    const captain = ride?.captain;
    const captainName = [captain?.name?.firstname, captain?.name?.lastname].filter(Boolean).join(' ') || t('ride.driver');
    const vehicle = captain?.vehicle || {};
    const meta = vehicleMeta(vehicle.vehicleType || selectedVehicle);
    const vehicleLabel = [vehicle.color, vehicle.model].filter(Boolean).join(' ') || t(meta.nameKey);

    const pay = async () => {
        if (!ride?._id || isPaying) return;
        const token = localStorage.getItem('userToken');
        if (!token) return;
        setIsPaying(true);
        try {
            await axios.post(
                `${import.meta.env.VITE_BASE_URL}/rides/complete-payment`,
                { rideId: ride._id },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            localStorage.removeItem('activeRide');
            navigate('/home');
        } catch (error) {
            console.error('Payment failed:', error.response?.data || error.message);
        } finally {
            setIsPaying(false);
        }
    };

    return (
        <div className="relative flex h-full flex-col overflow-hidden bg-[#EEF0F2]">
            <div className="relative h-[42%] min-h-[240px] w-full shrink-0">
                <UserRouteMap destination={ride?.destination} />
                <div className="absolute inset-x-5 top-6 flex justify-between">
                    <a
                        href="tel:112"
                        className="flex h-12 items-center gap-2 rounded-full bg-signal px-4 text-sm font-semibold text-white shadow-float"
                    >
                        <TriangleAlert size={18} aria-hidden="true" />
                        {t('ride.sos')}
                    </a>
                    <Link
                        to="/home"
                        aria-label="Home"
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink shadow-float"
                    >
                        <House size={20} aria-hidden="true" />
                    </Link>
                </div>
            </div>

            <div className="sheet relative z-10 -mt-7 mx-auto flex w-full max-w-xl flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-7 pt-3">
                <span className="sheet-handle" aria-hidden="true" />

                <div className="flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white" aria-live="polite">
                    <span className="relative flex h-3 w-3" aria-hidden="true">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-volt" />
                    </span>
                    <div>
                        <strong className="block text-[15px] font-semibold">{t('ride.started')}</strong>
                        <span className="text-xs text-[#B4B8C0]">{t('ride.startedSub')}</span>
                    </div>
                </div>

                <div className="flex items-center gap-3 rounded-2xl bg-paper p-3">
                    <VehicleArt art={meta.art} width={80} />
                    <div className="flex min-w-0 flex-col items-start gap-1">
                        <NumberPlate plate={vehicle.plate} />
                        <span className="truncate text-[13px] text-muted">
                            {captainName} · {vehicleLabel}
                        </span>
                    </div>
                </div>

                <RouteSummary pickup={ride?.origin} destination={ride?.destination} />

                <div className="flex items-center justify-between px-1">
                    <span className="text-sm text-muted">{t('ride.total')}</span>
                    <strong className="font-display text-2xl font-semibold">{formatFare(ride?.fare)}</strong>
                </div>
                <FareSplit fare={ride?.fare} />

                <button type="button" onClick={pay} disabled={isPaying || !ride?._id} className="btn-volt mt-auto">
                    {isPaying ? t('ride.paying') : t('ride.pay', { fare: formatFare(ride?.fare) })}
                </button>
            </div>
        </div>
    );
};

export default Riding;
