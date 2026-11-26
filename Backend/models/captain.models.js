const mongoose=require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const captainSchema = new mongoose.Schema({
    name: {
        firstname: {
            type: String,
            required: true,
            minlength: [3, "Firstname must be at least 3 characters long"]
        },
        lastname: {
            type: String,
            minlength: [3, "Lastname must be at least 3 characters long"]
        }
    },
    email: {
        type: String,
        required: true,
        unique: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, "Please enter a valid email address"]
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    socketId: {          // ✅ moved to top level, consistent casing
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ["available", "unavailable"],
        default: "unavailable"
    },
    vehicle: {
        color: { type: String, required: true },
        model: { type: String, required: true },
        plate: { type: String, required: true, unique: true },
        capacity: {
            type: Number,
            min: [1, "Capacity must be at least 1"],
            required: true
        },
        vehicleType: {
            type: String,
            enum: ["car", "bike", "moto", "auto"],
            required: true
        }
    },
    // Safety
    gender: {
        type: String,
        enum: ['female', 'male', 'other'],
    },
    // Women captains can choose to only get ride requests from women riders.
    womenRidersOnly: { type: Boolean, default: false },
    // Strikes from "driver asked for extra" and similar reports; paused for review when suspended.
    strikes: { type: Number, default: 0 },
    suspended: { type: Boolean, default: false },
    // Selfie for the current shift window (6 AM–2 PM, 2 PM–10 PM, 10 PM–6 AM IST),
    // face-matched against the verified reference. Shown to riders.
    shiftSelfie: {
        image: { type: String, select: false },
        takenAt: Date,
        windowId: String,
        score: Number,
        status: { type: String, enum: ['verified', 'in_review', 'rejected'] },
        attempts: Number,
    },
    // One-time identity check at sign-up: licence + vehicle (via the verification
    // provider) and a liveness selfie face-matched against the licence photo.
    verification: {
        status: {
            type: String,
            enum: ['not_started', 'in_review', 'verified', 'rejected'],
            default: 'not_started',
        },
        reasons: [String],
        submittedAt: Date,
        decidedAt: Date,
        decidedBy: { type: String, enum: ['auto', 'admin'] },
        dl: {
            last4: String,
            numberHash: { type: String, select: false },
            name: String,
            dob: String,
            validUntil: String,
            classes: [String],
            source: String,
        },
        vehicle: {
            plate: String,
            vehicleClass: String,
            commercial: Boolean,
            fitnessUpto: String,
            insuranceUpto: String,
            permitUpto: String,
            source: String,
        },
        face: {
            fingerprintScore: Number,
            landmarkScore: Number,
            landmarkRedFlag: Boolean,
            real: Number,
            livenessPassed: Boolean,
            yaw: [Number],
        },
        // Face fingerprints used for every shift check. Never sent to clients.
        referenceEmbedding: { type: [Number], select: false },
        dlEmbedding: { type: [Number], select: false },
        referenceLandmarks: { type: [Number], select: false },
        // Kept only until a person has reviewed the case, then deleted.
        dlImage: { type: String, select: false },
        selfieImage: { type: String, select: false },
    },
    location: {           // ✅ moved to top level
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],  // [longitude, latitude]
            default: [0, 0]
        }
    }
});

captainSchema.index({ location: '2dsphere' });

captainSchema.methods.generateAuthToken=function(){const token=jwt.sign({_id:this._id},process.env.JWT_SECRET,{expiresIn:'24h'});
return token;}

captainSchema.methods.comparePassword=async function(password){
    return await bcrypt.compare(password,this.password);
}

captainSchema.statics.hashPassword=async function(password){
    return await bcrypt.hash(password,10);
}

const Captain=mongoose.model('Captain',captainSchema);
module.exports=Captain;