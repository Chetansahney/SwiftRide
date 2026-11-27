import { useContext, useState } from 'react';
import { Check } from 'lucide-react';
import BottomSheet from '../ui/BottomSheet';
import { FormError } from '../ui/AuthLayout';
import { UserDataContext } from '../../context/UserContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { riderPost } from '../../lib/api';
import { formatFare } from '../../lib/config';

const TYPES = [
    { value: 'extra_fare', key: 'report.extraFare' },
    { value: 'harassment', key: 'report.harassment' },
    { value: 'unsafe_driving', key: 'report.unsafe' },
    { value: 'wrong_driver', key: 'report.wrongDriver' },
    { value: 'other', key: 'report.other' },
];

// One place to report a ride. "Asked for extra money" refunds the amount as
// SwiftRide credit and gives the driver a strike; harassment or a different
// driver pauses the driver for review straight away.
export default function ReportSheet({ open, onClose, ride, initialType = 'extra_fare' }) {
    const { t } = useLanguage();
    const { user, setUser } = useContext(UserDataContext);
    const [type, setType] = useState(initialType);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    const close = () => {
        setResult(null);
        setError('');
        setAmount('');
        setNote('');
        setType(initialType);
        onClose();
    };

    const send = async (e) => {
        e.preventDefault();
        if (!ride?._id) return;
        setSending(true);
        setError('');
        try {
            const response = await riderPost(`/rides/${ride._id}/report`, {
                type,
                amount: type === 'extra_fare' && amount ? Number(amount) : undefined,
                note: note.trim() || undefined,
            });
            setResult(response.data);
            if (user && typeof response.data?.walletCredit === 'number') {
                setUser({ ...user, walletCredit: response.data.walletCredit });
            }
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || t('account.saveFailed'));
        } finally {
            setSending(false);
        }
    };

    return (
        <BottomSheet open={open} onClose={close} title={result ? t('report.sent') : t('report.title')}>
            {result ? (
                <div className="flex flex-col gap-4">
                    {result.creditIssued > 0 ? (
                        <p role="status" className="flex items-center gap-2 rounded-[14px] bg-volt/50 px-4 py-3 text-sm font-semibold">
                            <Check size={18} aria-hidden="true" />
                            {t('report.refunded', { amount: formatFare(result.creditIssued) })}
                        </p>
                    ) : null}
                    <button type="button" onClick={close} className="btn-primary">
                        OK
                    </button>
                </div>
            ) : (
                <form onSubmit={send} className="flex flex-col gap-3">
                    <FormError message={error} />
                    <div role="radiogroup" aria-label={t('report.title')} className="flex flex-col gap-2">
                        {TYPES.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                role="radio"
                                aria-checked={type === option.value}
                                onClick={() => setType(option.value)}
                                className={`flex min-h-[52px] items-center gap-3 rounded-[14px] px-4 text-left text-[15px] font-medium ${type === option.value ? 'bg-ink text-white' : 'bg-paper text-ink'}`}
                            >
                                <span
                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${type === option.value ? 'border-volt bg-volt' : 'border-[#B4B8C0]'}`}
                                    aria-hidden="true"
                                >
                                    {type === option.value ? <span className="h-2 w-2 rounded-full bg-ink" /> : null}
                                </span>
                                {t(option.key)}
                            </button>
                        ))}
                    </div>
                    {type === 'extra_fare' ? (
                        <div>
                            <label className="label" htmlFor="report-amount">
                                {t('report.amountLabel')}
                            </label>
                            <input
                                id="report-amount"
                                className="field"
                                inputMode="numeric"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                placeholder="30"
                            />
                        </div>
                    ) : null}
                    <div>
                        <label className="label" htmlFor="report-note">
                            {t('report.note')}
                        </label>
                        <textarea
                            id="report-note"
                            className="field h-24 resize-none py-3"
                            maxLength={500}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>
                    <button type="submit" disabled={sending} className="btn-primary">
                        {sending ? t('loading') : t('report.send')}
                    </button>
                </form>
            )}
        </BottomSheet>
    );
}
