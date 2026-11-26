import { useRef, useState } from 'react';
import axios from 'axios';
import { Camera, Clock } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { API, captainAuth } from '../../lib/api';
import { compressFile } from '../../lib/images';

// Face check at the start of each shift window (6 AM–2 PM, 2 PM–10 PM,
// 10 PM–6 AM). The selfie is matched against the captain's verified face;
// riders see it on the ride card.
export default function ShiftSelfieGate({ shift, onUpdate }) {
    const { t } = useLanguage();
    const inputRef = useRef(null);
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const inReview = shift.status === 'in_review';
    const message = error || (shift.status === 'rejected' ? t('shift.mismatch') : null);

    const handleFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setBusy(true);
        setError(null);
        try {
            const image = await compressFile(file);
            setPreview(image);
            const { data } = await axios.post(`${API}/captains/shift-selfie`, { image }, captainAuth());
            onUpdate(data.verification);
        } catch (err) {
            const { status, data } = err.response || {};
            if (data?.verification) onUpdate(data.verification);
            if (status === 503) setError(t('shift.unavailable'));
            else if (data?.reason && data.reason !== 'review') setError(t(`verify.reason.${data.reason}`));
            else if (!data?.verification) setError(t('captain.selfieFailed'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-3 rounded-[18px] bg-night-card p-4">
            <div className="flex items-center gap-3">
                {preview ? (
                    <img src={preview} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-volt text-ink" aria-hidden="true">
                        {inReview ? <Clock size={26} /> : <Camera size={26} />}
                    </span>
                )}
                <div className="flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-volt">{t('shift.window', { window: shift.label })}</span>
                    <strong className="font-display text-lg font-semibold">{t('shift.title')}</strong>
                    <span className="text-xs leading-snug text-night-muted">{inReview ? t('shift.review') : t('shift.body')}</span>
                </div>
            </div>
            {!inReview ? (
                <>
                    <input ref={inputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleFile} />
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={busy}
                        className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-volt text-base font-semibold text-ink disabled:opacity-60"
                    >
                        <Camera size={20} aria-hidden="true" />
                        {busy ? t('verify.checking') : t('captain.selfieButton')}
                    </button>
                </>
            ) : null}
            {message ? (
                <p role="alert" className="text-sm text-[#FF8A8F]">
                    {message}
                </p>
            ) : null}
        </div>
    );
}
