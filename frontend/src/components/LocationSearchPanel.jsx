import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LocateFixed, MapPin } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

const LocationSearchPanel = ({
    setPanelOpen,
    setVehiclePanel,
    setDestination,
    setPickup,
    activeInput,
    inputValue,
    onPickupChosen,
    onUseCurrentLocation,
}) => {
    const { t } = useLanguage();
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchSuggestions = async () => {
            if (!inputValue || inputValue.trim().length < 2) {
                setSuggestions([]);
                return;
            }
            setLoading(true);
            try {
                const token = localStorage.getItem('userToken');
                const response = await axios.get(`${import.meta.env.VITE_BASE_URL}/maps/get-suggestions`, {
                    params: { input: inputValue },
                    headers: { Authorization: `Bearer ${token}` },
                });
                setSuggestions(response.data);
            } catch (error) {
                console.error('Error fetching suggestions:', error);
                setSuggestions([]);
            } finally {
                setLoading(false);
            }
        };
        const timer = setTimeout(fetchSuggestions, 300);
        return () => clearTimeout(timer);
    }, [inputValue]);

    const handleSuggestionClick = (description) => {
        if (activeInput === 'pickup') {
            setPickup(description);
            onPickupChosen?.();
        } else if (activeInput === 'destination') {
            setDestination(description);
            setVehiclePanel(true);
            setPanelOpen(false);
        }
    };

    const currentLocationRow =
        activeInput === 'pickup' && onUseCurrentLocation ? (
            <li>
                <button
                    type="button"
                    onClick={onUseCurrentLocation}
                    className="flex w-full items-center gap-3.5 rounded-xl px-1 py-3 text-left transition active:bg-paper"
                >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-volt text-ink" aria-hidden="true">
                        <LocateFixed size={18} />
                    </span>
                    <strong className="text-[15px] font-semibold">{t('home.useCurrent')}</strong>
                </button>
            </li>
        ) : null;

    if (loading) {
        return <p className="py-6 text-center text-sm text-muted">{t('home.searching')}</p>;
    }

    if (suggestions.length === 0 && inputValue?.trim().length >= 2) {
        return (
            <ul className="flex flex-col">
                {currentLocationRow}
                <li className="py-6 text-center text-sm text-muted">{t('home.noResults')}</li>
            </ul>
        );
    }

    return (
        <ul className="flex flex-col">
            {currentLocationRow}
            {suggestions.map((suggestion, idx) => {
                const text = suggestion.description || suggestion;
                const [title, ...rest] = String(text).split(',');
                return (
                    <li key={suggestion.place_id || idx}>
                        <button
                            type="button"
                            onClick={() => handleSuggestionClick(text)}
                            className="flex w-full items-center gap-3.5 rounded-xl px-1 py-3 text-left transition active:bg-paper"
                        >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper" aria-hidden="true">
                                <MapPin size={18} />
                            </span>
                            <span className="flex min-w-0 flex-col">
                                <strong className="truncate text-[15px] font-semibold">{title.trim()}</strong>
                                {rest.length ? <span className="truncate text-[13px] text-muted">{rest.join(',').trim()}</span> : null}
                            </span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
};

export default LocationSearchPanel;
