import { useEffect, useState } from 'react';
import axios from 'axios';
import { Check, MapPin, X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

const API = import.meta.env.VITE_BASE_URL;

// Bottom sheet for saving Home, Work or a named place: pick an address from
// search suggestions, give it a name if it's a custom place, save.
export default function SavePlaceSheet({ kind, onClose, onSave }) {
    const { t } = useLanguage();
    const open = Boolean(kind);
    const [name, setName] = useState('');
    const [query, setQuery] = useState('');
    const [address, setAddress] = useState('');
    const [suggestions, setSuggestions] = useState([]);

    const title = kind === 'home' ? t('home.setHome') : kind === 'work' ? t('home.setWork') : t('places.addTitle');
    const canSave = Boolean(address) && (kind !== 'custom' || name.trim().length > 0);

    useEffect(() => {
        if (!open || address || query.trim().length < 2) return undefined;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            axios
                .get(`${API}/maps/get-suggestions`, {
                    params: { input: query },
                    headers: { Authorization: `Bearer ${localStorage.getItem('userToken')}` },
                    signal: controller.signal,
                })
                .then((response) => setSuggestions(Array.isArray(response.data) ? response.data : []))
                .catch(() => {});
        }, 300);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [open, query, address]);

    const close = () => {
        setName('');
        setQuery('');
        setAddress('');
        setSuggestions([]);
        onClose();
    };

    const save = () => {
        if (!canSave) return;
        onSave(kind, address, name);
        close();
    };

    return (
        <div className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
            <div
                className={`absolute inset-0 bg-ink/40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
                onClick={close}
                aria-hidden="true"
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={`sheet absolute inset-x-0 bottom-0 mx-auto flex max-h-[85%] max-w-xl flex-col gap-4 overflow-y-auto px-5 pb-7 pt-4 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? 'translate-y-0' : 'translate-y-full shadow-none'}`}
            >
                <div className="flex items-center justify-between">
                    <h2 className="font-display text-xl font-semibold">{title}</h2>
                    <button type="button" onClick={close} aria-label={t('account.cancel')} className="flex h-11 w-11 items-center justify-center rounded-full bg-paper">
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>

                {kind === 'custom' ? (
                    <div>
                        <label className="label" htmlFor="place-name">
                            {t('places.name')}
                        </label>
                        <input
                            id="place-name"
                            className="field"
                            value={name}
                            maxLength={30}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t('places.namePlaceholder')}
                        />
                    </div>
                ) : null}

                <div>
                    <label className="label" htmlFor="place-address">
                        {t('places.address')}
                    </label>
                    {address ? (
                        <div className="flex items-center gap-3 rounded-[14px] border-2 border-ink bg-white px-4 py-3">
                            <MapPin size={18} className="shrink-0" aria-hidden="true" />
                            <span className="min-w-0 flex-1 text-sm font-semibold">{address}</span>
                            <button
                                type="button"
                                onClick={() => {
                                    setAddress('');
                                    setQuery('');
                                }}
                                className="shrink-0 text-sm font-semibold underline underline-offset-4"
                            >
                                {t('places.change')}
                            </button>
                        </div>
                    ) : (
                        <input
                            id="place-address"
                            className="field"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t('home.destination')}
                            autoComplete="off"
                        />
                    )}
                </div>

                {!address && query.trim().length >= 2 ? (
                    <ul className="flex flex-col">
                        {suggestions.map((suggestion) => (
                            <li key={suggestion.place_id || suggestion.description}>
                                <button
                                    type="button"
                                    onClick={() => setAddress(suggestion.description)}
                                    className="flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left active:bg-paper"
                                >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper" aria-hidden="true">
                                        <MapPin size={18} />
                                    </span>
                                    <span className="text-sm font-medium">{suggestion.description}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : null}

                <button type="button" onClick={save} disabled={!canSave} className="btn-primary gap-2">
                    <Check size={20} aria-hidden="true" />
                    {t('places.save')}
                </button>
            </div>
        </div>
    );
}
