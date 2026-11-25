import React, { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { UserDataContext } from '../context/UserContext';
import AuthLayout, { FormError } from '../components/ui/AuthLayout';
import { useLanguage } from '../i18n/LanguageContext';

const Userlogin = () => {
    const { t } = useLanguage();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const { setUser } = useContext(UserDataContext);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            const response = await axios.post(`${import.meta.env.VITE_BASE_URL}/users/login`, { email, password });
            if (response.status === 200) {
                setUser(response.data.user);
                localStorage.setItem('userToken', response.data.token);
                navigate('/home');
                return;
            }
        } catch (err) {
            console.error('Login failed:', err.response?.status);
            setError(t('auth.failed'));
        } finally {
            setSubmitting(false);
        }
        setPassword('');
    };

    return (
        <AuthLayout
            title={t('auth.userTitle')}
            subtitle={t('auth.userSub')}
            footerLink={{ to: '/captainlogin', label: t('auth.asCaptain') }}
        >
            <form onSubmit={handleSubmit} className="flex flex-col">
                <FormError message={error} />
                <label className="label" htmlFor="email">
                    {t('auth.email')}
                </label>
                <input
                    id="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="field mb-5"
                    type="email"
                    autoComplete="email"
                    placeholder="email@example.com"
                />
                <label className="label" htmlFor="password">
                    {t('auth.password')}
                </label>
                <input
                    id="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="field mb-7"
                    type="password"
                    autoComplete="current-password"
                />
                <button className="btn-primary" disabled={submitting}>
                    {submitting ? t('loading') : t('auth.login')}
                </button>
                <p className="mt-5 text-center text-sm text-muted">
                    {t('auth.noAccount')}{' '}
                    <Link to="/usersignup" className="font-semibold text-ink underline underline-offset-4">
                        {t('auth.createAccount')}
                    </Link>
                </p>
            </form>
        </AuthLayout>
    );
};

export default Userlogin;
