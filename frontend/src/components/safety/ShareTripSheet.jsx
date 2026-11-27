import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Send, Share2, UserPlus } from 'lucide-react';
import BottomSheet from '../ui/BottomSheet';
import { UserDataContext } from '../../context/UserContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { riderPost, tripLink } from '../../lib/api';
import { formatPlateText } from './plate';

// Share the live trip link with trusted contacts — one tap opens WhatsApp or SMS
// from the rider's own phone with the message filled in.
export default function ShareTripSheet({ open, onClose, ride, prompt }) {
    const { t } = useLanguage();
    const { user } = useContext(UserDataContext);
    const [token, setToken] = useState(null);
    const contacts = user?.trustedContacts || [];
    const rideId = ride?._id;

    useEffect(() => {
        if (!open || !rideId || token) return;
        riderPost(`/rides/${rideId}/share`)
            .then((response) => setToken(response.data?.token || null))
            .catch(() => setToken(null));
    }, [open, rideId, token]);

    const link = token ? tripLink(token) : '';
    const message = t('safety.shareMessage', {
        driver: ride?.captain?.name?.firstname || t('ride.driver'),
        plate: formatPlateText(ride?.captain?.vehicle?.plate),
        link,
    });

    const shareOther = async () => {
        if (navigator.share) {
            try {
                await navigator.share({ title: 'SwiftRide', text: message, url: link });
            } catch {
                // closed the share sheet
            }
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(message);
        }
    };

    return (
        <BottomSheet open={open} onClose={onClose} title={prompt || t('safety.shareTrip')}>
            {contacts.length ? (
                <ul className="flex flex-col gap-2">
                    {contacts.map((contact) => (
                        <li key={contact.phone} className="flex items-center gap-2">
                            <a
                                href={link ? `https://wa.me/91${contact.phone}?text=${encodeURIComponent(message)}` : undefined}
                                target="_blank"
                                rel="noreferrer"
                                aria-disabled={!link}
                                className={`flex h-14 flex-1 items-center gap-3 rounded-[14px] bg-ink px-4 text-white ${link ? '' : 'pointer-events-none opacity-60'}`}
                            >
                                <MessageCircle size={20} className="text-volt" aria-hidden="true" />
                                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{t('safety.shareWith', { name: contact.name })}</span>
                                <span className="text-xs text-[#B4B8C0]">WhatsApp</span>
                            </a>
                            <a
                                href={link ? `sms:+91${contact.phone}?&body=${encodeURIComponent(message)}` : undefined}
                                aria-label={`SMS ${contact.name}`}
                                className={`flex h-14 w-14 items-center justify-center rounded-[14px] bg-paper ${link ? '' : 'pointer-events-none opacity-60'}`}
                            >
                                <Send size={18} aria-hidden="true" />
                            </a>
                        </li>
                    ))}
                </ul>
            ) : (
                <Link to="/account#safety" className="btn-ghost gap-2" onClick={onClose}>
                    <UserPlus size={18} aria-hidden="true" />
                    {t('safety.addContacts')}
                </Link>
            )}
            <button type="button" onClick={shareOther} disabled={!link} className="btn-ghost gap-2">
                <Share2 size={18} aria-hidden="true" />
                {t('safety.shareOther')}
            </button>
        </BottomSheet>
    );
}
