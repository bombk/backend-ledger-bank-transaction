const express = require("express")
const authMiddleware = require("../middleware/auth.middleware")
const accountController = require("../controllers/account.controller")


const router = express.Router()



/**
 * - POST /api/accounts/
 * - Create a new account for a user (System User only)
 * - Protected Route
 */
router.post("/", authMiddleware.authSystemUserMiddleware, accountController.createAccountController)


/**
 * - GET /api/accounts/
 * - Get all accounts of the logged-in user
 * - Protected Route
 */
router.get("/", authMiddleware.authMiddleware, accountController.getUserAccountsController)


/**
 * - GET /api/accounts/balance/:accountId
 */
router.get("/balance/:accountId", authMiddleware.authMiddleware, accountController.getAccountBalanceController)

/**
 * - GET /api/accounts/user/:userId
 * - Get accounts for a specific user (System User only)
 */
router.get("/user/:userId", authMiddleware.authSystemUserMiddleware, accountController.getUserAccountsByUserIdController)



module.exports = router