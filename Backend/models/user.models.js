const mongoose=require('mongoose');
const bcrypt=require('bcrypt');
const { signToken } = require('../utils/tokens');


const userSchema=new mongoose.Schema({
    name:{
        firstname:{
            type:String,
            required:true,
            minlength:[3,"Firstname must be at least 3 characters long"]
        },
        lastname:{
               type:String,
            minlength:[3,"Lastname must be at least 3 characters long"]
        }
    },

    email:{
        type:String,
        required:true,
        unique:true,
        lowercase: true,
        trim: true,
        maxlength: 254,
        match:[/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,"Please enter a valid email address"]
    },

    password:{
        type:String,
        required:true,
        select:false
    },

    socketId:{
        type:String,
        default: null
    },

    // Ride credit, e.g. refunded when a driver asked for extra money.
    walletCredit:{
        type:Number,
        default:0
    },

    // Home / Work / named places, synced across the rider's devices.
    savedPlaces:{
        home:{ type:String, maxlength:200 },
        work:{ type:String, maxlength:200 },
        custom:{
            type:[{
                _id:false,
                id:{ type:String, required:true, maxlength:20 },
                label:{ type:String, required:true, maxlength:30 },
                address:{ type:String, required:true, maxlength:200 },
            }],
            validate:[(list) => list.length <= 10, 'Up to 10 saved places'],
        },
    },

    // Captains' ratings (1–5) of this rider.
    ratingTotal:{ type:Number, default:0 },
    ratingCount:{ type:Number, default:0 },

    // Up to 3 people who get the live trip link.
    trustedContacts:[{
        _id:false,
        name:{ type:String, required:true, maxlength:40 },
        phone:{ type:String, required:true, match:[/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"] }
    }],

    safetyPrefs:{
        travellingAsWoman:{ type:Boolean, default:false },
        // Offer to share the live trip with trusted contacts on rides after 9 pm.
        shareAtNight:{ type:Boolean, default:true }
    },
})

// Bumped on password change / "log out everywhere" to revoke older tokens.
userSchema.add({ tokenVersion: { type: Number, default: 0 } });

userSchema.methods.generateAuthToken=function(){
    return signToken('user', this);
}

// Never send secrets or internal fields to clients.
userSchema.set('toJSON', {
    transform(doc, ret) {
        delete ret.password;
        delete ret.socketId;
        delete ret.tokenVersion;
        delete ret.__v;
        return ret;
    },
});

userSchema.methods.comparePassword=async function(password){
    return await bcrypt.compare(password,this.password);
}

userSchema.statics.hashPassword=async function(password){
    return await bcrypt.hash(password,12);
}   


const User=mongoose.model('User',userSchema);

module.exports=User;


