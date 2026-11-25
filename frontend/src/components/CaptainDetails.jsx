import React, { useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { Power } from 'lucide-react';
import { CaptainDataContext } from '../context/CaptainContext';
import VehicleArt from './ui/VehicleArt';
import NumberPlate from './ui/NumberPlate';
import { useLanguage } from '../i18n/LanguageContext';
import { vehicleMeta } from '../lib/config';

const CaptainDetails = () => {
    const { t } = useLanguage();
    const { captain, setCaptain } = useContext(CaptainDataContext);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (captain) return undefined;
        const token = localStorage.getItem('captainToken');
        if (!token) return undefined;
        const controller = new AbortController();
        axios
            .get(`${import.meta.env.VITE_BASE_URL}/captains/profile`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
            })
            .then((response) => {
                if (response.status === 200) setCaptain(response.data.captain);
            })
            .catch((fetchError) => {
                if (fetchError.code === 'ERR_CANCELED') return;
                console.error('Captain profile fetch failed:', fetchError);
                setError('Unable to load captain details.');
            });
        return () => controller.abort();
    }, [captain, setCaptain]);

    const displayName = [captain?.name?.firstname, captain?.name?.lastname].filter(Boolean).join(' ') || 'Captain';
    const vehicle = captain?.vehicle || {};
    const meta = vehicleMeta(vehicle.vehicleType || 'car');
    const stats = [
        { label: t('captain.hours'), value: captain?.stats?.hoursOnline ?? '--' },
        { label: t('captain.rides'), value: captain?.stats?.totalRides ?? '--' },
        { label: t('captain.rating'), value: captain?.stats?.rating ?? '--' },
    ];

    return (
        <div className="flex flex-col gap-3.5">
            <div className="flex h-16 items-center justify-between rounded-[18px] bg-volt pl-5 pr-2.5 text-ink" role="status">
                <span className="flex flex-col">
                    <strong className="font-display text-lg font-semibold">{t('captain.online')}</strong>
                    <span className="text-xs font-medium">{t('captain.onlineSub')}</span>
                </span>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-volt" aria-hidden="true">
                    <Power size={20} />
                </span>
            </div>

            <div className="flex items-center gap-3 rounded-[18px] bg-night-card p-3">
                <VehicleArt art={meta.art} width={76} className="rounded-xl bg-paper p-1" />
                <div className="flex min-w-0 flex-col items-start gap-1">
                    <strong className="truncate text-base font-semibold">{displayName}</strong>
                    <NumberPlate plate={vehicle.plate} />
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {stats.map((stat) => (
                    <div key={stat.label} className="flex flex-col gap-1 rounded-[18px] bg-night-card p-3">
                        <span className="text-[11px] text-night-muted">{stat.label}</span>
                        <strong className="font-display text-xl font-semibold">{stat.value}</strong>
                    </div>
                ))}
            </div>

            {error ? <p className="text-xs text-[#FF8A8F]">{error}</p> : null}
        </div>
    );
};

export default CaptainDetails;
