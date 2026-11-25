import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { UserDataContext } from '../context/UserContext';
import AuthLayout, { FormError } from '../components/ui/AuthLayout';
import { useLanguage } from '../i18n/LanguageContext';

const Usersignup = () => {
    const { t } = useLanguage();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const navigate = useNavigate();
    const { setUser } = React.useContext(UserDataContext);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        const newUser = {
            name: { firstname: firstName, lastname: lastName },
            email,
            password,
        };
        try {
            const response = await axios.post(`${import.meta.env.VITE_BASE_URL}/users/register`, newUser);
            if (response.status === 201) {
                setUser(response.data.user);
                localStorage.setItem('userToken', response.data.token);
                navigate('/home');
                return;
            }
        } catch (err) {
            console.error('Signup failed:', err.response?.data);
            setError(err.response?.data?.errors?.[0]?.msg || t('auth.signupFailed'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AuthLayout title={t('auth.signupTitle')} footerLink={{ to: '/captainsignup', label: t('auth.asCaptain') }}>
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
                <button className="btn-primary" disabled={submitting}>
                    {submitting ? t('loading') : t('auth.signup')}
                </button>
                <p className="mt-5 text-center text-sm text-muted">
                    {t('auth.haveAccount')}{' '}
                    <Link to="/Userlogin" className="font-semibold text-ink underline underline-offset-4">
                        {t('auth.loginHere')}
                    </Link>
                </p>
            </form>
        </AuthLayout>
    );
};

export default Usersignup;
