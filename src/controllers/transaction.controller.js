const transactionModel = require("../models/transaction.model")
const ledgerModel = require("../models/ledger.model")
const accountModel = require("../models/account.model")
const emailService = require("../services/email.service")
const mongoose = require("mongoose")
const userModel = require("../models/user.model")

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
    let { fromAccount, toAccount, amount, idempotencyKey } = req.body

    if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "FromAccount, toAccount, amount and idempotencyKey are required"
        })
    }

    const fromUserAccount = await accountModel.findOne({
        _id: fromAccount,
    })

    let toUserAccount = null;
    
    // Check if toAccount is a valid ObjectId (Account ID)
    if (mongoose.Types.ObjectId.isValid(toAccount)) {
        toUserAccount = await accountModel.findOne({ _id: toAccount });
    }
    
    // If not found by ID, try looking up by user's mobile number
    if (!toUserAccount) {
        const userByMobile = await userModel.findOne({ mobile: toAccount });
        if (userByMobile) {
            toUserAccount = await accountModel.findOne({ user: userByMobile._id, status: "ACTIVE" });
        }
    }

    if (!fromUserAccount || !toUserAccount) {
        return res.status(400).json({
            message: "Invalid fromAccount or recipient mobile/account number not found"
        })
    }
    
    // Ensure we use the resolved ObjectId for the rest of the transaction flow
    toAccount = toUserAccount._id;

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

        // Removed artificial processing delay to optimize and make the transaction smooth

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
    let { toAccount, amount, idempotencyKey } = req.body

    if (!toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "toAccount, amount and idempotencyKey are required"
        })
    }

    // Resolve toAccount: can be Account ID or mobile number
    let toUserAccount = null;
    
    if (mongoose.Types.ObjectId.isValid(toAccount)) {
        toUserAccount = await accountModel.findOne({ _id: toAccount });
    }
    
    if (!toUserAccount) {
        const userByMobile = await userModel.findOne({ mobile: toAccount });
        if (userByMobile) {
            toUserAccount = await accountModel.findOne({ user: userByMobile._id, status: "ACTIVE" });
        }
    }

    if (!toUserAccount) {
        return res.status(400).json({
            message: "Invalid recipient account or mobile number not found"
        })
    }

    // Use resolved account ID
    toAccount = toUserAccount._id;

    let fromUserAccount = await accountModel.findOne({
        user: req.user._id,
        status: "ACTIVE"
    })

    if (!fromUserAccount) {
        // Auto-create an account for the system user if they don't have an active one
        fromUserAccount = await accountModel.create({
            user: req.user._id
        });
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
 * - Get all transactions (Admin / System User)
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
        })
        .populate({
            path: 'fromAccount',
            select: 'user currency',
            populate: { path: 'user', select: 'name email mobile' }
        })
        .populate({
            path: 'toAccount',
            select: 'user currency',
            populate: { path: 'user', select: 'name email mobile' }
        })
        .sort({ createdAt: -1 });

        return res.status(200).json({ transactions });
    } catch (err) {
        console.error("Error fetching all transactions:", err);
        return res.status(500).json({ message: "Failed to fetch transactions" });
    }
}

/**
 * Refund a completed transaction
 */
async function refundTransaction(req, res) {
    try {
        const { id } = req.params;
        const transaction = await transactionModel.findById(id);

        if (!transaction) return res.status(404).json({ message: "Transaction not found" });
        if (transaction.status !== "COMPLETED") return res.status(400).json({ message: "Only completed transactions can be refunded" });

        // Change old transaction status
        transaction.status = "REVERSED";
        await transaction.save();

        // Add inverse ledger entries
        await ledgerModel.create({
            account: transaction.toAccount,
            amount: transaction.amount,
            transaction: transaction._id,
            type: "DEBIT"
        });

        await ledgerModel.create({
            account: transaction.fromAccount,
            amount: transaction.amount,
            transaction: transaction._id,
            type: "CREDIT"
        });

        return res.status(200).json({ message: "Transaction successfully refunded" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Failed to refund transaction" });
    }
}

/**
 * Repush a failed or pending transaction
 */
async function repushTransaction(req, res) {
    try {
        const { id } = req.params;
        const transaction = await transactionModel.findById(id);

        if (!transaction) return res.status(404).json({ message: "Transaction not found" });
        if (transaction.status === "COMPLETED") return res.status(400).json({ message: "Transaction already completed" });

        // Clean up any existing broken ledger entries
        await mongoose.connection.db.collection('ledgers').deleteMany({ transaction: transaction._id });

        // Check balance again
        const fromAccount = await accountModel.findById(transaction.fromAccount);
        const fromUser = await userModel.findById(fromAccount.user).select('+role');
        const balance = await fromAccount.getBalance();
        
        // System initial funds come from the system user or admin, who are allowed to go negative
        if (fromUser.role !== 'SYSTEM_USER' && fromUser.role !== 'ADMIN' && balance < transaction.amount) {
            transaction.status = "FAILED";
            await transaction.save();
            return res.status(400).json({ message: "Insufficient balance for repush" });
        }

        // Recreate Ledgers
        await ledgerModel.create({
            account: transaction.fromAccount,
            amount: transaction.amount,
            transaction: transaction._id,
            type: "DEBIT"
        });

        await ledgerModel.create({
            account: transaction.toAccount,
            amount: transaction.amount,
            transaction: transaction._id,
            type: "CREDIT"
        });

        transaction.status = "COMPLETED";
        await transaction.save();

        return res.status(200).json({ message: "Transaction successfully repushed" });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Failed to repush transaction" });
    }
}


module.exports = {
    createTransaction,
    createInitialFundsTransaction,
    getUserTransactions,
    getAllTransactions,
    refundTransaction,
    repushTransaction
}
