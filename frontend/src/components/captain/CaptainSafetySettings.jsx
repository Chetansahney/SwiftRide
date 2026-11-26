import { useContext, useState } from 'react';
import axios from 'axios';
import BottomSheet from '../ui/BottomSheet';
import WomanIcon from '../ui/WomanIcon';
import { CaptainDataContext } from '../../context/CaptainContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { API, captainAuth } from '../../lib/api';

const GENDERS = [
    { value: 'female', key: 'captain.genderWoman' },
    { value: 'male', key: 'captain.genderMan' },
    { value: 'other', key: 'captain.genderOther' },
];

// Gender (optional) and, for women captains, "only women riders".
export default function CaptainSafetySettings({ open, onClose }) {
    const { t } = useLanguage();
    const { captain, setCaptain } = useContext(CaptainDataContext);
    const [gender, setGender] = useState(captain?.gender || '');
    const [womenOnly, setWomenOnly] = useState(Boolean(captain?.womenRidersOnly));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const save = async () => {
        setSaving(true);
        setError('');
        try {
            const response = await axios.patch(
                `${API}/captains/settings`,
                { gender: gender || null, womenRidersOnly: gender === 'female' && womenOnly },
                captainAuth()
            );
            setCaptain({ ...captain, ...response.data.captain });
            onClose();
        } catch {
            setError(t('account.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <BottomSheet open={open} onClose={onClose} title={t('captain.safetySettings')} dark>
            <div role="radiogroup" aria-label={t('captain.gender')} className="flex flex-col gap-2">
                <span className="text-sm font-semibold">{t('captain.gender')}</span>
                {GENDERS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={gender === option.value}
                        onClick={() => setGender(option.value)}
                        className={`flex h-12 items-center gap-3 rounded-[12px] px-3 text-left text-[15px] font-medium ${gender === option.value ? 'bg-white text-ink' : 'bg-night-card text-white'}`}
                    >
                        {option.value === 'female' ? <WomanIcon size={18} /> : <span className="w-[18px]" aria-hidden="true" />}
                        {t(option.key)}
                    </button>
                ))}
            </div>
            {gender === 'female' ? (
                <button
                    type="button"
                    role="switch"
                    aria-checked={womenOnly}
                    onClick={() => setWomenOnly(!womenOnly)}
                    className="flex min-h-[56px] items-center gap-3 rounded-[14px] bg-night-card px-3 text-left"
                >
                    <WomanIcon size={22} className="text-volt" />
                    <span className="flex-1 text-sm font-semibold">{t('captain.womenOnly')}</span>
                    <span className={`flex h-7 w-12 items-center rounded-full p-0.5 ${womenOnly ? 'bg-volt' : 'bg-night-edge'}`} aria-hidden="true">
                        <span className={`h-6 w-6 rounded-full bg-white transition ${womenOnly ? 'translate-x-5' : ''}`} />
                    </span>
                </button>
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
