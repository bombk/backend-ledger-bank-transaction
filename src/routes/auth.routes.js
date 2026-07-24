const express = require("express")
const authController = require("../controllers/auth.controller")
const authMiddleware = require("../middleware/auth.middleware")

const router = express.Router()


/* POST /api/auth/register */
router.post("/register", authController.userRegisterController)


/* POST /api/auth/login */
router.post("/login",authController.userLoginController)

/**
 * - POST /api/auth/logout
 */
router.post("/logout", authController.userLogoutController)

/**
 * - POST /api/auth/create-admin
 * - Create admin user (System User only)
 */
router.post("/create-admin", authMiddleware.authSystemUserMiddleware, authController.createAdminController)



module.exports = router