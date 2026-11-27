// Optional ping to the safety team's chat when an alert is raised, so it
// reaches someone's phone even when nobody has the admin screen open.
//
// SAFETY_WEBHOOK_URL: an incoming-webhook URL from Slack, Discord or Google
// Chat (all free). The message carries no names, phone numbers or locations;
// those stay on the admin screen, behind the ADMIN_KEY.
const axios = require('axios');
const { env } = require('../config/env');

const LABELS = {
    sos: 'SOS button',
    silent_sos: 'Silent SOS',
    no_response: 'No answer to "Are you okay?"',
    not_safe: "Said they don't feel safe",
    wrong_driver: 'Wrong driver or vehicle',
    route_deviation: 'Ride went off route',
    long_stop: 'Ride stopped for long',
    ended_away_from_drop: 'Ride ended away from the drop',
};

const WHO = { rider: 'rider', captain: 'captain', system: 'automatic' };

// Where the team opens the alerts screen.
function adminUrl() {
    const base = (process.env.APP_URL || env.corsOrigins[0] || '').replace(/\/$/, '');
    return base ? `${base}/admin/review` : '';
}

function message(alert) {
    const time = new Date(alert.createdAt || Date.now()).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
    const link = adminUrl();
    return `🚨 SwiftRide safety alert: ${LABELS[alert.reason] || alert.reason} (${WHO[alert.raisedBy] || alert.raisedBy}) at ${time} IST.${link ? ` Open ${link}` : ''}`;
}

// Never throws: a failed ping must not hold up or break the rider's request.
async function notifyTeam(alert) {
    const url = process.env.SAFETY_WEBHOOK_URL;
    if (!url) return false;
    const text = message(alert);
    // Discord expects "content"; Slack, Google Chat and most others "text".
    const body = /discord(app)?\.com\/api\/webhooks\//.test(url) ? { content: text } : { text };
    try {
        await axios.post(url, body, { timeout: 5000 });
        return true;
    } catch (error) {
        console.error('[safety] Team chat ping failed:', error.message);
        return false;
    }
}

module.exports = { notifyTeam, message, LABELS };
