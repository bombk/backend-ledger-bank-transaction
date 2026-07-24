const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")
const accountModel = require("../models/account.model")
const emailService = require("../services/email.service")
const mongoose = require("mongoose")

/**
 * - Create a new transaction
 * THE 10-STEP TRANSFER FLOW:
     * 1. Validate request
     * 2. Validate idempotency key
     * 3. Check account status
     * 4. Derive sender balance from ledger
     * 5. Create transaction (PENDING)
     * 6. Create DEBIT ledger entry
     * 7. Create CREDIT ledger entry
     * 8. Mark transaction COMPLETED
     * 9. Commit MongoDB session
     * 10. Send email notification
 */

async function createTransaction(req, res) {

    /**
     * 1. Validate request
     */
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body

    if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "FromAccount, toAccount, amount and idempotencyKey are required"
        })
    }

    const fromUserAccount = await accountModel.findOne({
        _id: fromAccount,
    })

    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    })

    if (!fromUserAccount || !toUserAccount) {
        return res.status(400).json({
            message: "Invalid fromAccount or toAccount"
        })
    }

    /**
     * 2. Validate idempotency key
     */

    const isTransactionAlreadyExists = await transactionModel.findOne({
        idempotencyKey: idempotencyKey
    })

    if (isTransactionAlreadyExists) {
        if (isTransactionAlreadyExists.status === "COMPLETED") {
            return res.status(200).json({
                message: "Transaction already processed",
                transaction: isTransactionAlreadyExists
            })

        }

        if (isTransactionAlreadyExists.status === "PENDING") {
            return res.status(200).json({
                message: "Transaction is still processing",
            })
        }

        if (isTransactionAlreadyExists.status === "FAILED") {
            return res.status(500).json({
                message: "Transaction processing failed, please retry"
            })
        }

        if (isTransactionAlreadyExists.status === "REVERSED") {
            return res.status(500).json({
                message: "Transaction was reversed, please retry"
            })
        }
    }

    /**
     * 3. Check account status
     */

    if (fromUserAccount.status !== "ACTIVE" || toUserAccount.status !== "ACTIVE") {
        return res.status(400).json({
            message: "Both fromAccount and toAccount must be ACTIVE to process transaction"
        })
    }

    /**
     * 4. Derive sender balance from ledger
     */
    const balance = await fromUserAccount.getBalance()

    if (balance < amount) {
        return res.status(400).json({
            message: `Insufficient balance. Current balance is ${balance}. Requested amount is ${amount}`
        })
    }

    let transaction;
    try {
        transaction = await transactionModel.create({
            fromAccount,
            toAccount,
            amount,
            idempotencyKey,
            status: "PENDING"
        });

        const debitLedgerEntry = await ledgerModel.create({
            account: fromAccount,
            amount: amount,
            transaction: transaction._id,
            type: "DEBIT"
        });

        // Simulating processing delay
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const creditLedgerEntry = await ledgerModel.create({
            account: toAccount,
            amount: amount,
            transaction: transaction._id,
            type: "CREDIT"
        });

        await transactionModel.findOneAndUpdate(
            { _id: transaction._id },
            { status: "COMPLETED" }
        );

    } catch (error) {
        return res.status(400).json({
            message: "Transaction is Pending due to some issue, please retry after sometime",
        })
    }
    /**
     * 10. Send email notification
     */
    await emailService.sendTransactionEmail(req.user.email, req.user.name, amount, toAccount)

    return res.status(201).json({
        message: "Transaction completed successfully",
        transaction: transaction
    })

}

async function createInitialFundsTransaction(req, res) {
    const { toAccount, amount, idempotencyKey } = req.body

    if (!toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "toAccount, amount and idempotencyKey are required"
        })
    }

    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    })

    if (!toUserAccount) {
        return res.status(400).json({
            message: "Invalid toAccount"
        })
    }

    const fromUserAccount = await accountModel.findOne({
        user: req.user._id
    })

    if (!fromUserAccount) {
        return res.status(400).json({
            message: "System user account not found"
        })
    }


    try {
        const transaction = await transactionModel.create({
            fromAccount: fromUserAccount._id,
            toAccount,
            amount,
            idempotencyKey,
            status: "PENDING"
        });

        const debitLedgerEntry = await ledgerModel.create({
            account: fromUserAccount._id,
            amount: amount,
            transaction: transaction._id,
            type: "DEBIT"
        });

        const creditLedgerEntry = await ledgerModel.create({
            account: toAccount,
            amount: amount,
            transaction: transaction._id,
            type: "CREDIT"
        });

        await transactionModel.findOneAndUpdate(
            { _id: transaction._id },
            { status: "COMPLETED" }
        );

        return res.status(201).json({
            message: "Initial funds transaction completed successfully",
            transaction: transaction
        });
    } catch (err) {
        console.error("Error creating initial funds transaction:", err)
        return res.status(500).json({
            message: "Failed to issue funds: " + (err.message || err.toString())
        })
    }
}

/**
 * - Get user's transactions
 * - GET /api/transactions/
 * - Query params: startDate, endDate
 */
async function getUserTransactions(req, res) {
    try {
        const userAccounts = await accountModel.find({ user: req.user._id });
        const accountIds = userAccounts.map(a => a._id);

        // Default to last 7 days
        const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
        const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        // Set endDate to end of day
        endDate.setHours(23, 59, 59, 999);

        const transactions = await transactionModel.find({
            $or: [
                { fromAccount: { $in: accountIds } },
                { toAccount: { $in: accountIds } }
            ],
            createdAt: { $gte: startDate, $lte: endDate }
        }).sort({ createdAt: -1 });

        // Compute balances for each account
        const balances = {};
        for (const acc of userAccounts) {
            balances[acc._id.toString()] = await acc.getBalance();
        }

        return res.status(200).json({
            transactions,
            accounts: userAccounts,
            balances
        });
    } catch (err) {
        console.error("Error fetching user transactions:", err);
        return res.status(500).json({ message: "Failed to fetch transactions" });
    }
}

/**
 * - Get all transactions (System User only)
 * - GET /api/transactions/all
 * - Query params: startDate, endDate
 */
async function getAllTransactions(req, res) {
    try {
        const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
        const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        endDate.setHours(23, 59, 59, 999);

        const transactions = await transactionModel.find({
            createdAt: { $gte: startDate, $lte: endDate }
        }).sort({ createdAt: -1 });

        return res.status(200).json({ transactions });
    } catch (err) {
        console.error("Error fetching all transactions:", err);
        return res.status(500).json({ message: "Failed to fetch transactions" });
    }
}

module.exports = {
    createTransaction,
    createInitialFundsTransaction,
    getUserTransactions,
    getAllTransactions
}

