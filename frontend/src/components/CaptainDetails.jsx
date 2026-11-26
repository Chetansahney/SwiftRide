import React, { useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { BadgeCheck, ChevronRight, Clock, Power, ShieldAlert, ShieldCheck } from 'lucide-react';
import { CaptainDataContext } from '../context/CaptainContext';
import VehicleArt from './ui/VehicleArt';
import NumberPlate from './ui/NumberPlate';
import ShiftSelfieGate from './captain/ShiftSelfieGate';
import CaptainSafetySettings from './captain/CaptainSafetySettings';
import { useLanguage } from '../i18n/LanguageContext';
import { vehicleMeta } from '../lib/config';
import { API, captainAuth } from '../lib/api';

const CaptainDetails = () => {
    const { t } = useLanguage();
    const { captain, setCaptain } = useContext(CaptainDataContext);
    const [error, setError] = useState(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [verification, setVerification] = useState(null);

    // Verification + this shift window's face check. Re-checks when the window ends.
    useEffect(() => {
        let cancelled = false;
        let timer;
        const load = () =>
            axios
                .get(`${API}/captains/verification`, captainAuth())
                .then(({ data }) => {
                    if (cancelled) return;
                    setVerification(data.verification);
                    const msLeft = new Date(data.verification.shift.endsAt).getTime() - Date.now();
                    timer = setTimeout(load, Math.max(5000, msLeft + 2000));
                })
                .catch((fetchError) => console.error('Verification fetch failed:', fetchError));
        load();
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, []);

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
    const status = verification?.status;
    const shift = verification?.shift;
    const strikes = captain?.strikes || 0;
    const stats = [
        { label: t('captain.hours'), value: captain?.stats?.hoursOnline ?? '--' },
        { label: t('captain.rides'), value: captain?.stats?.totalRides ?? '--' },
        { label: t('captain.rating'), value: captain?.stats?.rating ?? '--' },
    ];

    return (
        <div className="flex flex-col gap-3.5">
            {captain?.suspended ? (
                <div className="flex items-start gap-3 rounded-[18px] bg-signal/20 p-4" role="alert">
                    <ShieldAlert size={22} className="shrink-0 text-[#FF8A8F]" aria-hidden="true" />
                    <span className="text-sm font-semibold leading-snug">{t('captain.suspended')}</span>
                </div>
            ) : !verification ? null : status === 'in_review' ? (
                <div className="flex items-start gap-3 rounded-[18px] bg-night-card p-4" role="status">
                    <Clock size={22} className="shrink-0 text-volt" aria-hidden="true" />
                    <span className="text-sm font-semibold leading-snug">{t('verify.bannerReview')}</span>
                </div>
            ) : status !== 'verified' ? (
                <Link to="/captain/verify" className="flex min-h-16 items-center gap-3 rounded-[18px] bg-volt p-4 text-ink">
                    <ShieldCheck size={24} className="shrink-0" aria-hidden="true" />
                    <strong className="flex-1 text-base font-semibold leading-snug">{t('verify.banner')}</strong>
                    <ChevronRight size={22} aria-hidden="true" />
                </Link>
            ) : shift.status !== 'verified' ? (
                <ShiftSelfieGate key={shift.windowId} shift={shift} onUpdate={setVerification} />
            ) : (
                <div className="flex h-16 items-center justify-between rounded-[18px] bg-volt pl-5 pr-2.5 text-ink" role="status">
                    <span className="flex flex-col">
                        <strong className="font-display text-lg font-semibold">{t('captain.online')}</strong>
                        <span className="inline-flex items-center gap-1 text-xs font-medium">
                            <BadgeCheck size={13} aria-hidden="true" />
                            {t('shift.verified', { window: shift.label })}
                        </span>
                    </span>
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-volt" aria-hidden="true">
                        <Power size={20} />
                    </span>
                </div>
            )}

            {strikes > 0 && !captain?.suspended ? (
                <p className="rounded-[14px] bg-night-card px-4 py-2.5 text-xs font-semibold text-[#FFB4B7]">{t('captain.strikes', { count: strikes })}</p>
            ) : null}

            <div className="flex items-center gap-3 rounded-[18px] bg-night-card p-3">
                <VehicleArt art={meta.art} width={76} className="rounded-xl bg-paper p-1" />
                <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <strong className="truncate text-base font-semibold">{displayName}</strong>
                    <NumberPlate plate={vehicle.plate} />
                </div>
                <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    aria-label={t('captain.safetySettings')}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-night text-white"
                >
                    <ShieldCheck size={20} aria-hidden="true" />
                </button>
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

            {settingsOpen ? <CaptainSafetySettings open onClose={() => setSettingsOpen(false)} /> : null}
        </div>
    );
};

export default CaptainDetails;
