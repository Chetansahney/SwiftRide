import { useState } from 'react';
import axios from 'axios';
import { KeyRound, MonitorSmartphone } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { API } from '../lib/api';

// Change password (logs out other devices) and "log out on all devices".
// `role` is "users" or "captains"; `tokenKey` is where the login token lives.
export default function AccountSecurity({ role = 'users', tokenKey = 'userToken', onLoggedOut }) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [message, setMessage] = useState(null);
    const [busy, setBusy] = useState(false);
    const headers = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem(tokenKey)}` } });

    const change = async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
            const { data } = await axios.post(`${API}/${role}/password`, { currentPassword: current, newPassword: next }, headers());
            localStorage.setItem(tokenKey, data.token);
            setMessage({ ok: true, text: t('account.passwordChanged') });
            setCurrent('');
            setNext('');
            setOpen(false);
        } catch (error) {
            const body = error.response?.data;
            setMessage({ ok: false, text: error.response?.status === 400 && body?.message ? t('account.passwordWrong') : body?.errors?.[0]?.msg || t('auth.passwordHint') });
        } finally {
            setBusy(false);
        }
    };

    const logoutAll = async () => {
        await axios.post(`${API}/${role}/logout-all`, {}, headers()).catch(() => {});
        localStorage.removeItem(tokenKey);
        onLoggedOut();
    };

    return (
        <div className="flex flex-col gap-2">
            {message ? (
                <p role={message.ok ? 'status' : 'alert'} className={`rounded-[14px] px-4 py-3 text-sm font-medium ${message.ok ? 'bg-volt/30 text-ink' : 'bg-signal/10 text-signal'}`}>
                    {message.text}
                </p>
            ) : null}
            {open ? (
                <form onSubmit={change} className="flex flex-col gap-3 rounded-[18px] bg-white p-4 ring-1 ring-line">
                    <label className="label mb-0" htmlFor="currentPassword">
                        {t('account.currentPassword')}
                    </label>
                    <input id="currentPassword" required type="password" autoComplete="current-password" className="field" value={current} onChange={(e) => setCurrent(e.target.value)} />
                    <label className="label mb-0" htmlFor="newPassword">
                        {t('account.newPassword')}
                    </label>
                    <input
                        id="newPassword"
                        required
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={72}
                        pattern="(?=.*[A-Za-z])(?=.*\d).{8,72}"
                        title={t('auth.passwordHint')}
                        aria-describedby="newPasswordHint"
                        className="field"
                        value={next}
                        onChange={(e) => setNext(e.target.value)}
                    />
                    <span id="newPasswordHint" className="text-xs text-muted">
                        {t('auth.passwordHint')}
                    </span>
                    <button className="btn-primary" disabled={busy}>
                        {t('account.password')}
                    </button>
                </form>
            ) : (
                <button type="button" onClick={() => setOpen(true)} className="flex h-12 items-center gap-3 rounded-[14px] bg-white px-4 text-sm font-semibold ring-1 ring-line">
                    <KeyRound size={18} aria-hidden="true" />
                    {t('account.password')}
                </button>
            )}
            <button type="button" onClick={logoutAll} className="flex h-12 items-center gap-3 rounded-[14px] bg-white px-4 text-sm font-semibold ring-1 ring-line">
                <MonitorSmartphone size={18} aria-hidden="true" />
                {t('account.logoutAll')}
            </button>
        </div>
    );
}
