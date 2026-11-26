import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Clock, MapPinCheck, X } from 'lucide-react';
import FareLockedBanner from './safety/FareLockedBanner';
import RouteSummary from './RouteSummary';
import { useLanguage } from '../i18n/LanguageContext';
import { FREE_WAIT_MIN, WAIT_PER_MIN, formatFare } from '../lib/config';
import { captainPost } from '../lib/api';

const ConfirmRidePopUp = (props) => {
    const { t } = useLanguage();
    const [otp, setOtp] = useState('');
    const [otpError, setOtpError] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [verified, setVerified] = useState(false);
    const riderName = props.ride?.user?.name?.firstname || t('captain.rider');
    const [arrivedAt, setArrivedAt] = useState(props.ride?.arrivedAt || null);
    const [now, setNow] = useState(() => Date.now());
    const [arriving, setArriving] = useState(false);

    useEffect(() => {
        if (!arrivedAt) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [arrivedAt]);

    const waitedSec = arrivedAt ? Math.max(0, Math.floor((now - new Date(arrivedAt).getTime()) / 1000)) : 0;
    const perMin = WAIT_PER_MIN[props.ride?.vehicleType] || WAIT_PER_MIN.car;
    const waitingFee = Math.min(60, Math.round(Math.max(0, Math.floor(waitedSec / 60 - FREE_WAIT_MIN)) * perMin));

    const markArrived = async () => {
        if (!props.ride?._id) return;
        setArriving(true);
        try {
            const response = await captainPost('/rides/arrived', { rideId: props.ride._id });
            setArrivedAt(response.data?.ride?.arrivedAt || new Date().toISOString());
        } catch {
            // keep the button so they can try again
        } finally {
            setArriving(false);
        }
    };

    const verify = async () => {
        const otpValue = String(otp || '').trim();
        if (!props.ride?._id || otpValue.length !== 4) {
            setOtpError(t('captain.pinInvalid'));
            return;
        }
        setIsVerifying(true);
        setOtpError('');
        try {
            const token = localStorage.getItem('captainToken');
            await axios.post(
                `${import.meta.env.VITE_BASE_URL}/rides/start-ride`,
                { rideId: props.ride._id, otp: otpValue },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setVerified(true);
        } catch (error) {
            setOtpError(error.response?.data?.error || t('captain.pinFailed'));
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-semibold">{t('captain.tripDetails')}</h3>
                <button
                    type="button"
                    onClick={() => props.setconfirmRidePopUp(false)}
                    aria-label={t('captain.cancel')}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-night-card"
                >
                    <X size={20} aria-hidden="true" />
                </button>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-night-card px-4 py-3">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-paper font-display font-semibold text-ink" aria-hidden="true">
                        {riderName.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="flex flex-col">
                        <strong className="text-[15px] font-semibold">{riderName}</strong>
                        <span className="text-xs text-night-muted">{t('ride.payCash')}</span>
                    </div>
                </div>
                <strong className="font-display text-xl font-semibold">{formatFare(props.ride?.fare)}</strong>
            </div>

            <FareLockedBanner fare={props.ride?.fare} role="captain" dark />

            {arrivedAt ? (
                <div className="flex items-center gap-3 rounded-2xl bg-night-card px-4 py-3" role="status">
                    <Clock size={20} className="text-volt" aria-hidden="true" />
                    <span className="text-sm font-semibold">
                        {t('captain.waiting', { time: `${Math.floor(waitedSec / 60)}:${String(waitedSec % 60).padStart(2, '0')}` })}
                        {waitingFee > 0 ? ` · ${t('captain.waitingCharge', { fee: formatFare(waitingFee) })}` : ''}
                    </span>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={markArrived}
                    disabled={arriving}
                    className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-volt text-base font-semibold text-volt disabled:opacity-60"
                >
                    <MapPinCheck size={20} aria-hidden="true" />
                    {arriving ? t('loading') : t('captain.arrived')}
                </button>
            )}

            <div className="rounded-2xl bg-night-card p-4">
                <label htmlFor="ride-pin" className="mb-2 block text-sm font-semibold">
                    {t('captain.enterPin')}
                </label>
                <div className="flex gap-2.5">
                    <input
                        id="ride-pin"
                        value={otp}
                        onChange={(e) => {
                            setOtp(e.target.value.replace(/\D/g, '').slice(0, 4));
                            setOtpError('');
                        }}
                        className="h-14 min-w-0 flex-1 rounded-[14px] bg-night px-4 text-center font-display text-2xl font-semibold tracking-[0.5em] text-white outline-none ring-1 ring-night-edge focus:ring-2 focus:ring-volt"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={4}
                        placeholder="····"
                    />
                    <button
                        type="button"
                        onClick={verify}
                        disabled={isVerifying || verified}
                        className={`h-14 rounded-[14px] px-5 text-sm font-semibold ${verified ? 'bg-volt text-ink' : 'bg-white text-ink'} disabled:opacity-80`}
                    >
                        {verified ? '✓' : isVerifying ? t('captain.verifying') : t('captain.verify')}
                    </button>
                </div>
                {otpError ? (
                    <p className="mt-2 text-xs text-[#FF8A8F]" role="alert">
                        {otpError}
                    </p>
                ) : null}
            </div>

            <RouteSummary pickup={props.ride?.origin} destination={props.ride?.destination} dark />

            <div className="flex gap-2.5">
                <button
                    type="button"
                    onClick={() => {
                        props.setconfirmRidePopUp(false);
                        props.setRidePopUp(false);
                    }}
                    className="h-14 rounded-2xl border border-night-edge px-5 text-sm font-medium text-white"
                >
                    {t('captain.cancel')}
                </button>
                <Link
                    to="/captain-riding"
                    onClick={() => {
                        props.setconfirmRidePopUp(false);
                        props.setRidePopUp(false);
                    }}
                    className="flex h-14 flex-1 items-center justify-center rounded-2xl bg-volt text-base font-semibold text-ink active:scale-[0.98]"
                >
                    {t('captain.goPickup')}
                </Link>
            </div>
        </div>
    );
};

export default ConfirmRidePopUp;
