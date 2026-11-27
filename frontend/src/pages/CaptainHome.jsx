import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import CaptainDetails from '../components/CaptainDetails';
import RidePopUp from '../components/RidePopUp';
import ConfirmRidePopUp from '../components/ConfirmRidePopUp';
import CaptainRouteMap from '../components/CaptainRouteMap';
import { LanguageToggle, Logo } from '../components/ui/Brand';
import { CaptainDataContext } from '../context/CaptainContext';
import { useLanguage } from '../i18n/LanguageContext';
import socket, { joinAs } from '../socket';

function DarkSheet({ open, children }) {
    return (
        <div
            className={`fixed inset-x-0 bottom-0 z-30 mx-auto max-h-[92%] max-w-xl overflow-y-auto rounded-t-sheet border-t border-night-line bg-night px-5 pb-8 pt-5 text-white transition-transform duration-500 ease-in-out ${open ? 'translate-y-0' : 'pointer-events-none translate-y-full border-transparent'}`}
            aria-hidden={!open}
        >
            {children}
        </div>
    );
}

const CaptainHome = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [ridePopUp, setRidePopUp] = useState(false);
    const [confirmRidePopUp, setconfirmRidePopUp] = useState(false);
    const [ride, setRide] = useState(null);
    const [notice, setNotice] = useState(null);
    useEffect(() => {
        if (!notice) return undefined;
        const timer = setTimeout(() => setNotice(null), 6000);
        return () => clearTimeout(timer);
    }, [notice]);
    const { captain } = useContext(CaptainDataContext);
    // True while accepted/on the way to pickup: new offers are ignored.
    const busyRef = useRef(false);
    const offerRef = useRef(null);
    useEffect(() => {
        busyRef.current = confirmRidePopUp;
        offerRef.current = ride;
    }, [confirmRidePopUp, ride]);
    const expireOffer = useCallback(() => {
        setRidePopUp(false);
        setRide(null);
        setNotice('captain.offerExpired');
    }, []);

    // Join the socket room and share live location every second.
    useEffect(() => {
        if (!captain?._id) return undefined;
        // The live connection says who we are now and again after every reconnect.
        joinAs('captain');

        const locationInterval = setInterval(() => {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    let rideId = ride?._id;
                    if (!rideId) {
                        try {
                            rideId = JSON.parse(localStorage.getItem('activeRide') || 'null')?._id;
                        } catch {
                            rideId = null;
                        }
                    }
                    socket.emit('update-location-captain', {
                        rideId: rideId || undefined,
                        location: { lat: position.coords.latitude, lng: position.coords.longitude },
                    });
                },
                (error) => console.error('Geolocation error:', error)
            );
        }, 1000);

        return () => clearInterval(locationInterval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [captain]);

    useEffect(() => {
        // A new offer, unless this captain is already busy with a ride.
        const handleNewRide = (data) => {
            if (busyRef.current) return;
            setRide(data);
            setRidePopUp(true);
        };
        // The offer was taken by another captain or timed out.
        const handleWithdrawn = (data) => {
            if (busyRef.current || String(offerRef.current?._id) !== String(data?.rideId)) return;
            setRidePopUp(false);
            setRide(null);
            setNotice(data?.reason === 'taken' ? 'captain.offerTaken' : 'captain.offerExpired');
        };
        // The rider cancelled before pickup.
        // Only ever sent for this captain's own (single) active ride.
        const handleCancelled = () => {
            setRide(null);
            setRidePopUp(false);
            setconfirmRidePopUp(false);
            localStorage.removeItem('activeRide');
            setNotice('captain.riderCancelled');
        };
        socket.on('new-ride', handleNewRide);
        socket.on('ride-offer-withdrawn', handleWithdrawn);
        socket.on('ride-cancelled', handleCancelled);
        return () => {
            socket.off('new-ride', handleNewRide);
            socket.off('ride-offer-withdrawn', handleWithdrawn);
            socket.off('ride-cancelled', handleCancelled);
        };
    }, []);

    async function confirmride() {
        if (!ride?._id) return false;
        const token = localStorage.getItem('captainToken');
        try {
            const response = await axios.post(
                `${import.meta.env.VITE_BASE_URL}/rides/confirm`,
                { rideId: ride._id },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (response?.data?.ride) {
                setRide(response.data.ride);
                localStorage.setItem('activeRide', JSON.stringify(response.data.ride));
            }
            return true;
        } catch (error) {
            setNotice(error.response?.status === 409 ? 'captain.offerTaken' : 'captain.offerExpired');
            setRide(null);
            return false;
        }
    }

    // Says no: the next captain is asked straight away (and this one isn't asked again).
    async function declineOffer() {
        const offered = ride;
        setRidePopUp(false);
        setRide(null);
        if (!offered?._id) return;
        await axios
            .post(`${import.meta.env.VITE_BASE_URL}/rides/${offered._id}/decline`, {}, { headers: { Authorization: `Bearer ${localStorage.getItem('captainToken')}` } })
            .catch(() => {});
    }

    async function logout() {
        const token = localStorage.getItem('captainToken');
        try {
            await axios.get(`${import.meta.env.VITE_BASE_URL}/captains/logout`, {
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch (error) {
            console.error('Logout failed:', error.response?.data || error.message);
        } finally {
            localStorage.removeItem('captainToken');
            navigate('/captainlogin');
        }
    }

    return (
        <div className="relative flex h-full flex-col overflow-hidden bg-night text-white">
            <div className="relative min-h-[260px] flex-1">
                <CaptainRouteMap ride={ride} mode="to-pickup" />
                {notice ? (
                    <div role="status" className="fixed inset-x-4 top-4 z-[60] mx-auto max-w-xl rounded-2xl bg-volt px-4 py-3 text-sm font-semibold text-ink">
                        {t(notice)}
                    </div>
                ) : null}
                <div className="absolute inset-x-5 top-6 z-20 mx-auto flex max-w-xl items-center justify-between gap-2">
                    <span className="flex h-12 items-center rounded-full bg-night-card px-4 shadow-float">
                        <Logo dark />
                    </span>
                    <div className="flex items-center gap-2">
                        <LanguageToggle dark />
                        <button
                            type="button"
                            onClick={logout}
                            aria-label={t('logout')}
                            className="flex h-12 w-12 items-center justify-center rounded-full bg-night-card text-white shadow-float"
                        >
                            <LogOut size={20} aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="relative z-10 -mt-7 mx-auto w-full max-w-xl rounded-t-sheet border-t border-night-line bg-night px-5 pb-8 pt-3">
                <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-night-line" aria-hidden="true" />
                <CaptainDetails />
            </div>

            <DarkSheet open={ridePopUp}>
                <RidePopUp
                    ride={ride}
                    setRidePopUp={setRidePopUp}
                    setconfirmRidePopUp={setconfirmRidePopUp}
                    confirmride={confirmride}
                    onDecline={declineOffer}
                    onExpired={expireOffer}
                    pickup={ride?.origin}
                    destination={ride?.destination}
                    fare={ride?.fare}
                    user={ride?.user}
                    distance={ride?.distance}
                    distanceTime={ride?.distanceTime}
                />
            </DarkSheet>

            <DarkSheet open={confirmRidePopUp}>
                <ConfirmRidePopUp key={ride?._id || 'none'} setconfirmRidePopUp={setconfirmRidePopUp} setRidePopUp={setRidePopUp} ride={ride} />
            </DarkSheet>
        </div>
    );
};

export default CaptainHome;
