import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowRight, Briefcase, Check, ChevronDown, History, House, LocateFixed, MapPin, Mic, Pencil, Plus, RotateCcw, Search, TrainFront, User } from 'lucide-react';
import LocationSearchPanel from '../components/LocationSearchPanel';
import VehiclePanel from '../components/VehiclePanel';
import ConfirmRide from '../components/ConfirmRide';
import LookingForDriver from '../components/LookingForDriver';
import WaitingForDriver from '../components/WaitingForDriver';
import LiveTracking from '../components/livetracking';
import WomanIcon from '../components/ui/WomanIcon';
import ShareTripSheet from '../components/safety/ShareTripSheet';
import SosSheet from '../components/safety/SosSheet';
import ReportSheet from '../components/safety/ReportSheet';
import { LanguageToggle, Logo } from '../components/ui/Brand';
import { UserDataContext } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { STRINGS } from '../i18n/strings';
import { FEATURES, isLateEvening, shortPlace } from '../lib/config';
import { nearParams, reverseGeocode, useLocation } from '../lib/maps';
import { addRecentPlace, getRecentPlaces, getSavedPlaces, savePlace } from '../lib/places';
import useSpeechInput from '../lib/useSpeechInput';
import socket from '../socket';

const API = import.meta.env.VITE_BASE_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('userToken')}` });

// Bottom sheet that slides up over the map.
function Sheet({ open, children, className = '' }) {
    return (
        <div
            className={`sheet fixed inset-x-0 bottom-0 z-30 mx-auto max-h-[92%] max-w-xl overflow-y-auto px-5 pb-7 pt-3 transition-transform duration-500 ease-in-out ${open ? 'translate-y-0' : 'pointer-events-none translate-y-full shadow-none'} ${className}`}
            aria-hidden={!open}
        >
            {children}
        </div>
    );
}

const CHIP_ICONS = { home: House, work: Briefcase, custom: MapPin, transit: TrainFront, recent: History, add: Plus };

const Home = () => {
    const { t, current, lang } = useLanguage();
    const navigate = useNavigate();
    const { user, setUser } = React.useContext(UserDataContext);

    // Pickup is either "where I'm standing" (default) or a place the rider chose.
    const { position: userLocation, denied: geoDenied, retry: retryLocation } = useLocation();
    const [pickupMode, setPickupMode] = useState('current');
    const [customPickup, setCustomPickup] = useState('');
    const [currentAddress, setCurrentAddress] = useState('');
    const [destination, setDestination] = useState('');

    const [panelOpen, setPanelOpen] = useState(false);
    const [activeInput, setActiveInput] = useState(null);
    const [savingPlace, setSavingPlace] = useState(null);
    const [savedPlaces, setSavedPlaces] = useState(getSavedPlaces);
    const [recentPlaces, setRecentPlaces] = useState(getRecentPlaces);
    const [nearestTransit, setNearestTransit] = useState(null);
    const [voiceGuess, setVoiceGuess] = useState(null);

    const [vehiclePanel, setVehiclePanel] = useState(false);
    const [confirmRidePanel, setConfirmRidePanel] = useState(false);
    const [lookingForDriverPanel, setLookingForDriverPanel] = useState(false);
    const [waitingForDriver, setWaitingForDriver] = useState(false);
    const [fare, setFare] = useState(null);
    const [distanceTime, setDistanceTime] = useState(null);
    const [nearby, setNearby] = useState(null);
    const [selectedVehicle, setSelectedVehicle] = useState('auto');
    const [createdRide, setCreatedRide] = useState(null);
    const [confirmedRide, setConfirmedRide] = useState(null);
    const [rideOtp, setRideOtp] = useState(null);
    const [ride, setRide] = useState(null);
    // Short message at the top of the map (ride cancelled, captain dropped, ...).
    const [notice, setNotice] = useState(null);
    // Live search progress from the dispatcher, and the "no woman captain" choice.
    const [search, setSearch] = useState(null);
    const [noWomenPrompt, setNoWomenPrompt] = useState(false);
    useEffect(() => {
        if (!notice) return undefined;
        const timer = setTimeout(() => setNotice(null), 6000);
        return () => clearTimeout(timer);
    }, [notice]);

    // Safety: "I'm a woman travelling" lives on the profile (falls back to this
    // device before the profile loads), plus the share / SOS / report sheets.
    const [localWomenMode, setLocalWomenMode] = useState(() => localStorage.getItem('swiftride.womenMode') === '1');
    const womenMode = user?.safetyPrefs?.travellingAsWoman ?? localWomenMode;
    const [allowAnyCaptain, setAllowAnyCaptain] = useState(true);
    const [shareSheet, setShareSheet] = useState(null);
    const [sosOpen, setSosOpen] = useState(false);
    const [reportOpen, setReportOpen] = useState(false);
    const shareNudgeRef = useRef({ womenMode: false, shareAtNight: true });
    useEffect(() => {
        shareNudgeRef.current = { womenMode, shareAtNight: user?.safetyPrefs?.shareAtNight !== false };
    });

    const toggleWomenMode = () => {
        const next = !womenMode;
        setLocalWomenMode(next);
        localStorage.setItem('swiftride.womenMode', next ? '1' : '0');
        if (user) {
            setUser({ ...user, safetyPrefs: { ...(user.safetyPrefs || {}), travellingAsWoman: next } });
            axios
                .patch(`${API}/users/safety`, { safetyPrefs: { travellingAsWoman: next } }, { headers: authHeaders() })
                .then((response) => setUser(response.data))
                .catch(() => {});
        }
    };

    const destinationInputRef = useRef(null);
    const pickupInputRef = useRef(null);

    const coordinateString = userLocation ? `${userLocation.lat.toFixed(6)},${userLocation.lng.toFixed(6)}` : '';
    const pickup = pickupMode === 'current' ? currentAddress || coordinateString : customPickup;
    const pickupIsCurrent = pickupMode === 'current';
    const pickupLabel = pickupIsCurrent ? currentAddress || t('home.currentLocation') : customPickup;
    const pickupCardText = pickupIsCurrent
        ? userLocation
            ? currentAddress
                ? shortPlace(currentAddress)
                : t('home.currentLocation')
            : geoDenied
                ? t('home.setPickup')
                : t('home.locating')
        : shortPlace(customPickup) || t('home.setPickup');

    // Rounded to ~100 m so small GPS jitter doesn't trigger new lookups.
    const locationKey = userLocation ? `${userLocation.lat.toFixed(3)},${userLocation.lng.toFixed(3)}` : null;

    useEffect(() => {
        if (!locationKey) return undefined;
        let cancelled = false;
        reverseGeocode(userLocation).then((address) => {
            if (!cancelled && address) setCurrentAddress(address);
        });
        const controller = new AbortController();
        axios
            .get(`${API}/maps/nearest-transit`, {
                params: { lat: userLocation.lat, lng: userLocation.lng },
                headers: authHeaders(),
                signal: controller.signal,
            })
            .then((response) => {
                if (!cancelled) setNearestTransit(response.data || null);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
            controller.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locationKey]);

    const focusField = (field) => {
        // Wait for the card to finish growing before the keyboard opens.
        setTimeout(() => {
            (field === 'pickup' ? pickupInputRef : destinationInputRef).current?.focus();
        }, 350);
    };

    const openSearch = (field = 'destination') => {
        setActiveInput(field);
        setPanelOpen(true);
        focusField(field);
    };

    const closeSearch = () => {
        setPanelOpen(false);
        setSavingPlace(null);
    };

    const goToDestination = (address) => {
        setDestination(address);
        if (pickup) {
            setPanelOpen(false);
            setVehiclePanel(true);
        } else {
            openSearch('pickup');
        }
    };

    const afterPickupChosen = () => {
        if (destination.trim()) {
            setPanelOpen(false);
            setVehiclePanel(true);
        } else {
            setActiveInput('destination');
            destinationInputRef.current?.focus();
        }
    };

    const chooseDestination = (address) => {
        if (savingPlace) {
            setSavedPlaces(savePlace(savingPlace, address));
            setSavingPlace(null);
        }
        setDestination(address);
    };

    // Voice: on the home card we confirm what we heard before booking; inside the
    // search sheet the words simply go into the drop field.
    const voice = useSpeechInput(current.speech, (text) => {
        if (panelOpen) {
            setDestination(text);
            setActiveInput('destination');
            return;
        }
        setVoiceGuess({ text, place: null });
        axios
            .get(`${API}/maps/get-suggestions`, { params: { input: text, ...nearParams() }, headers: authHeaders() })
            .then((response) => setVoiceGuess({ text, place: response.data?.[0]?.description || text }))
            .catch(() => setVoiceGuess({ text, place: text }));
    });

    const quickPlaces = [
        { key: 'home', label: t('home.home'), address: savedPlaces.home },
        { key: 'work', label: t('home.work'), address: savedPlaces.work },
        ...(savedPlaces.custom || []).map((place) => ({ key: 'custom', label: place.label, address: place.address })),
        nearestTransit?.address ? { key: 'transit', label: nearestTransit.name, address: nearestTransit.address } : null,
        ...recentPlaces
            .filter((place) => place !== savedPlaces.home && place !== savedPlaces.work)
            .slice(0, 2)
            .map((place) => ({ key: 'recent', label: shortPlace(place), address: place })),
        { key: 'add', label: t('home.addPlace') },
    ].filter(Boolean);

    // Saved places are destinations: tapping one fills the drop field and opens
    // "Plan your ride" so the rider can see it before choosing a vehicle.
    const fillDestination = (address) => {
        setDestination(address);
        setSavingPlace(null);
        setPanelOpen(true);
        if (pickup) {
            setActiveInput(null);
        } else {
            setActiveInput('pickup');
            focusField('pickup');
        }
    };

    const onQuickPlace = (place) => {
        if (place.key === 'add') {
            navigate('/account?addPlace=1');
        } else if (place.address) {
            fillDestination(place.address);
        } else {
            setSavingPlace(place.key);
            setDestination('');
            openSearch('destination');
        }
    };

    const fetchRideDetails = async (rideId) => {
        if (!localStorage.getItem('userToken') || !rideId) return;
        try {
            const response = await axios.get(`${API}/rides/${rideId}`, { headers: authHeaders() });
            if (response?.data?._id) {
                setConfirmedRide(response.data);
                setRide(response.data);
            }
        } catch (error) {
            console.error('Failed to fetch ride details:', error.response?.data || error.message);
        }
    };

    useEffect(() => {
        const handleRideConfirmed = (confirmed) => {
            if (!confirmed) return;
            setConfirmedRide(confirmed);
            setRide(confirmed);
            localStorage.setItem('activeRide', JSON.stringify(confirmed));
            setLookingForDriverPanel(false);
            setWaitingForDriver(true);
            if (!confirmed.captain || !confirmed.captain.vehicle) {
                fetchRideDetails(confirmed._id);
            }
            // Late at night, or for women riders, offer to share the live trip straight away.
            const nudge = shareNudgeRef.current;
            const late = isLateEvening() && nudge.shareAtNight;
            if (late || nudge.womenMode) {
                setTimeout(() => setShareSheet(late ? 'night' : 'prompt'), 700);
            }
        };
        // Captain reached the pickup: show "arrived" with the free-waiting countdown.
        const handleCaptainArrived = (arrived) => {
            if (!arrived) return;
            setRide(arrived);
            setConfirmedRide(arrived);
        };
        // The captain dropped the ride: it's already been offered to others at the same fare.
        const handleRequeued = (requeued) => {
            setConfirmedRide(null);
            setRide(requeued || null);
            setWaitingForDriver(false);
            setLookingForDriverPanel(true);
            setNotice(requeued?.guaranteeCredit ? { key: 'ride.requeuedCredit', vars: { amount: requeued.guaranteeCredit } } : 'ride.requeued');
        };
        const handleProgress = (progress) => setSearch(progress);
        const handleNoWomen = () => setNoWomenPrompt(true);
        // Nobody accepted for 10 minutes: the request was closed.
        const handleExpired = () => {
            setLookingForDriverPanel(false);
            setRide(null);
            setCreatedRide(null);
            setSearch(null);
            setNoWomenPrompt(false);
            localStorage.removeItem('activeRide');
            setNotice('ride.noCaptain');
        };
        socket.on('ride-confirmed', handleRideConfirmed);
        socket.on('captain-arrived', handleCaptainArrived);
        socket.on('ride-requeued', handleRequeued);
        socket.on('dispatch-progress', handleProgress);
        socket.on('dispatch-no-women', handleNoWomen);
        socket.on('ride-expired', handleExpired);
        return () => {
            socket.off('ride-confirmed', handleRideConfirmed);
            socket.off('captain-arrived', handleCaptainArrived);
            socket.off('ride-requeued', handleRequeued);
            socket.off('dispatch-progress', handleProgress);
            socket.off('dispatch-no-women', handleNoWomen);
            socket.off('ride-expired', handleExpired);
        };
    }, []);

    useEffect(() => {
        const handleRideStarted = (started) => {
            if (started) {
                setRide(started);
                localStorage.setItem('activeRide', JSON.stringify(started));
            }
            navigate('/start-ride');
        };
        socket.on('ride-started', handleRideStarted);
        return () => socket.off('ride-started', handleRideStarted);
    }, [navigate]);

    useEffect(() => {
        const loadProfile = async () => {
            if (user?._id || !localStorage.getItem('userToken')) return;
            try {
                const response = await axios.get(`${API}/users/profile`, { headers: authHeaders() });
                if (response?.data?._id) setUser(response.data);
            } catch (error) {
                console.error('Failed to load user profile:', error.response?.data || error.message);
            }
        };
        loadProfile();
    }, [user, setUser]);

    useEffect(() => {
        if (!user?._id) return undefined;
        // The server identifies us by the login token; re-join after every reconnect.
        const join = () => socket.emit('join', { token: localStorage.getItem('userToken'), userType: 'user' });
        join();
        socket.on('connect', join);
        return () => socket.off('connect', join);
    }, [user?._id]);

    useEffect(() => {
        if (!waitingForDriver || !ride?._id) return;
        if (ride.captain && ride.captain.vehicle) return;
        fetchRideDetails(ride._id);
    }, [waitingForDriver, ride]);

    useEffect(() => {
        if (!pickup.trim() || !destination.trim()) {
            setFare(null);
            setDistanceTime(null);
            setNearby(null);
            return;
        }
        const controller = new AbortController();
        const headers = authHeaders();
        const fetchFareAndTime = async () => {
            // Distance to the nearest driver of each type; optional, so a failure
            // just hides the "200 m from pickup" line.
            axios
                .get(`${API}/rides/nearby`, { params: { origin: pickup, ...nearParams() }, headers, signal: controller.signal })
                .then((response) => setNearby(response.data))
                .catch((error) => {
                    if (error.code !== 'ERR_CANCELED') setNearby(null);
                });
            try {
                const [fareResponse, distanceResponse] = await Promise.all([
                    axios.get(`${API}/rides/calculate-fare`, {
                        params: { origin: pickup, destination, ...nearParams() },
                        headers,
                        signal: controller.signal,
                    }),
                    axios.get(`${API}/maps/get-distance-time`, {
                        params: { origin: pickup, destination, ...nearParams() },
                        headers,
                        signal: controller.signal,
                    }),
                ]);
                setFare(fareResponse.data);
                setDistanceTime(distanceResponse.data);
            } catch (error) {
                if (error.code === 'ERR_CANCELED') return;
                console.error('Error fetching fare or distance:', error);
                setFare(null);
                setDistanceTime(null);
            }
        };
        const timer = setTimeout(fetchFareAndTime, 300);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [pickup, destination]);

    async function createRide(vehicleType) {
        try {
            const response = await axios.post(
                `${API}/rides/create`,
                {
                    origin: pickup,
                    destination,
                    vehicleType,
                    ...nearParams(),
                    travellingAsWoman: womenMode,
                    // With no woman captain nearby the rider chooses: any verified captain, or keep waiting.
                    preferWomenCaptain: womenMode && !(nearby && nearby.women?.[vehicleType] == null && allowAnyCaptain),
                },
                { headers: authHeaders() }
            );
            setCreatedRide(response.data.ride || null);
            setRideOtp(response.data.otp || null);
            setRide(response.data.ride || null);
            setRecentPlaces(addRecentPlace(destination));
            localStorage.setItem('activeRide', JSON.stringify(response.data.ride || null));
            localStorage.setItem('selectedVehicle', vehicleType);
            return response.data.ride;
        } catch (error) {
            console.error('Error creating ride:', error.response?.data || error.message);
            if (error.response?.status === 409) setNotice('ride.alreadyActive');
            return null;
        }
    }

    // No woman captain nearby: the rider opens the ride to any verified captain.
    async function openToAnyCaptain() {
        const current = ride || createdRide;
        setNoWomenPrompt(false);
        if (!current?._id) return;
        await axios.post(`${API}/rides/${current._id}/allow-any-captain`, {}, { headers: authHeaders() }).catch(() => {});
    }

    // Free before the ride starts. Clears the booking so the rider can book again.
    async function cancelRide() {
        const current = ride || confirmedRide || createdRide;
        if (!current?._id) return;
        try {
            await axios.post(`${API}/rides/${current._id}/cancel`, { reason: 'rider_cancelled' }, { headers: authHeaders() });
        } catch (error) {
            // Already started or ended: keep showing the ride.
            if (error.response?.status === 409) return;
        }
        setLookingForDriverPanel(false);
        setWaitingForDriver(false);
        setRide(null);
        setCreatedRide(null);
        setConfirmedRide(null);
        setRideOtp(null);
        localStorage.removeItem('activeRide');
        setNotice('ride.cancelled');
    }

    const searchHidden = vehiclePanel || confirmRidePanel || lookingForDriverPanel || waitingForDriver || Boolean(voiceGuess);
    const firstName = user?.name?.firstname;
    const greeting = firstName ? t('home.greeting', { name: firstName }) : t('home.greetingNoName');
    // A second line in another language, so riders recognise it at a glance.
    const secondLang = lang === 'en' ? 'hi' : 'en';
    const greetingSecond = STRINGS[secondLang]['home.greetingNoName'];
    const searchTitle = savingPlace ? t(savingPlace === 'home' ? 'home.setHome' : 'home.setWork') : t('home.planTitle');

    // One card that morphs: a floating "where to?" card, then a full "Plan your ride" sheet.
    const cardShape = panelOpen
        ? 'inset-x-0 bottom-0 h-[calc(100%-5.5rem)] rounded-t-[28px] rounded-b-none'
        : 'inset-x-3 bottom-4 h-[262px] rounded-[26px]';

    const micButton = (size) =>
        voice.supported ? (
            <button
                type="button"
                onClick={voice.listening ? voice.stop : voice.start}
                aria-label={t('home.speak')}
                aria-pressed={voice.listening}
                className={`flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-[18px] ${size} ${voice.listening ? 'bg-volt text-ink' : 'bg-ink text-white'}`}
            >
                <Mic size={22} className={voice.listening ? 'animate-pulse' : 'text-volt'} aria-hidden="true" />
                <span className="text-[12px] font-semibold leading-none">{voice.listening ? '…' : t('home.speakShort')}</span>
            </button>
        ) : null;

    return (
        <div className="relative h-full overflow-hidden bg-[#EEF0F2]">
            <div className="absolute inset-0 z-0">
                <LiveTracking />
            </div>

            {notice ? (
                <div role="status" className="fixed inset-x-4 top-4 z-[60] mx-auto max-w-xl rounded-2xl bg-ink px-4 py-3 text-sm font-medium text-white shadow-float">
                    {typeof notice === 'string' ? t(notice) : t(notice.key, notice.vars)}
                </div>
            ) : null}

            <div className="absolute inset-x-5 top-6 z-10 mx-auto flex max-w-xl items-center justify-between gap-2">
                <span className="flex h-12 items-center rounded-full bg-white px-4 shadow-float">
                    <Logo />
                </span>
                <div className="flex items-center gap-2">
                    {FEATURES.rideGuarantee ? (
                        <span className="hidden h-10 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] font-semibold text-white shadow-float min-[400px]:flex">
                            <span className="h-2 w-2 rounded-full bg-volt" aria-hidden="true" />
                            {t('guarantee.name')}
                        </span>
                    ) : null}
                    <LanguageToggle />
                    <Link
                        to="/account"
                        aria-label={t('account.title')}
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-ink font-display text-base font-semibold text-volt shadow-float ring-2 ring-white"
                    >
                        {firstName ? firstName.slice(0, 1).toUpperCase() : <User size={20} aria-hidden="true" />}
                    </Link>
                </div>
            </div>

            <div
                className={`absolute z-20 mx-auto max-w-xl overflow-hidden bg-white shadow-sheet transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${cardShape} ${searchHidden ? 'pointer-events-none translate-y-[120%] shadow-none' : ''}`}
            >
                {!panelOpen ? (
                    <div key="idle" className="flex h-full flex-col gap-2.5 p-3 animate-fade-up">
                        <button
                            type="button"
                            onClick={() => openSearch('pickup')}
                            className="flex h-10 min-w-0 items-center gap-2 rounded-xl px-2 text-left active:bg-paper"
                        >
                            <span className="h-3 w-3 shrink-0 rounded-full border-[3px] border-ink bg-volt" aria-hidden="true" />
                            <span className="shrink-0 text-[13px] text-muted">{t('ride.pickup')}:</span>
                            <strong className="min-w-0 truncate text-sm font-semibold">{pickupCardText}</strong>
                            <span className="ml-auto shrink-0 text-[13px] font-semibold underline underline-offset-4">{t('home.change')}</span>
                        </button>

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => openSearch('destination')}
                                className="flex h-[68px] min-w-0 flex-1 items-center gap-3 rounded-[18px] bg-paper px-3 text-left"
                            >
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-volt text-ink" aria-hidden="true">
                                    <Search size={22} strokeWidth={2.2} />
                                </span>
                                <span className="flex min-w-0 flex-col">
                                    <strong className="line-clamp-2 font-display text-[16px] font-semibold leading-tight tracking-tight">{greeting}</strong>
                                    <span className="truncate text-[13px] text-muted" lang={secondLang}>
                                        {greetingSecond}
                                    </span>
                                </span>
                            </button>
                            {micButton('h-[68px] w-[68px]')}
                        </div>

                        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
                            {quickPlaces.map((place) => {
                                const Icon = CHIP_ICONS[place.key];
                                return (
                                    <button
                                        key={`${place.key}-${place.address || place.label}`}
                                        type="button"
                                        onClick={() => onQuickPlace(place)}
                                        className={`flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold ${place.address ? 'bg-paper text-ink' : 'border border-dashed border-[#B4B8C0] text-muted'}`}
                                    >
                                        <Icon size={16} aria-hidden="true" />
                                        <span className="max-w-[150px] truncate">{place.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            type="button"
                            role="switch"
                            aria-checked={womenMode}
                            onClick={toggleWomenMode}
                            className={`flex h-[50px] items-center gap-3 rounded-[16px] px-3 text-left transition ${womenMode ? 'bg-ink text-white' : 'bg-paper text-ink'}`}
                        >
                            <span
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${womenMode ? 'bg-volt text-ink' : 'bg-white text-ink'}`}
                                aria-hidden="true"
                            >
                                <WomanIcon size={22} />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col">
                                <strong className="text-sm font-semibold leading-tight">{t('safety.womanToggle')}</strong>
                                <span className={`truncate text-[11px] ${womenMode ? 'text-[#B4B8C0]' : 'text-muted'}`}>{t('safety.womanToggleSub')}</span>
                            </span>
                            <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition ${womenMode ? 'bg-volt' : 'bg-[#C5C9D0]'}`} aria-hidden="true">
                                <span className={`h-6 w-6 rounded-full bg-white shadow transition ${womenMode ? 'translate-x-5' : ''}`} />
                            </span>
                        </button>
                    </div>
                ) : (
                    <div key="search" className="flex h-full flex-col gap-4 px-5 pb-6 pt-3 animate-fade-up">
                        <div className="relative flex items-center justify-center">
                            <span className="sheet-handle" aria-hidden="true" />
                            <button
                                type="button"
                                onClick={closeSearch}
                                aria-label="Close"
                                className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full bg-paper"
                            >
                                <ChevronDown size={22} aria-hidden="true" />
                            </button>
                        </div>

                        <h1 className="font-display text-2xl font-semibold tracking-tight">{searchTitle}</h1>

                        <form className="relative flex flex-col gap-2" onSubmit={(e) => e.preventDefault()}>
                            <label
                                className={`relative flex h-14 items-center gap-3 rounded-[14px] px-4 ${activeInput === 'pickup' ? 'bg-white ring-2 ring-ink' : 'bg-paper'}`}
                            >
                                {pickupIsCurrent ? (
                                    <LocateFixed size={14} className="shrink-0 text-ink" aria-hidden="true" />
                                ) : (
                                    <span className="h-3.5 w-3.5 shrink-0 rounded-full border-[3px] border-ink bg-volt" aria-hidden="true" />
                                )}
                                <input
                                    ref={pickupInputRef}
                                    value={pickupIsCurrent && !geoDenied ? t('home.currentLocation') : customPickup}
                                    onFocus={(e) => {
                                        setActiveInput('pickup');
                                        if (pickupIsCurrent) e.target.select();
                                    }}
                                    onChange={(e) => {
                                        setActiveInput('pickup');
                                        setPickupMode('custom');
                                        setCustomPickup(e.target.value);
                                    }}
                                    aria-label={t('home.pickup')}
                                    placeholder={t('home.pickup')}
                                    className={`min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted ${pickupIsCurrent ? 'font-semibold' : 'font-medium'}`}
                                    type="text"
                                />
                            </label>
                            <div className="flex gap-2">
                                <label
                                    className={`relative flex h-14 min-w-0 flex-1 items-center gap-3 rounded-[14px] px-4 ${activeInput === 'destination' ? 'bg-white ring-2 ring-ink' : 'bg-paper'}`}
                                >
                                    <span className="h-3.5 w-3.5 shrink-0 rounded-[3px] bg-ink" aria-hidden="true" />
                                    <input
                                        ref={destinationInputRef}
                                        value={destination}
                                        onFocus={() => setActiveInput('destination')}
                                        onChange={(e) => {
                                            setActiveInput('destination');
                                            setDestination(e.target.value);
                                        }}
                                        aria-label={t('home.dropPlaceholder')}
                                        placeholder={voice.listening ? t('home.listening') : t('home.dropPlaceholder')}
                                        className="min-w-0 flex-1 bg-transparent text-base font-medium text-ink outline-none placeholder:text-muted"
                                        type="text"
                                    />
                                </label>
                                {micButton('h-14 w-14')}
                            </div>
                        </form>

                        {pickupIsCurrent && geoDenied ? (
                            <div className="flex items-center gap-3 rounded-[14px] bg-signal/10 px-3 py-2.5" role="status">
                                <span className="flex-1 text-sm text-ink">{t('home.locationOff')}</span>
                                <button
                                    type="button"
                                    onClick={retryLocation}
                                    className="h-10 shrink-0 rounded-full bg-ink px-4 text-xs font-semibold text-white"
                                >
                                    {t('home.allowLocation')}
                                </button>
                            </div>
                        ) : null}

                        {activeInput === 'destination' && !destination.trim() ? (
                            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
                                {quickPlaces
                                    .filter((place) => place.address)
                                    .map((place) => {
                                        const Icon = CHIP_ICONS[place.key];
                                        return (
                                            <button
                                                key={`sheet-${place.key}-${place.address}`}
                                                type="button"
                                                onClick={() => fillDestination(place.address)}
                                                className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-paper px-4 text-sm font-semibold"
                                            >
                                                <Icon size={16} aria-hidden="true" />
                                                <span className="max-w-[150px] truncate">{place.label}</span>
                                            </button>
                                        );
                                    })}
                            </div>
                        ) : null}

                        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto">
                            {activeInput ? (
                            <LocationSearchPanel
                                setPanelOpen={setPanelOpen}
                                setVehiclePanel={setVehiclePanel}
                                setPickup={(value) => {
                                    setPickupMode('custom');
                                    setCustomPickup(value);
                                }}
                                setDestination={chooseDestination}
                                activeInput={activeInput}
                                inputValue={activeInput === 'pickup' ? (pickupIsCurrent ? '' : customPickup) : destination}
                                onPickupChosen={afterPickupChosen}
                                onUseCurrentLocation={
                                    userLocation
                                        ? () => {
                                            setPickupMode('current');
                                            afterPickupChosen();
                                        }
                                        : undefined
                                }
                            />
                            ) : null}
                        </div>

                        {pickup && destination.trim() && activeInput !== 'destination' ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setPanelOpen(false);
                                    setVehiclePanel(true);
                                }}
                                className="btn-primary shrink-0 justify-between pl-5 pr-2"
                            >
                                {t('home.continue')}
                                <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-volt text-ink" aria-hidden="true">
                                    <ArrowRight size={20} />
                                </span>
                            </button>
                        ) : null}
                    </div>
                )}
            </div>

            <Sheet open={Boolean(voiceGuess)}>
                {voiceGuess ? (
                    <div className="flex flex-col gap-4">
                        <span className="sheet-handle" aria-hidden="true" />
                        <p className="text-sm text-muted">{t('voice.youSaid', { text: voiceGuess.text })}</p>
                        <div className="flex items-start gap-3 rounded-2xl bg-paper p-4" aria-live="polite">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-volt" aria-hidden="true">
                                <MapPin size={20} />
                            </span>
                            <div className="flex min-w-0 flex-col">
                                <span className="text-xs text-muted">{t('voice.goingTo')}</span>
                                <strong className="font-display text-[22px] font-semibold leading-tight">
                                    {voiceGuess.place ? shortPlace(voiceGuess.place) : t('voice.finding')}
                                </strong>
                                {voiceGuess.place && voiceGuess.place !== shortPlace(voiceGuess.place) ? (
                                    <span className="text-[13px] text-muted">{voiceGuess.place}</span>
                                ) : null}
                            </div>
                        </div>
                        <button
                            type="button"
                            disabled={!voiceGuess.place}
                            onClick={() => {
                                const place = voiceGuess.place;
                                setVoiceGuess(null);
                                goToDestination(place);
                            }}
                            className="btn-volt gap-2"
                        >
                            <Check size={20} aria-hidden="true" />
                            {t('voice.yes')}
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setVoiceGuess(null);
                                    voice.start();
                                }}
                                className="btn-ghost gap-2"
                            >
                                <RotateCcw size={18} aria-hidden="true" />
                                {t('voice.again')}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const text = voiceGuess.text;
                                    setVoiceGuess(null);
                                    setDestination(text);
                                    openSearch('destination');
                                }}
                                className="btn-ghost gap-2"
                            >
                                <Pencil size={18} aria-hidden="true" />
                                {t('voice.type')}
                            </button>
                        </div>
                    </div>
                ) : null}
            </Sheet>

            <Sheet open={vehiclePanel}>
                <VehiclePanel
                    setVehiclePanel={setVehiclePanel}
                    setConfirmRidePanel={setConfirmRidePanel}
                    fare={fare}
                    distanceTime={distanceTime}
                    selectedVehicle={selectedVehicle}
                    setSelectedVehicle={setSelectedVehicle}
                    nearby={nearby}
                    womenMode={womenMode}
                    allowAnyCaptain={allowAnyCaptain}
                    setAllowAnyCaptain={setAllowAnyCaptain}
                    onBack={() => {
                        setVehiclePanel(false);
                        setPanelOpen(true);
                    }}
                />
            </Sheet>

            <Sheet open={confirmRidePanel}>
                <ConfirmRide
                    setConfirmRidePanel={setConfirmRidePanel}
                    setVehiclePanel={setVehiclePanel}
                    setLookingForDriverPanel={setLookingForDriverPanel}
                    pickup={pickupLabel}
                    destination={destination}
                    fare={fare}
                    distanceTime={distanceTime}
                    selectedVehicle={selectedVehicle}
                    createRide={createRide}
                />
            </Sheet>

            <Sheet open={lookingForDriverPanel}>
                <LookingForDriver
                    setLookingForDriverPanel={setLookingForDriverPanel}
                    setWaitingForDriver={setWaitingForDriver}
                    pickup={pickupLabel}
                    destination={destination}
                    fare={fare}
                    distanceTime={distanceTime}
                    selectedVehicle={selectedVehicle}
                    onCancel={cancelRide}
                    search={search}
                    noWomenPrompt={noWomenPrompt}
                    onAllowAny={openToAnyCaptain}
                    onKeepWaiting={() => setNoWomenPrompt(false)}
                />
            </Sheet>

            <Sheet open={waitingForDriver}>
                <WaitingForDriver
                    key={(ride || confirmedRide || createdRide)?._id || 'none'}
                    ride={ride || confirmedRide || createdRide}
                    otp={rideOtp}
                    setWaitingForDriver={setWaitingForDriver}
                    onShare={() => setShareSheet('manual')}
                    onReport={() => setReportOpen(true)}
                    onSos={() => setSosOpen(true)}
                    onCancel={cancelRide}
                />
            </Sheet>

            <ShareTripSheet
                open={Boolean(shareSheet)}
                onClose={() => setShareSheet(null)}
                ride={ride || confirmedRide || createdRide}
                prompt={shareSheet === 'night' ? t('safety.shareNightPrompt') : shareSheet === 'prompt' ? t('safety.sharePrompt') : undefined}
            />
            <SosSheet
                open={sosOpen}
                onClose={() => setSosOpen(false)}
                ride={ride || confirmedRide || createdRide}
                onShareWithContacts={() => setShareSheet('manual')}
            />
            <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} ride={ride || confirmedRide || createdRide} />
        </div>
    );
};

export default Home;
