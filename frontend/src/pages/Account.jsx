import React, { useContext, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Briefcase, ChevronLeft, House, LifeBuoy, LogOut, MapPin, Pencil, Phone, Plus, Star, Trash2 } from 'lucide-react';
import { UserDataContext } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LANGUAGES } from '../i18n/strings';
import { LanguagePicker } from '../components/ui/Brand';
import { FormError } from '../components/ui/AuthLayout';
import VehicleArt from '../components/ui/VehicleArt';
import PhoneField from '../components/ui/PhoneField';
import { formatFare, isCoordinatePair, isIndianMobile, normalizePhone, shortPlace, vehicleMeta } from '../lib/config';
import { addCustomPlace, clearPlaces, getSavedPlaces, removeCustomPlace, removePlace, savePlace } from '../lib/places';
import SavePlaceSheet from '../components/SavePlaceSheet';
import SafetySettings from '../components/safety/SafetySettings';
import AccountSecurity from '../components/AccountSecurity';

const API = import.meta.env.VITE_BASE_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('userToken')}` });

const STATUS_STYLE = {
    completed: 'bg-paper text-ink',
    ongoing: 'bg-volt text-ink',
    accepted: 'bg-volt text-ink',
    requested: 'bg-paper text-muted',
    cancelled: 'bg-signal/10 text-signal',
};

function Section({ title, children, action }) {
    return (
        <section className="flex flex-col gap-3 rounded-[24px] bg-white p-5">
            <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">{title}</h2>
                {action}
            </div>
            {children}
        </section>
    );
}

const Account = () => {
    const { t, lang } = useLanguage();
    const { user, setUser } = useContext(UserDataContext);
    const [rides, setRides] = useState(null);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({ firstname: '', lastname: '', email: '', phone: '' });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [savedPlaces, setSavedPlaces] = useState(getSavedPlaces);
    const [searchParams] = useSearchParams();
    // Opened from the home screen's "+ Add place" chip.
    const [addingPlace, setAddingPlace] = useState(() => (searchParams.get('addPlace') ? 'custom' : null));
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    const handleSavePlace = (kind, address, name) => {
        setSavedPlaces(kind === 'custom' ? addCustomPlace(name, address) : savePlace(kind, address));
    };

    const deleteAccount = async () => {
        setDeleting(true);
        setDeleteError('');
        try {
            await axios.delete(`${API}/users/profile`, { headers: authHeaders() });
            ['userToken', 'activeRide', 'selectedVehicle'].forEach((key) => localStorage.removeItem(key));
            clearPlaces();
            // Full reload to the welcome screen: resets every bit of in-memory state
            // and avoids the login guard redirecting to /Userlogin first.
            window.location.replace('/');
        } catch {
            setDeleteError(t('account.deleteFailed'));
            setDeleting(false);
        }
    };

    const locale = LANGUAGES.find((language) => language.code === lang)?.speech || 'en-IN';
    const fullName = [user?.name?.firstname, user?.name?.lastname].filter(Boolean).join(' ') || '—';
    const initials = fullName
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

    useEffect(() => {
        const controller = new AbortController();
        axios
            .get(`${API}/rides/history`, { headers: authHeaders(), signal: controller.signal })
            .then((response) => setRides(Array.isArray(response.data) ? response.data : []))
            .catch((error) => {
                if (error.code !== 'ERR_CANCELED') setRides([]);
            });
        return () => controller.abort();
    }, []);

    const completed = (rides || []).filter((ride) => ride.status === 'completed');
    // Average of the ratings captains gave this rider.
    const ratings = (rides || []).map((ride) => ride.userRating).filter((value) => typeof value === 'number');
    const averageRating = ratings.length ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1) : null;

    const startEditing = () => {
        setForm({
            firstname: user?.name?.firstname || '',
            lastname: user?.name?.lastname || '',
            email: user?.email || '',
            phone: user?.phone || '',
        });
        setMessage({ type: '', text: '' });
        setEditing(true);
    };

    const saveProfile = async (e) => {
        e.preventDefault();
        if (form.phone && !isIndianMobile(form.phone)) {
            setMessage({ type: 'error', text: t('auth.phoneInvalid') });
            return;
        }
        setSaving(true);
        setMessage({ type: '', text: '' });
        try {
            const response = await axios.patch(
                `${API}/users/profile`,
                {
                    name: { firstname: form.firstname, lastname: form.lastname },
                    email: form.email,
                    phone: form.phone ? normalizePhone(form.phone) : undefined,
                },
                { headers: authHeaders() }
            );
            setUser(response.data);
            setEditing(false);
            setMessage({ type: 'ok', text: t('account.saved') });
        } catch (error) {
            setMessage({
                type: 'error',
                text: error.response?.data?.message || error.response?.data?.errors?.[0]?.msg || t('account.saveFailed'),
            });
        } finally {
            setSaving(false);
        }
    };

    const placeName = (place) => (isCoordinatePair(place) ? t('account.pinned') : shortPlace(place));

    return (
        <div className="min-h-full bg-paper">
            <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 pb-10 pt-6">
                <div className="flex items-center gap-3">
                    <Link
                        to="/home"
                        aria-label="Back"
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink shadow-float"
                    >
                        <ChevronLeft size={22} aria-hidden="true" />
                    </Link>
                    <h1 className="font-display text-2xl font-semibold tracking-tight">{t('account.title')}</h1>
                </div>

                <section className="flex flex-col gap-4 rounded-[24px] bg-ink p-5 text-white">
                    <div className="flex items-center gap-4">
                        <span
                            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-volt font-display text-2xl font-semibold text-ink"
                            aria-hidden="true"
                        >
                            {initials || '?'}
                        </span>
                        <div className="flex min-w-0 flex-col">
                            <strong className="truncate font-display text-xl font-semibold">{fullName}</strong>
                            <span className="truncate text-sm text-[#B4B8C0]">{user?.email}</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1 rounded-2xl bg-night-card p-3">
                            <span className="text-xs text-night-muted">{t('account.rating')}</span>
                            {averageRating ? (
                                <>
                                    <strong className="flex items-center gap-1.5 font-display text-2xl font-semibold">
                                        <Star size={20} className="fill-volt text-volt" aria-hidden="true" />
                                        {averageRating}
                                    </strong>
                                    <span className="text-xs text-night-muted">{t('account.ratingFrom', { count: ratings.length })}</span>
                                </>
                            ) : (
                                <strong className="text-sm font-semibold">{t('account.ratingNone')}</strong>
                            )}
                        </div>
                        <div className="flex flex-col gap-1 rounded-2xl bg-night-card p-3">
                            <span className="text-xs text-night-muted">{t('account.ridesCount')}</span>
                            <strong className="font-display text-2xl font-semibold">{rides ? completed.length : '–'}</strong>
                        </div>
                    </div>
                </section>

                <div id="safety" className="scroll-mt-4">
                    <Section title={t('safety.title')}>
                        <SafetySettings />
                    </Section>
                </div>

                <Section
                    title={t('account.profile')}
                    action={
                        !editing ? (
                            <button
                                type="button"
                                onClick={startEditing}
                                className="flex h-10 items-center gap-1.5 rounded-full bg-paper px-4 text-sm font-semibold"
                            >
                                <Pencil size={15} aria-hidden="true" />
                                {t('account.edit')}
                            </button>
                        ) : null
                    }
                >
                    {message.type === 'ok' ? (
                        <p role="status" className="rounded-[14px] bg-volt/40 px-4 py-3 text-sm font-medium">
                            {message.text}
                        </p>
                    ) : null}
                    {editing ? (
                        <form onSubmit={saveProfile} className="flex flex-col">
                            <FormError message={message.type === 'error' ? message.text : ''} />
                            <div className="mb-4 grid grid-cols-2 gap-3">
                                <div>
                                    <label className="label" htmlFor="acc-first">
                                        {t('auth.firstName')}
                                    </label>
                                    <input
                                        id="acc-first"
                                        required
                                        minLength={3}
                                        className="field"
                                        value={form.firstname}
                                        onChange={(e) => setForm({ ...form, firstname: e.target.value })}
                                        autoComplete="given-name"
                                    />
                                </div>
                                <div>
                                    <label className="label" htmlFor="acc-last">
                                        {t('auth.lastName')}
                                    </label>
                                    <input
                                        id="acc-last"
                                        className="field"
                                        value={form.lastname}
                                        onChange={(e) => setForm({ ...form, lastname: e.target.value })}
                                        autoComplete="family-name"
                                    />
                                </div>
                            </div>
                            <label className="label" htmlFor="acc-email">
                                {t('auth.email')}
                            </label>
                            <input
                                id="acc-email"
                                required
                                type="email"
                                className="field mb-4"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                autoComplete="email"
                            />
                            <label className="label" htmlFor="acc-phone">
                                {t('auth.phone')}
                            </label>
                            <PhoneField id="acc-phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} describedBy="acc-phone-hint" />
                            <span id="acc-phone-hint" className="mb-5 mt-1.5 text-xs text-muted">
                                {t('auth.phoneHintRider')}
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => setEditing(false)} className="btn-ghost">
                                    {t('account.cancel')}
                                </button>
                                <button type="submit" disabled={saving} className="btn-primary">
                                    {saving ? t('loading') : t('account.save')}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                            <dt className="text-muted">{t('auth.firstName')}</dt>
                            <dd className="font-semibold">{user?.name?.firstname || '—'}</dd>
                            <dt className="text-muted">{t('auth.lastName')}</dt>
                            <dd className="font-semibold">{user?.name?.lastname || '—'}</dd>
                            <dt className="text-muted">{t('auth.email')}</dt>
                            <dd className="truncate font-semibold">{user?.email || '—'}</dd>
                            <dt className="text-muted">{t('auth.phone')}</dt>
                            <dd className="font-semibold">{user?.phone ? `+91 ${user.phone.slice(0, 5)} ${user.phone.slice(5)}` : '—'}</dd>
                        </dl>
                    )}
                    {!editing && user && !user.phone ? (
                        <button
                            type="button"
                            onClick={startEditing}
                            className="flex min-h-14 items-center gap-3 rounded-[14px] bg-volt px-4 py-3 text-left text-sm font-semibold text-ink"
                        >
                            <Phone size={20} className="shrink-0" aria-hidden="true" />
                            <span className="flex-1">{t('account.phoneMissing')}</span>
                            <span className="shrink-0 underline underline-offset-4">{t('account.addPhone')}</span>
                        </button>
                    ) : null}
                </Section>

                <Section title={t('account.history')}>
                    {rides === null ? (
                        <p className="py-4 text-center text-sm text-muted">{t('loading')}</p>
                    ) : rides.length === 0 ? (
                        <p className="py-4 text-center text-sm text-muted">{t('account.noRides')}</p>
                    ) : (
                        <ul className="flex flex-col divide-y divide-line">
                            {rides.map((ride) => {
                                const meta = vehicleMeta(ride.captain?.vehicle?.vehicleType || 'car');
                                const when = ride.createdAt
                                    ? new Date(ride.createdAt).toLocaleString(locale, {
                                        day: 'numeric',
                                        month: 'short',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                    })
                                    : '';
                                return (
                                    <li key={ride._id} className="flex items-center gap-3 py-3">
                                        <span className="flex h-12 w-14 shrink-0 items-center justify-center rounded-xl bg-paper">
                                            <VehicleArt art={meta.art} width={48} />
                                        </span>
                                        <div className="flex min-w-0 flex-1 flex-col">
                                            <strong className="line-clamp-2 text-[15px] font-semibold leading-snug">
                                                {placeName(ride.origin)} → {placeName(ride.destination)}
                                            </strong>
                                            <span className="text-xs text-muted">
                                                {when}
                                                {ride.captain?.name?.firstname ? ` · ${ride.captain.name.firstname}` : ''}
                                            </span>
                                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[ride.status] || 'bg-paper'}`}>
                                                    {t(`status.${ride.status}`)}
                                                </span>
                                                {typeof ride.captainRating === 'number' ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                                                        {t('account.youRated')}
                                                        <Star size={11} className="fill-ink text-ink" aria-hidden="true" />
                                                        {ride.captainRating}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </div>
                                        <strong className="shrink-0 font-display text-lg font-semibold">{formatFare(ride.fare)}</strong>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Section>

                <Section title={t('account.places')}>
                    {[
                        { kind: 'home', label: t('home.home'), Icon: House },
                        { kind: 'work', label: t('home.work'), Icon: Briefcase },
                    ].map((place) => {
                        const { kind, label } = place;
                        const PlaceIcon = place.Icon;
                        return (
                            <div key={kind} className="flex items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper" aria-hidden="true">
                                    <PlaceIcon size={18} />
                                </span>
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <strong className="text-sm font-semibold">{label}</strong>
                                    <span className="truncate text-xs text-muted">{savedPlaces[kind] || t('account.notSet')}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setAddingPlace(kind)}
                                    className="h-10 shrink-0 rounded-full bg-paper px-3.5 text-sm font-semibold"
                                >
                                    {savedPlaces[kind] ? t('places.change') : t('places.set')}
                                </button>
                                {savedPlaces[kind] ? (
                                    <button
                                        type="button"
                                        onClick={() => setSavedPlaces(removePlace(kind))}
                                        aria-label={`${t('account.remove')} ${label}`}
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-signal"
                                    >
                                        <Trash2 size={18} aria-hidden="true" />
                                    </button>
                                ) : null}
                            </div>
                        );
                    })}
                    {(savedPlaces.custom || []).map((place) => (
                        <div key={place.id} className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper" aria-hidden="true">
                                <MapPin size={18} />
                            </span>
                            <div className="flex min-w-0 flex-1 flex-col">
                                <strong className="truncate text-sm font-semibold">{place.label}</strong>
                                <span className="truncate text-xs text-muted">{place.address}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSavedPlaces(removeCustomPlace(place.id))}
                                aria-label={`${t('account.remove')} ${place.label}`}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-signal"
                            >
                                <Trash2 size={18} aria-hidden="true" />
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => setAddingPlace('custom')}
                        className="flex h-12 items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#B4B8C0] text-sm font-semibold"
                    >
                        <Plus size={18} aria-hidden="true" />
                        {t('places.add')}
                    </button>
                </Section>

                <Section title={t('lang.label')}>
                    <LanguagePicker dark={false} />
                </Section>

                <Section title={t('account.password')}>
                    <AccountSecurity onLoggedOut={() => window.location.replace('/Userlogin')} />
                </Section>

                <nav aria-label={t('legal.support')} className="flex flex-col gap-1 rounded-[24px] bg-white p-2">
                    <Link to="/support" className="flex h-14 items-center gap-3 rounded-[16px] px-3 text-base font-semibold">
                        <LifeBuoy size={20} aria-hidden="true" />
                        {t('legal.support')}
                    </Link>
                    <div className="flex gap-4 px-3 pb-2 text-sm text-muted">
                        <Link to="/terms" className="underline underline-offset-4">
                            {t('legal.terms')}
                        </Link>
                        <Link to="/privacy" className="underline underline-offset-4">
                            {t('legal.privacy')}
                        </Link>
                    </div>
                </nav>

                <Link to="/user/logout" className="btn-ghost gap-2 border-signal/30 text-signal">
                    <LogOut size={18} aria-hidden="true" />
                    {t('logout')}
                </Link>

                <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="flex h-12 items-center justify-center gap-2 text-sm font-semibold text-muted underline underline-offset-4"
                >
                    <Trash2 size={16} aria-hidden="true" />
                    {t('account.delete')}
                </button>
            </div>

            <SavePlaceSheet kind={addingPlace} onClose={() => setAddingPlace(null)} onSave={handleSavePlace} />

            {confirmDelete ? (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 sm:items-center">
                    <div role="alertdialog" aria-modal="true" aria-labelledby="delete-title" className="w-full max-w-md rounded-[24px] bg-white p-6">
                        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-signal/10 text-signal" aria-hidden="true">
                            <Trash2 size={22} />
                        </span>
                        <h2 id="delete-title" className="font-display text-xl font-semibold">
                            {t('account.deleteTitle')}
                        </h2>
                        <p className="mb-4 mt-2 text-sm leading-relaxed text-muted">{t('account.deleteBody')}</p>
                        <FormError message={deleteError} />
                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={deleteAccount}
                                disabled={deleting}
                                className="flex h-14 w-full items-center justify-center rounded-[14px] bg-signal text-base font-semibold text-white disabled:opacity-60"
                            >
                                {deleting ? t('loading') : t('account.deleteConfirm')}
                            </button>
                            <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting} className="btn-ghost">
                                {t('account.cancel')}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default Account;
