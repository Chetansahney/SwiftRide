import { Link } from 'react-router-dom';
import LinkedText from './LinkedText';
import { useLanguage } from '../../i18n/LanguageContext';

// Sign-up consent: a clear tick, with the Terms and Privacy Policy one tap away
// (they open in a new tab so the form isn't lost).
export default function ConsentCheckbox({ checked, onChange }) {
    const { t } = useLanguage();
    const link = (to, label) => (
        <Link to={to} target="_blank" rel="noopener" className="font-semibold text-ink underline underline-offset-4">
            {label}
        </Link>
    );
    return (
        <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-[14px] bg-white p-3 ring-1 ring-line">
            <input type="checkbox" required checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-ink" />
            <span className="text-sm leading-relaxed text-ink">
                <LinkedText text={t('auth.agree')} parts={{ terms: link('/terms', t('legal.termsInline')), privacy: link('/privacy', t('legal.privacy')) }} />
            </span>
        </label>
    );
}
