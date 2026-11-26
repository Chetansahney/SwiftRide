const mongoose = require('mongoose');

// A rider's complaint about a ride: being asked for extra money, harassment,
// unsafe driving, or a different driver from the one shown in the app.
const reportSchema = new mongoose.Schema({
    ride: { type: mongoose.Schema.Types.ObjectId, ref: 'ride', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    captain: { type: mongoose.Schema.Types.ObjectId, ref: 'Captain' },
    type: {
        type: String,
        enum: ['extra_fare', 'harassment', 'unsafe_driving', 'wrong_driver', 'other'],
        required: true,
    },
    // For extra_fare: how much the driver asked for / took.
    amount: { type: Number, min: 0, max: 1000 },
    note: { type: String, maxlength: 500 },
    creditIssued: { type: Number, default: 0 },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Report', reportSchema);
