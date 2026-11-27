import { useContext, useState } from 'react';
import axios from 'axios';
import { BadgeCheck, Clock, Lock } from 'lucide-react';
import BottomSheet from '../ui/BottomSheet';
import WomanIcon from '../ui/WomanIcon';
import PhoneField from '../ui/PhoneField';
import { CaptainDataContext } from '../../context/CaptainContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { API, captainAuth } from '../../lib/api';
import { isIndianMobile, normalizePhone } from '../../lib/config';

const GENDERS = [
    { value: 'female', key: 'captain.genderWoman' },
    { value: 'male', key: 'captain.genderMan' },
    { value: 'other', key: 'captain.genderOther' },
];

// Gender (changeable only before verification) and, for CONFIRMED women
// captains, "only women riders". Picking "woman" alone unlocks nothing: the face
// check (or our team) has to confirm it, so a man can't use it to target women.
export default function CaptainSafetySettings({ open, onClose }) {
    const { t } = useLanguage();
    const { captain, setCaptain } = useContext(CaptainDataContext);
    const [gender, setGender] = useState(captain?.gender || '');
    const [womenOnly, setWomenOnly] = useState(Boolean(captain?.womenRidersOnly));
    const [phone, setPhone] = useState(captain?.phone || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const locked = !['not_started', 'rejected', undefined].includes(captain?.verification?.status);
    const check = captain?.genderCheck?.status || 'not_needed';
    const confirmed = captain?.gender === 'female' && check === 'verified';
    const womanStatus = confirmed ? null : check === 'in_review' ? 'captain.womanReview' : check === 'rejected' ? 'captain.womanRejected' : 'captain.womanAfterVerify';

    const save = async () => {
        if (phone && !isIndianMobile(phone)) {
            setError(t('auth.phoneInvalid'));
            return;
        }
        setSaving(true);
        setError('');
        try {
            const body = { womenRidersOnly: confirmed && womenOnly };
            if (!locked) body.gender = gender || null;
            if (phone && normalizePhone(phone) !== captain?.phone) body.phone = normalizePhone(phone);
            const response = await axios.patch(`${API}/captains/settings`, body, captainAuth());
            setCaptain({ ...captain, ...response.data.captain });
            onClose();
        } catch (err) {
            setError(err.response?.data?.message || t('account.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <BottomSheet open={open} onClose={onClose} title={t('captain.safetySettings')} dark>
            <div className="flex flex-col gap-2">
                <label htmlFor="captain-phone" className="text-sm font-semibold">
                    {t('auth.phone')}
                </label>
                <PhoneField id="captain-phone" dark value={phone} onChange={setPhone} describedBy="captain-phone-hint" />
                <span id="captain-phone-hint" className="text-xs text-night-muted">
                    {t('auth.phoneHintCaptain')}
                </span>
            </div>
            <div role="radiogroup" aria-label={t('captain.gender')} aria-disabled={locked} className="flex flex-col gap-2">
                <span className="text-sm font-semibold">{t('captain.gender')}</span>
                {GENDERS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={gender === option.value}
                        disabled={locked}
                        onClick={() => setGender(option.value)}
                        className={`flex h-12 items-center gap-3 rounded-[12px] px-3 text-left text-[15px] font-medium disabled:cursor-not-allowed ${gender === option.value ? 'bg-white text-ink' : 'bg-night-card text-white'} ${locked && gender !== option.value ? 'opacity-50' : ''}`}
                    >
                        {option.value === 'female' ? <WomanIcon size={18} /> : <span className="w-[18px]" aria-hidden="true" />}
                        {t(option.key)}
                    </button>
                ))}
                {locked ? (
                    <span className="flex items-center gap-2 text-xs text-night-muted">
                        <Lock size={14} aria-hidden="true" />
                        {t('captain.genderLocked')}
                    </span>
                ) : null}
            </div>

            {gender === 'female' ? (
                <div className="flex flex-col gap-2">
                    {confirmed ? (
                        <span className="flex items-center gap-2 text-sm font-semibold text-volt">
                            <BadgeCheck size={18} aria-hidden="true" />
                            {t('captain.womanConfirmed')}
                        </span>
                    ) : null}
                    <button
                        type="button"
                        role="switch"
                        aria-checked={confirmed && womenOnly}
                        aria-describedby={womanStatus ? 'womanStatus' : undefined}
                        disabled={!confirmed}
                        onClick={() => setWomenOnly(!womenOnly)}
                        className="flex min-h-[56px] items-center gap-3 rounded-[14px] bg-night-card px-3 text-left disabled:opacity-60"
                    >
                        <WomanIcon size={22} className="text-volt" />
                        <span className="flex-1 text-sm font-semibold">{t('captain.womenOnly')}</span>
                        {confirmed ? (
                            <span className={`flex h-7 w-12 items-center rounded-full p-0.5 ${womenOnly ? 'bg-volt' : 'bg-night-edge'}`} aria-hidden="true">
                                <span className={`h-6 w-6 rounded-full bg-white transition ${womenOnly ? 'translate-x-5' : ''}`} />
                            </span>
                        ) : check === 'in_review' ? (
                            <Clock size={20} className="text-night-muted" aria-hidden="true" />
                        ) : (
                            <Lock size={20} className="text-night-muted" aria-hidden="true" />
                        )}
                    </button>
                    {womanStatus ? (
                        <p id="womanStatus" className="text-xs leading-snug text-night-muted">
                            {t(womanStatus)}
                        </p>
                    ) : null}
                </div>
            ) : null}

            {error ? (
                <p role="alert" className="text-sm text-[#FF8A8F]">
                    {error}
                </p>
            ) : null}
            <button type="button" onClick={save} disabled={saving} className="btn-volt">
                {saving ? t('loading') : t('captain.save')}
            </button>
        </BottomSheet>
    );
}
