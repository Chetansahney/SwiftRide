const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const { env, checkEnv } = require('./config/env');
const { securityHeaders, corsPolicy, apiLimiter, rejectOperatorInjection } = require('./middleware/security.middleware');
const connectToDB = require('./db/db');
const { HttpError } = require('./utils/httpError');
const userRoutes = require('./routes/users.routes');
const captainRoutes = require('./routes/captain.routes');
const mapsRoutes = require('./routes/maps.routes');
const rideRoutes = require('./routes/ride.routes');
const adminRoutes = require('./routes/admin.routes');

checkEnv();
if (!env.isTest) connectToDB();

const app = express();

// Render / Vercel sit behind one proxy: needed for correct client IPs in rate limits.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(securityHeaders);
app.use(corsPolicy);
app.use(apiLimiter);

// Identity verification sends a licence photo and three selfies; shift checks two.
app.use(['/captains/verification', '/captains/shift-selfie'], express.json({ limit: '4mb' }));
// 1 MB so captains can upload a compressed shift selfie.
app.use(express.json({ limit: '1mb' }));
app.use(rejectOperatorInjection);

app.get('/', (req, res) => {
    res.json({ name: 'SwiftRide API', status: 'ok' });
});
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

app.use('/users', userRoutes);
app.use('/captains', captainRoutes);
app.use('/maps', mapsRoutes);
app.use('/rides', rideRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
    res.status(404).json({ message: 'Not found' });
});

// One place for unexpected errors: log the details, send the client nothing internal.
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
    if (error instanceof HttpError) return res.status(error.status).json({ message: error.message, error: error.message, ...error.extra });
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'That upload is too large.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid request.' });
    if (error.name === 'CastError') return res.status(404).json({ message: 'Not found' });
    if (error.name === 'ValidationError') return res.status(400).json({ message: 'Some details are invalid.' });
    console.error(`[error] ${req.method} ${req.path}:`, error);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
});

module.exports = app;
