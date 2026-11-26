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
    },
    status: {
        type: String,
        enum: ['requested', 'accepted','ongoing', 'completed', 'cancelled'],
        default: 'requested'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid'],
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
    }
});

module.exports=mongoose.model('ride',rideSchema);
