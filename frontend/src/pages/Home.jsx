import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ChevronDown, LogOut, Mic, Search } from 'lucide-react';
import LocationSearchPanel from '../components/LocationSearchPanel';
import VehiclePanel from '../components/VehiclePanel';
import ConfirmRide from '../components/ConfirmRide';
import LookingForDriver from '../components/LookingForDriver';
import WaitingForDriver from '../components/WaitingForDriver';
import LiveTracking from '../components/livetracking';
import VehicleArt from '../components/ui/VehicleArt';
import { LanguageToggle, Logo } from '../components/ui/Brand';
import { UserDataContext } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { FEATURES, VEHICLES } from '../lib/config';
import useSpeechInput from '../lib/useSpeechInput';
import socket from '../socket';

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

const Home = () => {
    const { t, current } = useLanguage();
    const [pickup, setPickup] = useState('');
    const [destination, setDestination] = useState('');
    const [panelOpen, setPanelOpen] = useState(false);
    const [vehiclePanel, setVehiclePanel] = useState(false);
    const [activeInput, setActiveInput] = useState(null);
    const [confirmRidePanel, setConfirmRidePanel] = useState(false);
    const [lookingForDriverPanel, setLookingForDriverPanel] = useState(false);
    const [waitingForDriver, setWaitingForDriver] = useState(false);
    const [fare, setFare] = useState(null);
    const [distanceTime, setDistanceTime] = useState(null);
    const [selectedVehicle, setSelectedVehicle] = useState('auto');
    const [createdRide, setCreatedRide] = useState(null);
    const [confirmedRide, setConfirmedRide] = useState(null);
    const [rideOtp, setRideOtp] = useState(null);
    const { user, setUser } = React.useContext(UserDataContext);
    const [ride, setRide] = useState(null);
    const navigate = useNavigate();

    const voice = useSpeechInput(current.speech, (text) => {
        setDestination(text);
        setActiveInput('destination');
        setPanelOpen(true);
    });

    const fetchRideDetails = async (rideId) => {
        const token = localStorage.getItem('userToken');
        if (!token || !rideId) return;
        try {
            const response = await axios.get(`${import.meta.env.VITE_BASE_URL}/rides/${rideId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
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
        };
        socket.on('ride-confirmed', handleRideConfirmed);
        return () => socket.off('ride-confirmed', handleRideConfirmed);
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
            if (user?._id) return;
            const token = localStorage.getItem('userToken');
            if (!token) return;
            try {
                const response = await axios.get(`${import.meta.env.VITE_BASE_URL}/users/profile`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (response?.data?._id) setUser(response.data);
            } catch (error) {
                console.error('Failed to load user profile:', error.response?.data || error.message);
            }
        };
        loadProfile();
    }, [user, setUser]);

    useEffect(() => {
        if (!user?._id) return;
        socket.emit('join', { userId: user._id, userType: 'user' });
    }, [user]);

    useEffect(() => {
        if (!waitingForDriver || !ride?._id) return;
        if (ride.captain && ride.captain.vehicle) return;
        fetchRideDetails(ride._id);
    }, [waitingForDriver, ride]);

    useEffect(() => {
        if (!pickup.trim() || !destination.trim()) {
            setFare(null);
            setDistanceTime(null);
            return;
        }
        const controller = new AbortController();
        const token = localStorage.getItem('userToken');
        const fetchFareAndTime = async () => {
            try {
                const [fareResponse, distanceResponse] = await Promise.all([
                    axios.get(`${import.meta.env.VITE_BASE_URL}/rides/calculate-fare`, {
                        params: { origin: pickup, destination },
                        headers: { Authorization: `Bearer ${token}` },
                        signal: controller.signal,
                    }),
                    axios.get(`${import.meta.env.VITE_BASE_URL}/maps/get-distance-time`, {
                        params: { origin: pickup, destination },
                        headers: { Authorization: `Bearer ${token}` },
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
        const token = localStorage.getItem('userToken');
        try {
            const response = await axios.post(
                `${import.meta.env.VITE_BASE_URL}/rides/create`,
                { origin: pickup, destination, vehicleType },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setCreatedRide(response.data.ride || null);
            setRideOtp(response.data.otp || null);
            setRide(response.data.ride || null);
            localStorage.setItem('activeRide', JSON.stringify(response.data.ride || null));
            localStorage.setItem('selectedVehicle', vehicleType);
            return response.data.ride;
        } catch (error) {
            console.error('Error creating ride:', error.response?.data || error.message);
            return null;
        }
    }

    const openSearch = (field) => {
        setActiveInput(field);
        setPanelOpen(true);
    };

    const pickVehicle = (key) => {
        setSelectedVehicle(key);
        if (pickup.trim() && destination.trim()) {
            setPanelOpen(false);
            setVehiclePanel(true);
        } else {
            openSearch(pickup.trim() ? 'destination' : 'pickup');
        }
    };

    const searchHidden = vehiclePanel || confirmRidePanel || lookingForDriverPanel || waitingForDriver;

    return (
        <div className="relative h-full overflow-hidden bg-[#EEF0F2]">
            <div className="absolute inset-0 z-0">
                <LiveTracking />
            </div>

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
                        to="/user/logout"
                        aria-label={t('logout')}
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink shadow-float"
                    >
                        <LogOut size={20} aria-hidden="true" />
                    </Link>
                </div>
            </div>

            <div
                className={`sheet absolute inset-x-0 bottom-0 z-20 mx-auto flex max-w-xl flex-col gap-4 px-5 pb-7 pt-3 transition-all duration-500 ${panelOpen ? 'top-24' : ''} ${searchHidden ? 'pointer-events-none translate-y-full shadow-none' : ''}`}
            >
                <div className="relative flex items-center justify-center">
                    <span className="sheet-handle" aria-hidden="true" />
                    {panelOpen ? (
                        <button
                            type="button"
                            onClick={() => setPanelOpen(false)}
                            aria-label="Close search"
                            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full bg-paper"
                        >
                            <ChevronDown size={22} aria-hidden="true" />
                        </button>
                    ) : null}
                </div>

                <h1 className="font-display text-2xl font-semibold tracking-tight">{t('home.title')}</h1>

                <form className="flex flex-col gap-2" onSubmit={(e) => e.preventDefault()}>
                    <label className="flex h-14 items-center gap-3 rounded-[14px] bg-paper px-4">
                        <span className="h-3 w-3 shrink-0 rounded-full border-[3px] border-ink" aria-hidden="true" />
                        <input
                            value={pickup}
                            onFocus={() => openSearch('pickup')}
                            onChange={(e) => {
                                setActiveInput('pickup');
                                setPickup(e.target.value);
                            }}
                            aria-label={t('home.pickup')}
                            placeholder={t('home.pickup')}
                            className="min-w-0 flex-1 bg-transparent text-base font-medium text-ink outline-none placeholder:text-muted"
                            type="text"
                        />
                    </label>
                    <div className="flex gap-2">
                        <label className="flex h-14 min-w-0 flex-1 items-center gap-3 rounded-[14px] bg-paper px-4">
                            <Search size={20} className="shrink-0" aria-hidden="true" />
                            <input
                                value={destination}
                                onFocus={() => openSearch('destination')}
                                onChange={(e) => {
                                    setActiveInput('destination');
                                    setDestination(e.target.value);
                                }}
                                aria-label={t('home.destination')}
                                placeholder={voice.listening ? t('home.listening') : t('home.destination')}
                                className="min-w-0 flex-1 bg-transparent text-base font-medium text-ink outline-none placeholder:text-muted"
                                type="text"
                            />
                        </label>
                        {voice.supported ? (
                            <button
                                type="button"
                                onClick={voice.listening ? voice.stop : voice.start}
                                aria-label={t('home.speak')}
                                aria-pressed={voice.listening}
                                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] ${voice.listening ? 'bg-volt text-ink' : 'bg-ink text-volt'}`}
                            >
                                <Mic size={22} aria-hidden="true" />
                            </button>
                        ) : null}
                    </div>
                </form>

                {panelOpen ? (
                    <div className="-mx-1 min-h-0 flex-1 overflow-y-auto">
                        <LocationSearchPanel
                            setPanelOpen={setPanelOpen}
                            setVehiclePanel={setVehiclePanel}
                            setPickup={setPickup}
                            setDestination={setDestination}
                            activeInput={activeInput}
                            inputValue={activeInput === 'pickup' ? pickup : destination}
                        />
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-3 gap-2">
                            {VEHICLES.map((vehicle) => (
                                <button
                                    key={vehicle.key}
                                    type="button"
                                    onClick={() => pickVehicle(vehicle.key)}
                                    aria-pressed={selectedVehicle === vehicle.key}
                                    className={`flex flex-col items-center gap-0.5 rounded-2xl px-1 pb-2.5 pt-2 transition ${selectedVehicle === vehicle.key ? 'bg-volt' : 'bg-paper'}`}
                                >
                                    <VehicleArt art={vehicle.art} width={64} />
                                    <strong className="text-sm font-semibold">{t(vehicle.nameKey)}</strong>
                                    <span className="text-xs text-muted">{t(vehicle.noteKey)}</span>
                                </button>
                            ))}
                        </div>
                        {FEATURES.rideGuarantee ? (
                            <div className="flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-volt text-ink" aria-hidden="true">
                                    ✓
                                </span>
                                <span className="text-[13px] leading-snug">{t('guarantee.home')}</span>
                            </div>
                        ) : null}
                    </>
                )}
            </div>

            <Sheet open={vehiclePanel}>
                <VehiclePanel
                    setVehiclePanel={setVehiclePanel}
                    setConfirmRidePanel={setConfirmRidePanel}
                    fare={fare}
                    distanceTime={distanceTime}
                    selectedVehicle={selectedVehicle}
                    setSelectedVehicle={setSelectedVehicle}
                />
            </Sheet>

            <Sheet open={confirmRidePanel}>
                <ConfirmRide
                    setConfirmRidePanel={setConfirmRidePanel}
                    setVehiclePanel={setVehiclePanel}
                    setLookingForDriverPanel={setLookingForDriverPanel}
                    pickup={pickup}
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
                    pickup={pickup}
                    destination={destination}
                    fare={fare}
                    distanceTime={distanceTime}
                    selectedVehicle={selectedVehicle}
                />
            </Sheet>

            <Sheet open={waitingForDriver}>
                <WaitingForDriver
                    ride={ride || confirmedRide || createdRide}
                    otp={rideOtp}
                    setWaitingForDriver={setWaitingForDriver}
                />
            </Sheet>
        </div>
    );
};

export default Home;
