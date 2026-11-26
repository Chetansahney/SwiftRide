const userModel=require('../models/user.models');
const userService=require('../services/user.services');
const {validationResult}=require('express-validator');
const blacklistTokenModel=require('../models/blacklistTokens.model');
const rideModel=require('../models/ride.model');
module.exports.register=async (req,res)=>{
    const errors=validationResult(req);//taking errors from the routes
    if(!errors.isEmpty()){
        return res.status(400).json({errors:errors.array()});//if there are errors then we are sending the error message to the client side
    }

    const {name,email,password}=req.body;//taking the data from the client side
    const hashedPassword=await userModel.hashPassword(password);//hashing the password before saving it to the database

    const user=await userService.createUser({firstname:name.firstname,lastname:name.lastname,email,password:hashedPassword});//creating a new user in the database using the createUser function from userService
    const token=user.generateAuthToken();//generating a token for the user using the generateAuthToken function from userModel
    res.status(201).json({user,token});//sending the user object and token to the client side
}

//login route

module.exports.login=async(req,res,next)=>{
    const errors=validationResult(req);//taking errors from the routes
    if(!errors.isEmpty()){
        return res.status(400).json({errors:errors.array()});//if there are errors then we are sending the error message to the client side
    }

    const {email,password}=req.body;//taking the data from the client side
    const isAlreadyExist=await userModel.findOne({email});//checking if the user with the given email already exists in the database
    if(!isAlreadyExist){
        return res.status(400).json({message:"User with this email does not exist"});//if the user does not exist then we are sending the error message to the client side
    }
    const user=await userModel.findOne({email}).select('+password');//finding the user in the database using the email and selecting the password field to compare it with the hashed password
    if(!user){
        return res.status(401).json({error:"Invalid email or password"});//if the user is not found then we are sending the error message to the client side
    }
    const isMatch=await user.comparePassword(password);//comparing the password from the client side with the hashed password in the database using the comparePassword function from userModel
    if(!isMatch){
        return res.status(401).json({error:"Invalid email or password"});//if the password does not match then we are sending the error message to the client side
    }

    const token=user.generateAuthToken();//generating a token for the user using the generateAuthToken function from userModel
    res.status(200).json({user,token});//sending the user object and token to the client side
}
module.exports.getUserProfile=(req,res,next)=>{
    res.status(200).json(req.user);//sending the user object to the client side
    
}

module.exports.logout=async (req,res,next)=>{
    res.clearCookie('token');
    const token=req.cookies.token || req.headers.authorization.split(' ')[1];
    await blacklistTokenModel.create({token});//blacklisting the token by saving it to the blacklistTokens collection in the database
    res.status(200).json({message:"Logged out successfully"});
}

module.exports.updateUserProfile=async (req,res)=>{
    const errors=validationResult(req);
    if(!errors.isEmpty()){
        return res.status(400).json({errors:errors.array()});
    }
    const { name, email } = req.body;
    const updates = {};
    if (name?.firstname) updates['name.firstname'] = name.firstname.trim();
    if (name && 'lastname' in name) updates['name.lastname'] = (name.lastname || '').trim();
    if (email) {
        const normalised = email.trim().toLowerCase();
        const taken = await userModel.findOne({ email: normalised, _id: { $ne: req.user._id } });
        if (taken) {
            return res.status(400).json({ message: "This email is already used by another account" });
        }
        updates.email = normalised;
    }
    try {
        const user = await userModel.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true, runValidators: true });
        res.status(200).json(user);
    } catch (error) {
        console.error("Error updating profile:", error.message || error);
        res.status(400).json({ message: "Could not update your profile" });
    }
}


// Permanently deletes the signed-in rider's account and ride history, then
// blacklists the current token so it can't be used again.
module.exports.deleteAccount=async (req,res)=>{
    const authHeader = req.headers.authorization || '';
    const token = req.cookies.token || (authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);
    try {
        await rideModel.deleteMany({ user: req.user._id });
        await userModel.findByIdAndDelete(req.user._id);
        if (token) {
            await blacklistTokenModel.create({ token }).catch(() => {});
        }
        res.clearCookie('token');
        res.status(200).json({ message: "Account deleted" });
    } catch (error) {
        console.error("Error deleting account:", error.message || error);
        res.status(500).json({ message: "Could not delete the account" });
    }
}


// Trusted contacts (up to 3) and safety preferences from the Account page / home toggle.
module.exports.updateSafety=async (req,res)=>{
    const errors=validationResult(req);
    if(!errors.isEmpty()){
        return res.status(400).json({errors:errors.array()});
    }
    const updates = {};
    if (Array.isArray(req.body.trustedContacts)) {
        updates.trustedContacts = req.body.trustedContacts.map(({ name, phone }) => ({ name, phone }));
    }
    const prefs = req.body.safetyPrefs || {};
    if (typeof prefs.travellingAsWoman === 'boolean') updates['safetyPrefs.travellingAsWoman'] = prefs.travellingAsWoman;
    if (typeof prefs.shareAtNight === 'boolean') updates['safetyPrefs.shareAtNight'] = prefs.shareAtNight;
    try {
        const user = await userModel.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true, runValidators: true });
        res.status(200).json(user);
    } catch (error) {
        console.error("Error updating safety settings:", error.message || error);
        res.status(400).json({ message: "Could not save your safety settings" });
    }
}
