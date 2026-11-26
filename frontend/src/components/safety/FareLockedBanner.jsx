import { Lock } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatFare } from '../../lib/config';

// Shown at pickup on both apps, in each person's own language, so there's no
// room to "discuss" the fare in person.
export default function FareLockedBanner({ fare, role = 'rider', dark = false }) {
    const { t } = useLanguage();
    if (!fare && fare !== 0) return null;
    return (
        <div className={`flex items-start gap-3 rounded-2xl px-4 py-3 ${dark ? 'bg-night-card text-white' : 'bg-ink text-white'}`} role="note">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-volt text-ink" aria-hidden="true">
                <Lock size={18} />
            </span>
            {role === 'captain' ? (
                <p className="text-sm font-semibold leading-snug">{t('captain.fareLocked', { fare: formatFare(fare) })}</p>
            ) : (
                <div className="flex flex-col gap-0.5">
                    <strong className="text-[15px] font-semibold">{t('fare.lockedTitle', { fare: formatFare(fare) })}</strong>
                    <span className="text-[13px] leading-snug text-[#B4B8C0]">{t('fare.lockedBody')}</span>
                </div>
            )}
        </div>
    );
}
