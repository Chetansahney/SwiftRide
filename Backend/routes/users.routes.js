const express=require('express');
const router=express.Router();
//express-validator is used to validate the data coming from the client side from frontend
const {body}=require('express-validator');
const userController=require('../controllers/user.controllers');
const authMiddleware=require('../middleware/auth.middleware');


//validating the data coming from the client side using express-validator and then calling the register function from userController to register the user in the database. We are validating the name.firstname, email and password fields and if any of the validation fails then we are sending the error message to the client side. If all the validation passes then we are calling the register function from userController to register the user in the database.
router.post('/register',[body('name.firstname').isLength({min:3}).withMessage("firstname should be at least 3 characters long"),
body('email').isEmail().withMessage("Please enter a valid email address"),
body('password').isLength({min:6}).withMessage("Password should be at least 6 characters long")],userController.register);

//login route is used to login the user and it takes the email and password from the client side and validates them using express-validator. If the validation fails then it sends the error message to the client side. If the validation passes then it calls the login function from userController to login the user in the database.
router.post('/login',[body('email').isEmail().withMessage("Not a valid email address"),
    body('password').isLength({min:6}).withMessage("Password should be at least 6 characters long")],userController.login);


router.get('/profile',authMiddleware.authUser,userController.getUserProfile);
router.get('/logout',authMiddleware.authUser,userController.logout);

// Riders can update their own name and email from the Account page.
router.patch('/profile',
    authMiddleware.authUser,
    body('name.firstname').optional().isLength({min:3}).withMessage("firstname should be at least 3 characters long"),
    body('name.lastname').optional({ values: 'falsy' }).isLength({min:3}).withMessage("lastname should be at least 3 characters long"),
    body('email').optional().isEmail().withMessage("Please enter a valid email address"),
    userController.updateUserProfile
);

router.delete('/profile', authMiddleware.authUser, userController.deleteAccount);

// "+91 98765 43210" / "098765 43210" → "9876543210"
const normalizePhone = (value) => String(value || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');

router.patch('/safety',
    authMiddleware.authUser,
    body('trustedContacts').optional().isArray({ max: 3 }).withMessage("You can add up to 3 trusted contacts"),
    body('trustedContacts.*.name').trim().notEmpty().withMessage("Contact name is required").isLength({ max: 40 }),
    body('trustedContacts.*.phone').customSanitizer(normalizePhone).matches(/^[6-9]\d{9}$/).withMessage("Enter a 10-digit Indian mobile number"),
    body('safetyPrefs.travellingAsWoman').optional().isBoolean(),
    body('safetyPrefs.shareAtNight').optional().isBoolean(),
    userController.updateSafety
);

module.exports=router;