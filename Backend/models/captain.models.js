const mongoose=require('mongoose');
const bcrypt = require('bcrypt');
const { signToken } = require('../utils/tokens');
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
        lowercase: true,
        trim: true,
        maxlength: 254,
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Please enter a valid email address"]
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
        // "busy" while on a ride, so they aren't offered another one.
        enum: ["available", "unavailable", "busy"],
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
    // Women-only features ("women riders only", being matched as a woman captain)
    // need a CONFIRMED woman captain: the face check estimates gender, and anything
    // unclear goes to a person. Declaring "female" alone unlocks nothing.
    genderCheck: {
        status: { type: String, enum: ['not_needed', 'verified', 'in_review', 'rejected'], default: 'not_needed' },
        estimate: { type: String, enum: ['female', 'male', 'uncertain'] },
        pFemale: Number,
        reason: String,
        decidedBy: { type: String, enum: ['auto', 'admin'] },
        decidedAt: Date,
        // Live photo kept only until a person has decided.
        image: { type: String, select: false },
    },
    // Confirmed women captains can choose to only get ride requests from women riders.
    womenRidersOnly: { type: Boolean, default: false },
    // Strikes from "driver asked for extra" and similar reports; paused for review when suspended.
    strikes: { type: Number, default: 0 },
    suspended: { type: Boolean, default: false },
    // Accepted rides the captain dropped before pickup.
    cancellations: { type: Number, default: 0 },
    // Last live location update; captains silent for 2 minutes aren't offered rides.
    lastSeenAt: Date,
    // Rider ratings (1–5) of this captain.
    ratingTotal: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    // Selfie for the current shift window (6 AM–2 PM, 2 PM–10 PM, 10 PM–6 AM IST),
    // face-matched against the verified reference. Shown to riders.
    shiftSelfie: {
        image: { type: String, select: false },
        takenAt: Date,
        windowId: String,
        score: Number,
        status: { type: String, enum: ['verified', 'in_review', 'rejected'] },
        attempts: Number,
        reason: String,
        // Fingerprint of a shift photo waiting for review; added to the gallery if approved.
        pendingDescriptor: { type: [Number], select: false },
        pendingEmbedding: { type: [Number], select: false },
    },
    // The current liveness challenge (random actions, single use, expires).
    liveness: {
        type: {
            idHash: String,
            steps: [String],
            purpose: { type: String, enum: ['verification', 'shift'] },
            expiresAt: Date,
            used: Boolean,
        },
        select: false,
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
            distance: Number,
            faceresScore: Number,
            landmarkScore: Number,
            landmarkRedFlag: Boolean,
            real: Number,
            livenessPassed: Boolean,
            steps: [String],
            turns: [Number],
            model: String,
        },
        // Face fingerprints used for every shift check. Never sent to clients.
        referenceEmbedding: { type: [Number], select: false },
        dlEmbedding: { type: [Number], select: false },
        // ResNet fingerprints (primary signal) of the verified selfie and the licence photo.
        referenceDescriptor: { type: [Number], select: false },
        dlDescriptor: { type: [Number], select: false },
        // Up to 5 recent verified shift selfies, so matching adapts to beards,
        // glasses and ageing (always also checked against the original).
        gallery: {
            type: [{ _id: false, descriptor: [Number], embedding: [Number], at: Date }],
            select: false,
        },
        failedStep: String,
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

// Bumped on password change / "log out everywhere" to revoke older tokens.
captainSchema.add({ tokenVersion: { type: Number, default: 0 } });

captainSchema.methods.generateAuthToken=function(){
    return signToken('captain', this);
}

// Never send secrets or internal fields to clients.
captainSchema.set('toJSON', {
    transform(doc, ret) {
        delete ret.password;
        delete ret.socketId;
        delete ret.tokenVersion;
        delete ret.__v;
        return ret;
    },
});

captainSchema.methods.comparePassword=async function(password){
    return await bcrypt.compare(password,this.password);
}

captainSchema.statics.hashPassword=async function(password){
    return await bcrypt.hash(password,12);
}

const Captain=mongoose.model('Captain',captainSchema);
module.exports=Captain;