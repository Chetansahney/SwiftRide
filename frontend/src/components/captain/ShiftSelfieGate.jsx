import { useState } from 'react';
import axios from 'axios';
import { Camera, Clock } from 'lucide-react';
import FaceCapture from './FaceCapture';
import { useLanguage } from '../../i18n/LanguageContext';
import { API, captainAuth } from '../../lib/api';
import { STEP_PROMPTS } from '../../lib/faceSteps';

// Face check at the start of each shift window (6 AM–2 PM, 2 PM–10 PM,
// 10 PM–6 AM): two live photos — straight, then a random action the server
// picks — matched against the captain's verified face. Riders see the photo.
export default function ShiftSelfieGate({ shift, onUpdate }) {
    const { t } = useLanguage();
    const [challenge, setChallenge] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const inReview = shift.status === 'in_review';
    const failedStep = shift.reason?.startsWith('liveness_') ? shift.reason.slice('liveness_'.length) : null;
    const message =
        error ||
        (shift.status === 'rejected' ? (STEP_PROMPTS[failedStep] ? t('verify.failedAt', { step: t(STEP_PROMPTS[failedStep]) }) : t('shift.mismatch')) : null);

    const begin = async () => {
        setError(null);
        try {
            const { data } = await axios.post(`${API}/captains/liveness-challenge`, { purpose: 'shift' }, captainAuth());
            setChallenge(data);
        } catch {
            setError(t('shift.unavailable'));
        }
    };

    const submit = async (frames, capture) => {
        setBusy(true);
        setError(null);
        try {
            const { data } = await axios.post(`${API}/captains/shift-selfie`, { frames, capture, challengeId: challenge?.challengeId }, captainAuth());
            onUpdate(data.verification);
        } catch (err) {
            const { status, data } = err.response || {};
            if (data?.verification) onUpdate(data.verification);
            if (status === 503) setError(t('shift.unavailable'));
            else if (data?.reason && data.reason !== 'review') setError(t(`verify.reason.${data.reason}`));
            else if (!data?.verification) setError(t('captain.selfieFailed'));
        } finally {
            setBusy(false);
            setChallenge(null);
        }
    };

    return (
        <div className="flex flex-col gap-3 rounded-[18px] bg-night-card p-4">
            <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-volt text-ink" aria-hidden="true">
                    {inReview ? <Clock size={26} /> : <Camera size={26} />}
                </span>
                <div className="flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-volt">{t('shift.window', { window: shift.label })}</span>
                    <strong className="font-display text-lg font-semibold">{t('shift.title')}</strong>
                    <span className="text-xs leading-snug text-night-muted">{inReview ? t('shift.review') : t('shift.steps')}</span>
                </div>
            </div>

            {busy ? (
                <p role="status" className="text-sm font-medium text-white">
                    {t('verify.checking')}
                </p>
            ) : challenge ? (
                <FaceCapture key={challenge.challengeId} dark autoStart steps={challenge.steps} onDone={submit} />
            ) : !inReview ? (
                <button type="button" onClick={begin} className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-volt text-base font-semibold text-ink">
                    <Camera size={20} aria-hidden="true" />
                    {t('shift.start')}
                </button>
            ) : null}

            {message && !busy ? (
                <p role="alert" className="text-sm text-[#FF8A8F]">
                    {message}
                </p>
            ) : null}
        </div>
    );
}
