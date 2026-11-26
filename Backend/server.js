const http = require('http');
const mongoose = require('mongoose');
const app = require('./app');
const { initializeSocket } = require('./socket');
const { env } = require('./config/env');

const server = http.createServer(app);
// Slow-client protection.
server.headersTimeout = 20000;
server.requestTimeout = 60000;
initializeSocket(server);
server.listen(env.port, () => console.log(`Server is running on port ${env.port}`));

process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));

// Finish in-flight requests before Render restarts the instance.
function shutdown(signal) {
    console.log(`${signal} received, shutting down`);
    server.close(() => mongoose.connection.close(false).finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
