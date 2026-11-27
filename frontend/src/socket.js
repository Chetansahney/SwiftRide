import { io } from 'socket.io-client';

// The app's one live connection to the server: ride offers, ride updates and
// live locations.
//  - It never stops retrying while the app is open, backing off to one try
//    every 5 seconds. A dead zone, a server restart or a deploy must never
//    leave a captain silently offline or a rider stuck on an old screen.
//  - The server sends events to the connection it last saw for each account,
//    so after every (re)connect we tell it again who is signed in.
const socket = io(import.meta.env.VITE_BASE_URL, {
    transports: ['websocket'],
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
});

let identity = null;

function sendIdentity() {
    if (identity) socket.emit('join', identity);
}

// Pages call this once they know who is signed in: 'user' (rider) or 'captain'.
export function joinAs(userType) {
    const token = localStorage.getItem(userType === 'captain' ? 'captainToken' : 'userToken');
    identity = token ? { token, userType } : null;
    if (socket.connected) sendIdentity();
}

socket.on('connect', sendIdentity);

socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
});

export default socket;
