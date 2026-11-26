const mongoose=require('mongoose');
const bcrypt=require('bcrypt');
const jwt=require('jsonwebtoken');


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
        match:[/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,"Please enter a valid email address"]
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

userSchema.methods.generateAuthToken=function(){const token=jwt.sign({_id:this._id},process.env.JWT_SECRET,{expiresIn:'24h'});
return token;}

userSchema.methods.comparePassword=async function(password){
    return await bcrypt.compare(password,this.password);
}

userSchema.statics.hashPassword=async function(password){
    return await bcrypt.hash(password,10);
}   


const User=mongoose.model('User',userSchema);

module.exports=User;


