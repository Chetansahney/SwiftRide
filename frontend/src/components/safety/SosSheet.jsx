import { useState } from 'react';
import { BellOff, Phone, Share2 } from 'lucide-react';
import BottomSheet from '../ui/BottomSheet';
import { useLanguage } from '../../i18n/LanguageContext';
import { captainPost, currentPosition, riderPost } from '../../lib/api';

// Emergency options: call 112, alert trusted contacts, or a silent alert to the
// SwiftRide team that changes nothing visible on screen. The team sees alerts
// on their admin screen and tries to call; only 112 is an emergency service,
// and the sheet says so.
export default function SosSheet({ open, onClose, ride, role = 'rider', onShareWithContacts, dark = false }) {
    const { t } = useLanguage();
    // null → not sent yet, 'sending', 'sent' or 'failed'
    const [silent, setSilent] = useState(null);
    const post = role === 'captain' ? captainPost : riderPost;
    const path = role === 'captain' ? 'captain-sos' : 'sos';

    // Resolves to true only if the server stored the alert.
    const alertTeam = async (isSilent) => {
        if (!ride?._id) return false;
        const location = await currentPosition();
        try {
            await post(`/rides/${ride._id}/${path}`, { silent: isSilent, location: location || undefined });
            return true;
        } catch {
            // The 112 call still goes through even if this request fails.
            return false;
        }
    };

    const sendSilent = async () => {
        setSilent('sending');
        setSilent((await alertTeam(true)) ? 'sent' : 'failed');
    };

    const close = () => {
        setSilent(null);
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
            {silent === 'sent' ? (
                <p role="status" className={`rounded-[14px] px-4 py-3 text-sm ${dark ? 'bg-night-card' : 'bg-paper'}`}>
                    {t('safety.silentSent')}
                </p>
            ) : (
                <>
                    {silent === 'failed' ? (
                        <p role="alert" className="rounded-[14px] bg-signal/15 px-4 py-3 text-sm font-semibold text-signal">
                            {t('safety.alertFailed')}
                        </p>
                    ) : null}
                    <button
                        type="button"
                        onClick={sendSilent}
                        disabled={silent === 'sending'}
                        className={`flex h-14 items-center justify-center gap-2 rounded-[14px] border text-base font-medium disabled:opacity-60 ${dark ? 'border-night-edge text-white' : 'border-line text-ink'}`}
                    >
                        <BellOff size={18} aria-hidden="true" />
                        {silent === 'sending' ? t('loading') : silent === 'failed' ? t('safety.retry') : t('safety.silent')}
                    </button>
                </>
            )}
            <p className={`text-xs leading-relaxed ${dark ? 'text-night-muted' : 'text-muted'}`}>{t('safety.sosNote')}</p>
        </BottomSheet>
    );
}
