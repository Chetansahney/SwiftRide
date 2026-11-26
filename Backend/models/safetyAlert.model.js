const mongoose = require('mongoose');

// Anything the safety team must look at: SOS presses, missed or negative
// check-ins, rides ending away from the drop, wrong-driver reports.
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
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('SafetyAlert', safetyAlertSchema);
