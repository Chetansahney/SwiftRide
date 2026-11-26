import { useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

// Two taps to cancel, so a ride isn't cancelled by a stray touch.
export default function CancelRideButton({ onConfirm, label = 'ride.cancel', question = 'ride.cancelConfirm', yes = 'ride.cancelYes', no = 'ride.keep', dark = false }) {
    const { t } = useLanguage();
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);

    if (!asking) {
        return (
            <button
                type="button"
                onClick={() => setAsking(true)}
                className={`flex h-12 items-center justify-center gap-2 rounded-[14px] text-sm font-semibold ${dark ? 'bg-night-card text-[#FF8A8F]' : 'bg-paper text-signal'}`}
            >
                <X size={18} aria-hidden="true" />
                {t(label)}
            </button>
        );
    }

    return (
        <div role="alertdialog" aria-label={t(question)} className={`flex flex-col gap-2 rounded-[14px] p-3 ${dark ? 'bg-night-card' : 'bg-signal/10'}`}>
            <p className={`text-sm font-medium ${dark ? 'text-white' : 'text-ink'}`}>{t(question)}</p>
            <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setAsking(false)} className={`h-12 rounded-xl text-sm font-semibold ${dark ? 'bg-night text-white' : 'bg-white ring-1 ring-line'}`}>
                    {t(no)}
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                        setBusy(true);
                        try {
                            await onConfirm();
                        } finally {
                            setBusy(false);
                            setAsking(false);
                        }
                    }}
                    className="h-12 rounded-xl bg-signal text-sm font-semibold text-white disabled:opacity-60"
                >
                    {t(yes)}
                </button>
            </div>
        </div>
    );
}
