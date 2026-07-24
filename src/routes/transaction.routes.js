const { Router } = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const transactionController = require("../controllers/transaction.controller")

const transactionRoutes = Router();

/**
 * - POST /api/transactions/
 * - Create a new transaction
 */

transactionRoutes.post("/", authMiddleware.authMiddleware, transactionController.createTransaction)


/**
 * - POST /api/transactions/system/initial-funds
 * - Create initial funds transaction from system user
 */
transactionRoutes.post("/system/initial-funds", authMiddleware.authSystemUserMiddleware, transactionController.createInitialFundsTransaction)

/**
 * - GET /api/transactions/
 * - Get user's transactions with date filters
 */
transactionRoutes.get("/", authMiddleware.authMiddleware, transactionController.getUserTransactions)

/**
 * - GET /api/transactions/all
 * - Get all transactions (Admin and System User)
 */
transactionRoutes.get("/all", authMiddleware.authAdminMiddleware, transactionController.getAllTransactions)

/**
 * - POST /api/transactions/:id/refund
 * - Refund a completed transaction (Admin and System User)
 */
transactionRoutes.post("/:id/refund", authMiddleware.authAdminMiddleware, transactionController.refundTransaction)

/**
 * - POST /api/transactions/:id/repush
 * - Repush a failed or pending transaction (Admin and System User)
 */
transactionRoutes.post("/:id/repush", authMiddleware.authAdminMiddleware, transactionController.repushTransaction)

module.exports = transactionRoutes;