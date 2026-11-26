import { useContext, useState } from 'react';
import axios from 'axios';
import { Plus, Trash2, Wallet } from 'lucide-react';
import { UserDataContext } from '../../context/UserContext';
import { FormError } from '../ui/AuthLayout';
import WomanIcon from '../ui/WomanIcon';
import { useLanguage } from '../../i18n/LanguageContext';
import { API, riderAuth } from '../../lib/api';
import { formatFare } from '../../lib/config';

const MAX_CONTACTS = 3;

function Switch({ checked, onChange, label, description, icon }) {
    return (
        <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-[56px] items-center gap-3 text-left">
            {icon}
            <span className="flex min-w-0 flex-1 flex-col">
                <strong className="text-sm font-semibold">{label}</strong>
                {description ? <span className="text-xs text-muted">{description}</span> : null}
            </span>
            <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition ${checked ? 'bg-ink' : 'bg-[#C5C9D0]'}`} aria-hidden="true">
                <span className={`h-6 w-6 rounded-full shadow transition ${checked ? 'translate-x-5 bg-volt' : 'bg-white'}`} />
            </span>
        </button>
    );
}

// Trusted contacts and safety preferences on the Account page.
export default function SafetySettings() {
    const { t } = useLanguage();
    const { user, setUser } = useContext(UserDataContext);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [message, setMessage] = useState({ type: '', text: '' });
    const contacts = user?.trustedContacts || [];
    const prefs = user?.safetyPrefs || {};

    const save = async (body) => {
        setMessage({ type: '', text: '' });
        try {
            const response = await axios.patch(`${API}/users/safety`, body, riderAuth());
            setUser(response.data);
            setMessage({ type: 'ok', text: t('safety.saved') });
            return true;
        } catch (error) {
            setMessage({ type: 'error', text: error.response?.data?.errors?.[0]?.msg || t('safety.saveFailed') });
            return false;
        }
    };

    const addContact = async (e) => {
        e.preventDefault();
        if (!name.trim() || !phone.trim()) return;
        const ok = await save({ trustedContacts: [...contacts, { name: name.trim(), phone: phone.trim() }] });
        if (ok) {
            setName('');
            setPhone('');
        }
    };

    return (
        <div className="flex flex-col gap-4">
            {user?.walletCredit > 0 ? (
                <div className="flex items-center gap-3 rounded-2xl bg-volt/40 px-4 py-3">
                    <Wallet size={20} aria-hidden="true" />
                    <span className="flex-1 text-sm font-semibold">{t('safety.credit')}</span>
                    <strong className="font-display text-lg font-semibold">{formatFare(user.walletCredit)}</strong>
                </div>
            ) : null}

            <div className="flex flex-col gap-2">
                <strong className="text-sm font-semibold">{t('safety.contacts')}</strong>
                <span className="text-xs text-muted">{t('safety.contactsHelp')}</span>
                {contacts.map((contact) => (
                    <div key={contact.phone} className="flex items-center gap-3 rounded-[14px] bg-paper px-3 py-2">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink font-display text-sm font-semibold text-volt" aria-hidden="true">
                            {contact.name.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col">
                            <strong className="truncate text-sm font-semibold">{contact.name}</strong>
                            <span className="text-xs text-muted">+91 {contact.phone}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => save({ trustedContacts: contacts.filter((item) => item.phone !== contact.phone) })}
                            aria-label={`${t('account.remove')} ${contact.name}`}
                            className="flex h-10 w-10 items-center justify-center rounded-full text-signal"
                        >
                            <Trash2 size={18} aria-hidden="true" />
                        </button>
                    </div>
                ))}
                {contacts.length < MAX_CONTACTS ? (
                    <form onSubmit={addContact} className="flex flex-col gap-2 rounded-[14px] border border-dashed border-[#B4B8C0] p-3">
                        <div className="grid grid-cols-[1fr_1.2fr] gap-2">
                            <input
                                className="field h-12"
                                aria-label={t('safety.contactName')}
                                placeholder={t('safety.contactName')}
                                value={name}
                                maxLength={40}
                                onChange={(e) => setName(e.target.value)}
                            />
                            <input
                                className="field h-12"
                                aria-label={t('safety.contactPhone')}
                                placeholder={t('safety.contactPhone')}
                                inputMode="tel"
                                autoComplete="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                            />
                        </div>
                        <button type="submit" className="flex h-11 items-center justify-center gap-2 rounded-[12px] bg-ink text-sm font-semibold text-white">
                            <Plus size={16} aria-hidden="true" />
                            {t('safety.addContact')}
                        </button>
                    </form>
                ) : null}
            </div>

            <div className="flex flex-col divide-y divide-line border-t border-line">
                <Switch
                    checked={Boolean(prefs.travellingAsWoman)}
                    onChange={(value) => save({ safetyPrefs: { travellingAsWoman: value } })}
                    label={t('safety.travellingAsWoman')}
                    icon={<WomanIcon size={22} className="shrink-0" />}
                />
                <Switch
                    checked={prefs.shareAtNight !== false}
                    onChange={(value) => save({ safetyPrefs: { shareAtNight: value } })}
                    label={t('safety.shareAtNight')}
                />
            </div>

            {message.type === 'error' ? <FormError message={message.text} /> : null}
            {message.type === 'ok' ? (
                <p role="status" className="text-sm font-semibold text-ink">
                    {message.text}
                </p>
            ) : null}
        </div>
    );
}
