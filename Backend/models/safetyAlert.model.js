const mongoose = require('mongoose');

// Anything the safety team must look at: SOS presses, missed or negative
// check-ins, rides ending away from the drop, wrong-driver reports.
// The team sees them on the admin "Safety alerts" screen (and, if
// SAFETY_WEBHOOK_URL is set, gets a ping in their team chat).
const safetyAlertSchema = new mongoose.Schema({
    ride: { type: mongoose.Schema.Types.ObjectId, ref: 'ride', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    captain: { type: mongoose.Schema.Types.ObjectId, ref: 'Captain' },
    raisedBy: { type: String, enum: ['rider', 'captain', 'system'], required: true },
    reason: {
        type: String,
        enum: ['sos', 'silent_sos', 'route_deviation', 'long_stop', 'no_response', 'not_safe', 'ended_away_from_drop', 'wrong_driver'],
        required: true,
    },
    location: { lat: Number, lng: Number },
    // open → acknowledged ("someone is on it") → resolved (with a note).
    status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open' },
    acknowledgedAt: Date,
    resolvedAt: Date,
    // Who handled it and what happened, written by the team.
    handledBy: { type: String, maxlength: 40 },
    note: { type: String, maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
});

safetyAlertSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('SafetyAlert', safetyAlertSchema);
