import React, { useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import RouteSummary from './RouteSummary';
import { useLanguage } from '../i18n/LanguageContext';
import { formatFare } from '../lib/config';

const ConfirmRidePopUp = (props) => {
    const { t } = useLanguage();
    const [otp, setOtp] = useState('');
    const [otpError, setOtpError] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [verified, setVerified] = useState(false);
    const riderName =
        [props.ride?.user?.name?.firstname, props.ride?.user?.name?.lastname].filter(Boolean).join(' ') || t('captain.rider');

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
