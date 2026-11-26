const mongoose=require('mongoose');

const pointSchema = new mongoose.Schema({ lat: Number, lng: Number }, { _id: false });

const rideSchema=new mongoose.Schema({
    user :
    {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
    ,
    origin : {
        type: String,
        required: true
    },
    destination : {
        type: String,
        required: true
    },
    // Geocoded pickup/drop, used for dispatch, the "ended away from drop" check
    // and the rider's route-safety monitor.
    pickupPoint: pointSchema,
    dropPoint: pointSchema,
    vehicleType: {
        type: String,
        enum: ['moto', 'auto', 'car']
    },
    captain:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Captain'
    },
    // Total the rider pays. Locked when the ride is booked; only the automatic
    // waiting fee (after 3 free minutes) and an optional tip can add to it.
    fare: {
        type: Number,
        required: true
    },
    fareBreakdown: {
        ride: { type: Number, default: 0 },
        // Paid 100% to the driver when the drop is somewhere they usually
        // have to drive back from empty.
        returnFee: { type: Number, default: 0 },
        nightFee: { type: Number, default: 0 },
        waitingFee: { type: Number, default: 0 },
        tip: { type: Number, default: 0 },
        // Wallet credit used for this ride (SwiftRide pays it; the captain still gets the full fare).
        creditUsed: { type: Number, default: 0 },
    },
    // Ride Guarantee: ₹50 credited once if a captain drops this ride after accepting.
    guaranteeCredited: { type: Boolean, default: false },
    status: {
        type: String,
        enum: ['requested', 'accepted','ongoing', 'completed', 'cancelled'],
        default: 'requested'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'not_charged'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    arrivedAt: Date,
    startedAt: Date,
    endedAt: Date,
    distance:{
        type: Number
    }
    ,duration:{
        type: Number
    }
    ,paymentID:{
        type: String
    }
    ,orderID:{
        type: String
    },
    signature:{
        type: String
    }
    ,
    // 1–5 stars: the captain's rating of the rider, and the rider's rating of the captain.
    userRating:{
        type: Number,
        min: 1,
        max: 5
    },
    captainRating:{
        type: Number,
        min: 1,
        max: 5
    },
    // Safety
    preferWomenCaptain: { type: Boolean, default: false },
    riderIsWoman: { type: Boolean, default: false },
    // Public, unguessable token for the live "track my ride" link shared with trusted contacts.
    shareToken: { type: String, index: true, sparse: true },
    safety: {
        driverConfirmed: Boolean,
        endedAwayFromDrop: { type: Boolean, default: false },
        reachedSafely: Boolean,
    },
    otp:{
        type: String,
        select : false,
        required: true
    },
    // Wrong PIN tries; the ride can't be started after 5.
    otpAttempts: { type: Number, default: 0, select: false },
    // When the ride was last offered to captains (re-set if a captain drops it).
    requestedAt: { type: Date, default: Date.now },
    cancelledAt: Date,
    cancelledBy: { type: String, enum: ['rider', 'captain', 'system'] },
    cancelReason: { type: String, maxlength: 200 },
    // Captains who dropped or let this request expire; it isn't offered to them again.
    declinedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Captain' }],
    ratingComment: { type: String, maxlength: 300 },
}, { timestamps: { createdAt: false, updatedAt: true } });

// History pages and "do you already have a ride?" checks.
rideSchema.index({ user: 1, createdAt: -1 });
rideSchema.index({ captain: 1, createdAt: -1 });
rideSchema.index({ user: 1, status: 1 });
rideSchema.index({ captain: 1, status: 1 });

module.exports=mongoose.model('ride',rideSchema);
