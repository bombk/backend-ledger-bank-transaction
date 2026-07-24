const userModel = require("../models/user.model")
const accountModel = require("../models/account.model")
const jwt = require("jsonwebtoken")
const emailService = require("../services/email.service")
const tokenBlackListModel = require("../models/blackList.model")

/**
* - user register controller
* - POST /api/auth/register
* - Accepts: name, email, mobile, password
* - Auto-creates one account on successful registration
*/
async function userRegisterController(req, res) {
    const { email, password, name, mobile } = req.body

    if (!mobile) {
        return res.status(400).json({
            message: "Mobile number is required.",
            status: "failed"
        })
    }

    // Check if email already exists
    const emailExists = await userModel.findOne({ email })
    if (emailExists) {
        return res.status(422).json({
            message: "User already exists with this email.",
            status: "failed"
        })
    }

    // Check if mobile already exists
    const mobileExists = await userModel.findOne({ mobile })
    if (mobileExists) {
        return res.status(422).json({
            message: "User already exists with this mobile number.",
            status: "failed"
        })
    }

    const user = await userModel.create({
        email, password, name, mobile
    })

    // Auto-create one account for the new user
    const account = await accountModel.create({
        user: user._id
    })

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "3d" })

    res.cookie("token", token)

    res.status(201).json({
        user: {
            _id: user._id,
            email: user.email,
            name: user.name,
            mobile: user.mobile,
            role: "CUSTOMER"
        },
        account,
        token
    })

    await emailService.sendRegistrationEmail(user.email, user.name)
}

/**
 * - User Login Controller
 * - POST /api/auth/login
 * - Accepts: login (email or mobile), password
  */

async function userLoginController(req, res) {
    const { login, password, email } = req.body

    // Support both old format {email, password} and new format {login, password}
    const loginValue = login || email

    if (!loginValue) {
        return res.status(400).json({
            message: "Email or mobile number is required"
        })
    }

    // Determine if login is email or mobile
    const isEmail = loginValue.includes("@")
    const query = isEmail ? { email: loginValue.toLowerCase() } : { mobile: loginValue }

    const user = await userModel.findOne(query).select("+password +role")

    if (!user) {
        return res.status(401).json({
            message: "Email/Mobile or password is INVALID"
        })
    }

    const isValidPassword = await user.comparePassword(password)

    if (!isValidPassword) {
        return res.status(401).json({
            message: "Email/Mobile or password is INVALID"
        })
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "3d" })

    res.cookie("token", token)

    res.status(200).json({
        user: {
            _id: user._id,
            email: user.email,
            name: user.name,
            mobile: user.mobile,
            role: user.role
        },
        token
    })

}


/**
 * - User Logout Controller
 * - POST /api/auth/logout
  */
async function userLogoutController(req, res) {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[ 1 ]

    if (!token) {
        return res.status(200).json({
            message: "User logged out successfully"
        })
    }



    await tokenBlackListModel.create({
        token: token
    })

    res.clearCookie("token")

    res.status(200).json({
        message: "User logged out successfully"
    })

}


module.exports = {
    userRegisterController,
    userLoginController,
    userLogoutController
}