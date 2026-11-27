import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { CaptainDataContext } from '../context/CaptainContext';
import AuthLayout, { FormError } from '../components/ui/AuthLayout';
import { useLanguage } from '../i18n/LanguageContext';

const Captainlogin = () => {
    const { t } = useLanguage();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const navigate = useNavigate();
    const { setCaptain } = React.useContext(CaptainDataContext);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            const response = await axios.post(`${import.meta.env.VITE_BASE_URL}/captains/login`, { email, password });
            if (response.status === 200) {
                setCaptain(response.data.captain);
                localStorage.setItem('captainToken', response.data.token);
                navigate('/captainhome');
                return;
            }
        } catch (err) {
            console.error('Captain login failed:', err.response?.status);
            setError(t('auth.failed'));
        } finally {
            setSubmitting(false);
        }
        setPassword('');
    };

    return (
        <AuthLayout
            badge="Captain"
            title={t('auth.captainTitle')}
            subtitle={t('auth.captainSub')}
            footerLink={{ to: '/Userlogin', label: t('auth.asRider') }}
        >
            <form onSubmit={handleSubmit} className="flex flex-col">
                <FormError message={error} />
                <label className="label" htmlFor="email">
                    {t('auth.email')}
                </label>
                <input id="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field mb-5" type="email" autoComplete="email" placeholder="email@example.com" />
                <label className="label" htmlFor="password">
                    {t('auth.password')}
                </label>
                <input id="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="field mb-7" type="password" autoComplete="current-password" />
                <button className="btn-primary" disabled={submitting}>
                    {submitting ? t('loading') : t('auth.login')}
                </button>
                <p className="mt-5 text-center text-sm text-muted">
                    {t('auth.noAccount')}{' '}
                    <Link to="/captainsignup" className="font-semibold text-ink underline underline-offset-4">
                        {t('auth.captainSignupTitle')}
                    </Link>
                </p>
            </form>
        </AuthLayout>
    );
};

export default Captainlogin;
