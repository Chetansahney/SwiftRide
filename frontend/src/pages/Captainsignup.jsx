import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { CaptainDataContext } from '../context/CaptainContext';
import AuthLayout, { FormError } from '../components/ui/AuthLayout';
import VehicleArt from '../components/ui/VehicleArt';
import { useLanguage } from '../i18n/LanguageContext';

// Captains pick their vehicle by picture. Values match the backend's enum.
const TYPES = [
    { value: 'moto', art: 'bike', nameKey: 'vehicle.moto' },
    { value: 'auto', art: 'auto', nameKey: 'vehicle.auto' },
    { value: 'car', art: 'cab', nameKey: 'vehicle.car' },
];

const Captainsignup = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [vehicleColor, setVehicleColor] = useState('');
    const [vehicleModel, setVehicleModel] = useState('');
    const [vehiclePlate, setVehiclePlate] = useState('');
    const [vehicleCapacity, setVehicleCapacity] = useState('');
    const [vehicleType, setVehicleType] = useState('');
    const [gender, setGender] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const { setCaptain } = React.useContext(CaptainDataContext);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!vehicleType) {
            setError(t('auth.vehicleType'));
            return;
        }
        setError('');
        setSubmitting(true);
        const captainData = {
            gender: gender || undefined,
            name: { firstname: firstName, lastname: lastName },
            email,
            password,
            vehicle: {
                color: vehicleColor,
                model: vehicleModel,
                plate: vehiclePlate,
                capacity: vehicleCapacity,
                vehicleType,
            },
        };
        try {
            const response = await axios.post(`${import.meta.env.VITE_BASE_URL}/captains/register`, captainData);
            if (response.status === 201) {
                setCaptain(response.data.captain);
                localStorage.setItem('captainToken', response.data.token);
                navigate('/captain/verify');
                return;
            }
        } catch (err) {
            console.error('Captain signup failed:', err.response?.data);
            setError(err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || t('auth.signupFailed'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AuthLayout badge="Captain" title={t('auth.captainSignupTitle')} footerLink={{ to: '/usersignup', label: t('auth.asRider') }}>
            <form onSubmit={handleSubmit} className="flex flex-col">
                <FormError message={error} />
                <div className="mb-5 grid grid-cols-2 gap-3">
                    <div>
                        <label className="label" htmlFor="firstName">
                            {t('auth.firstName')}
                        </label>
                        <input id="firstName" required minLength={3} className="field" type="text" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    </div>
                    <div>
                        <label className="label" htmlFor="lastName">
                            {t('auth.lastName')}
                        </label>
                        <input id="lastName" className="field" type="text" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    </div>
                </div>
                <label className="label" htmlFor="email">
                    {t('auth.email')}
                </label>
                <input id="email" required className="field mb-5" type="email" autoComplete="email" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <label className="label" htmlFor="password">
                    {t('auth.password')}
                </label>
                <input id="password" required minLength={6} className="field mb-7" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />

                <div role="radiogroup" aria-label={t('captain.gender')} className="mb-7 flex flex-col gap-2">
                    <span className="label mb-0">{t('captain.gender')}</span>
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { value: 'female', key: 'captain.genderWoman' },
                            { value: 'male', key: 'captain.genderMan' },
                            { value: 'other', key: 'captain.genderOther' },
                        ].map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                role="radio"
                                aria-checked={gender === option.value}
                                onClick={() => setGender(option.value)}
                                className={`min-h-12 rounded-[14px] px-2 text-sm font-semibold leading-tight ${gender === option.value ? 'bg-ink text-white' : 'bg-white ring-1 ring-line'}`}
                            >
                                {t(option.key)}
                            </button>
                        ))}
                    </div>
                </div>

                <h2 className="mb-3 font-display text-lg font-semibold">{t('auth.vehicle')}</h2>
                <div role="radiogroup" aria-label={t('auth.vehicleType')} className="mb-5 grid grid-cols-3 gap-2">
                    {TYPES.map((type) => (
                        <button
                            key={type.value}
                            type="button"
                            role="radio"
                            aria-checked={vehicleType === type.value}
                            onClick={() => setVehicleType(type.value)}
                            className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 ${vehicleType === type.value ? 'bg-volt ring-2 ring-ink' : 'bg-white ring-1 ring-line'}`}
                        >
                            <VehicleArt art={type.art} width={60} />
                            <strong className="text-sm font-semibold">{t(type.nameKey)}</strong>
                        </button>
                    ))}
                </div>
                <div className="mb-5 grid grid-cols-2 gap-3">
                    <div>
                        <label className="label" htmlFor="plate">
                            {t('auth.vehiclePlate')}
                        </label>
                        <input id="plate" required className="field uppercase" type="text" placeholder="WB 02 AK 4417" value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} />
                    </div>
                    <div>
                        <label className="label" htmlFor="color">
                            {t('auth.vehicleColor')}
                        </label>
                        <input id="color" required className="field" type="text" value={vehicleColor} onChange={(e) => setVehicleColor(e.target.value)} />
                    </div>
                </div>
                <div className="mb-7 grid grid-cols-2 gap-3">
                    <div>
                        <label className="label" htmlFor="model">
                            {t('auth.vehicleModel')}
                        </label>
                        <input id="model" required className="field" type="text" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} />
                    </div>
                    <div>
                        <label className="label" htmlFor="capacity">
                            {t('auth.vehicleCapacity')}
                        </label>
                        <input id="capacity" required min={1} className="field" type="number" inputMode="numeric" value={vehicleCapacity} onChange={(e) => setVehicleCapacity(e.target.value)} />
                    </div>
                </div>
                <button className="btn-primary" disabled={submitting}>
                    {submitting ? t('loading') : t('auth.createCaptain')}
                </button>
                <p className="mt-5 text-center text-sm text-muted">
                    {t('auth.haveAccount')}{' '}
                    <Link to="/captainlogin" className="font-semibold text-ink underline underline-offset-4">
                        {t('auth.loginHere')}
                    </Link>
                </p>
            </form>
        </AuthLayout>
    );
};

export default Captainsignup;
