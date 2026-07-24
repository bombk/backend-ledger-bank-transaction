const accountModel = require("../models/account.model");
const userModel = require("../models/user.model");


/**
 * Create account - System User only
 * Accepts userId in body to create account for a specific user
 */
async function createAccountController(req, res) {

    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({
            message: "userId is required to create an account"
        })
    }

    // Verify the target user exists
    const targetUser = await userModel.findById(userId);
    if (!targetUser) {
        return res.status(404).json({
            message: "User not found"
        })
    }

    const account = await accountModel.create({
        user: userId
    })

    res.status(201).json({
        account
    })

}

async function getUserAccountsController(req, res) {

    const accounts = await accountModel.find({ user: req.user._id });

    res.status(200).json({
        accounts
    })
}

/**
 * Get accounts for a specific user (System User only)
 */
async function getUserAccountsByUserIdController(req, res) {
    const { userId } = req.params;

    const accounts = await accountModel.find({ user: userId });

    res.status(200).json({
        accounts
    })
}

async function getAccountBalanceController(req, res) {
    const { accountId } = req.params;

    const account = await accountModel.findOne({
        _id: accountId,
        user: req.user._id
    })

    if (!account) {
        return res.status(404).json({
            message: "Account not found"
        })
    }

    const balance = await account.getBalance();

    res.status(200).json({
        accountId: account._id,
        balance: balance
    })
}


module.exports = {
    createAccountController,
    getUserAccountsController,
    getUserAccountsByUserIdController,
    getAccountBalanceController
}