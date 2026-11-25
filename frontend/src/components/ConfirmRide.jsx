import React, { useState } from 'react';
import { ChevronLeft, Wallet } from 'lucide-react';
import VehicleArt from './ui/VehicleArt';
import RouteSummary from './RouteSummary';
import { useLanguage } from '../i18n/LanguageContext';
import { formatFare, vehicleMeta } from '../lib/config';

const ConfirmRide = ({
    setConfirmRidePanel,
    setVehiclePanel,
    setLookingForDriverPanel,
    pickup,
    destination,
    fare,
    distanceTime,
    selectedVehicle,
    createRide,
}) => {
    const { t } = useLanguage();
    const [isBooking, setIsBooking] = useState(false);
    const vehicle = vehicleMeta(selectedVehicle);
    const rideFare = fare?.[selectedVehicle];

    const handleConfirm = async () => {
        setIsBooking(true);
        const ride = await createRide(selectedVehicle);
        setIsBooking(false);
        if (!ride) return;
        setLookingForDriverPanel(true);
        setConfirmRidePanel(false);
        setVehiclePanel(false);
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="relative flex items-center justify-center">
                <button
                    type="button"
                    onClick={() => {
                        setConfirmRidePanel(false);
                        setVehiclePanel(true);
                    }}
                    aria-label="Back"
                    className="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full bg-paper"
                >
                    <ChevronLeft size={22} aria-hidden="true" />
                </button>
                <span className="sheet-handle" aria-hidden="true" />
            </div>

            <h2 className="font-display text-[22px] font-semibold tracking-tight">{t('ride.confirmTitle')}</h2>

            <div className="flex items-center gap-4 rounded-2xl bg-paper p-3">
                <VehicleArt art={vehicle.art} width={96} />
                <div className="flex flex-col">
                    <strong className="text-base font-semibold">{t(vehicle.nameKey)}</strong>
                    <span className="text-xs text-muted">{t(vehicle.noteKey)}</span>
                    {distanceTime?.duration ? <span className="text-xs text-muted">{distanceTime.duration}</span> : null}
                </div>
                <span className="ml-auto font-display text-2xl font-semibold">{formatFare(rideFare)}</span>
            </div>

            <RouteSummary pickup={pickup} destination={destination} />

            <div className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3 text-sm">
                <Wallet size={20} aria-hidden="true" />
                {t('ride.payCash')}
            </div>

            <button type="button" onClick={handleConfirm} disabled={isBooking} className="btn-primary">
                {isBooking ? t('loading') : t('ride.confirm')}
            </button>
        </div>
    );
};

export default ConfirmRide;
