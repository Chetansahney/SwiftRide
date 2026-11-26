const rideservice=require('../services/ride.services');
const { validationResult } = require('express-validator');
const mapservice=require('../services/maps.services');
const userModel=require('../models/user.models');
const { sendMessagetoSocketID } = require('../socket');
const rideModel=require('../models/ride.model');
const { publicRide, publicCaptain } = require('../utils/publicViews');

// Load a ride with both parties populated, including the captain's shift selfie
// (riders compare it with the person who turns up).
function findRide(id) {
    return rideModel
        .findById(id)
        .populate('user')
        .populate({ path: 'captain', select: '+shiftSelfie.image' });
}

async function notifyUser(userId, event, data) {
    const user = await userModel.findById(userId).select('socketId');
    if (user?.socketId) {
        sendMessagetoSocketID(user.socketId, { event, data });
    }
}

function badRequest(res, errors) {
    return res.status(400).json({ errors: errors.array() });
}

const normalizeType = (type) => (type === 'bike' ? 'moto' : type);

module.exports.createRide=async (req,res)=>{
    const errors=validationResult(req);
    if(!errors.isEmpty()) return badRequest(res, errors);

    const { origin, destination, vehicleType, preferWomenCaptain } = req.body;
    const riderIsWoman = Boolean(req.body.travellingAsWoman || req.user.safetyPrefs?.travellingAsWoman || preferWomenCaptain);
    try {
        const { ride, otp } = await rideservice.createRide({
            origin,
            destination,
            user: req.user._id,
            vehicleType,
            preferWomenCaptain: Boolean(preferWomenCaptain),
            riderIsWoman,
        });

        if (!ride.pickupPoint?.lat) {
            return res.status(400).json({ error: "We couldn't find that pickup location." });
        }

        const nearbyCaptains = await mapservice.getCaptainsNearby(ride.pickupPoint.lat, ride.pickupPoint.lng, 10);
        const eligible = nearbyCaptains.filter((captain) => {
            if (!captain.socketId) return false;
            if (normalizeType(captain.vehicle?.vehicleType) !== ride.vehicleType) return false;
            if (ride.preferWomenCaptain && captain.gender !== 'female') return false;
            if (captain.womenRidersOnly && !ride.riderIsWoman) return false;
            return true;
        });

        const payload = publicRide(await findRide(ride._id));
        eligible.forEach((captain) => {
            sendMessagetoSocketID(captain.socketId, { event: 'new-ride', data: payload });
        });

        res.status(201).json({
            message: "Ride created successfully",
            ride: publicRide(ride),
            otp,
            notifiedCaptains: eligible.length,
        });
    } catch (error) {
        console.error("Error in createRide controller:", error.message || error);
        res.status(500).json({ error: "An error occurred while creating the ride." });
    }
}

module.exports.calculateFare=async (req,res)=>{
    const errors=validationResult(req);
    if(!errors.isEmpty()) return badRequest(res, errors);
    const {origin,destination}=req.query;
    try{
        const fare=await rideservice.calculateFare(origin,destination);
        res.json(fare);
    }
    catch(error){
        console.error("Error in calculateFare controller:", error.message || error);
        res.status(500).json({error:"An error occurred while calculating the fare."});
    }
}

module.exports.getNearbyDrivers=async (req,res)=>{
    const errors=validationResult(req);
    if(!errors.isEmpty()) return badRequest(res, errors);
    const { origin } = req.query;
    try {
        const point = await mapservice.getLocationCoordinates(origin);
        const [nearest, nearestWomen] = await Promise.all([
            mapservice.getNearestCaptainsByType(point.latitude, point.longitude),
            mapservice.getNearestCaptainsByType(point.latitude, point.longitude, 5000, { womenOnly: true }),
        ]);
        res.json({
            moto: nearest.moto ?? null,
            auto: nearest.auto ?? null,
            car: nearest.car ?? null,
            women: {
                moto: nearestWomen.moto ?? null,
                auto: nearestWomen.auto ?? null,
                car: nearestWomen.car ?? null,
            },
        });
    } catch (error) {
        console.error("Error in getNearbyDrivers controller:", error.message || error);
        res.status(500).json({ error: "An error occurred while finding nearby drivers." });
    }
}

module.exports.confirmRide=async (req,res)=>{
    const errors=validationResult(req);
    if(!errors.isEmpty()) return badRequest(res, errors);
    const {rideId}=req.body;

    if (req.captain.suspended) {
        return res.status(403).json({ error: "Your account is paused for a safety review." });
    }

    try{
        const confirmed = await rideservice.confirmRide(rideId, req.captain._id);
        const ride = publicRide(await findRide(confirmed._id));
        await notifyUser(confirmed.user._id, 'ride-confirmed', ride);
        res.json({message:"Ride confirmed successfully", ride});
    }
    catch(error){
        console.error("Error in confirmRide controller:", error.message || error);
        const taken = error.message === "This ride was already taken.";
        res.status(taken ? 409 : 500).json({error: taken ? error.message : "An error occurred while confirming the ride."});
    }
}

// The signed-in rider's past rides, newest first, for the Account page.
module.exports.getRideHistory=async (req,res)=>{
    try {
        const rides = await rideModel
            .find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50)
            .populate('captain', 'name vehicle');
        res.json(rides.map((ride) => {
            const plain = ride.toObject();
            delete plain.shareToken;
            return { ...plain, captain: publicCaptain(plain.captain) };
        }));
    } catch (error) {
        console.error('Error in getRideHistory controller:', error.message || error);
        res.status(500).json({ error: 'An error occurred while fetching your rides.' });
    }
}

// Riders can only read their own rides.
module.exports.getRideById=async (req,res)=>{
    const { rideId } = req.params;
    try {
        const ride = await findRide(rideId);
        if (!ride || ride.user?._id?.toString() !== req.user._id.toString()) {
            return res.status(404).json({ error: 'Ride not found.' });
        }
        res.json(publicRide(ride));
    } catch (error) {
        console.error('Error in getRideById controller:', error.message || error);
        res.status(500).json({ error: 'An error occurred while fetching the ride.' });
    }
}

// Captain reached the pickup: the rider is told and 3 free minutes of waiting start.
module.exports.markArrived=async (req,res)=>{
    const errors=validationResult(req);
    if(!errors.isEmpty()) return badRequest(res, errors);
    try {
        const arrived = await rideservice.markArrived(req.body.rideId, req.captain._id);
        const ride = publicRide(await findRide(arrived._id));
        await notifyUser(arrived.user._id, 'captain-arrived', ride);
        res.json({ message: "Arrival recorded", ride });
    } catch (error) {
        console.error("Error in markArrived controller:", error.message || error);
        res.status(400).json({ error: error.message || "Couldn't record arrival." });
    }
}

module.exports.startRide=async (req,res)=>{
    const errors=validationResult(req);
    if(!errors.isEmpty()) return badRequest(res, errors);
    const { rideId, otp } = req.body;

    try{
        const started = await rideservice.startRide(rideId, req.captain._id, otp);
        const ride = publicRide(await findRide(started._id));
        await notifyUser(started.user._id, 'ride-started', ride);
        res.json({message:"Ride started successfully", ride});
    }
    catch(error){
        console.error("Error in startRide controller:", error.message || error);
        const status = error.message === 'Invalid OTP.' ? 400 : 500;
        res.status(status).json({error:error.message || "An error occurred while starting the ride."});
    }
}

module.exports.endRide=async (req,res)=>{
    const errors=validationResult(req);
    if(!errors.isEmpty()) return badRequest(res, errors);
    const { rideId } = req.body;

    try{
        const ended = await rideservice.endRide(rideId, req.captain._id);
        const ride = publicRide(await findRide(ended._id));
        await notifyUser(ended.user._id, 'ride-ended', ride);
        res.json({message:"Ride ended successfully", ride});
    }
    catch(error){
        console.error("Error in endRide controller:", error.message || error);
        res.status(500).json({error:error.message || "An error occurred while ending the ride."});
    }
}

module.exports.completePayment=async (req,res)=>{
    const errors=validationResult(req);
    if(!errors.isEmpty()) return badRequest(res, errors);
    const { rideId, tip } = req.body;

    try{
        const paid = await rideservice.completePayment(rideId, req.user._id, tip);
        const ride = publicRide(paid);
        if (paid.captain?.socketId) {
            sendMessagetoSocketID(paid.captain.socketId, { event: 'payment-completed', data: ride });
        }
        res.json({message:"Payment completed successfully", ride});
    }
    catch(error){
        console.error("Error in completePayment controller:", error.message || error);
        res.status(500).json({error:error.message || "An error occurred while completing payment."});
    }
}
