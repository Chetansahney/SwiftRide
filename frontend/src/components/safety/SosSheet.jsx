import { useState } from 'react';
import { BellOff, Phone, Share2 } from 'lucide-react';
import BottomSheet from '../ui/BottomSheet';
import { useLanguage } from '../../i18n/LanguageContext';
import { captainPost, currentPosition, riderPost } from '../../lib/api';

// Emergency options: call 112, alert trusted contacts, or a silent alert to the
// SwiftRide safety team that changes nothing visible on screen.
export default function SosSheet({ open, onClose, ride, role = 'rider', onShareWithContacts, dark = false }) {
    const { t } = useLanguage();
    const [silentSent, setSilentSent] = useState(false);
    const post = role === 'captain' ? captainPost : riderPost;
    const path = role === 'captain' ? 'captain-sos' : 'sos';

    const alertTeam = async (silent) => {
        if (!ride?._id) return;
        const location = await currentPosition();
        try {
            await post(`/rides/${ride._id}/${path}`, { silent, location: location || undefined });
        } catch {
            // The 112 call still goes through even if this request fails.
        }
    };

    const close = () => {
        setSilentSent(false);
        onClose();
    };

    return (
        <BottomSheet open={open} onClose={close} title={t('safety.sosTitle')} dark={dark}>
            <a
                href="tel:112"
                onClick={() => alertTeam(false)}
                className="flex h-16 items-center justify-center gap-3 rounded-[16px] bg-signal text-lg font-semibold text-white"
            >
                <Phone size={22} aria-hidden="true" />
                {t('safety.call112')}
            </a>
            {role === 'rider' && onShareWithContacts ? (
                <button
                    type="button"
                    onClick={() => {
                        alertTeam(false);
                        close();
                        onShareWithContacts();
                    }}
                    className={`flex h-14 items-center justify-center gap-2 rounded-[14px] text-base font-semibold ${dark ? 'bg-night-card text-white' : 'bg-ink text-white'}`}
                >
                    <Share2 size={20} className="text-volt" aria-hidden="true" />
                    {t('safety.alertContacts')}
                </button>
            ) : null}
            {silentSent ? (
                <p role="status" className={`rounded-[14px] px-4 py-3 text-sm ${dark ? 'bg-night-card' : 'bg-paper'}`}>
                    {t('safety.silentSent')}
                </p>
            ) : (
                <button
                    type="button"
                    onClick={async () => {
                        await alertTeam(true);
                        setSilentSent(true);
                    }}
                    className={`flex h-14 items-center justify-center gap-2 rounded-[14px] border text-base font-medium ${dark ? 'border-night-edge text-white' : 'border-line text-ink'}`}
                >
                    <BellOff size={18} aria-hidden="true" />
                    {t('safety.silent')}
                </button>
            )}
        </BottomSheet>
    );
}
