const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");

dotenv.config();

const userModel = require("./src/models/user.model");

async function fixAdmin() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        const adminHash = await bcrypt.hash("adminpassword", 10);
        await userModel.findOneAndUpdate(
            { email: "admin@ledgerbank.com" },
            { $set: { password: adminHash, role: "ADMIN", mobile: "9800000001" } },
            { upsert: true }
        );
        console.log("Admin user reset (admin@ledgerbank.com / adminpassword / role: ADMIN)");

        const systemHash = await bcrypt.hash("systempassword", 10);
        await userModel.findOneAndUpdate(
            { email: "system@ledgerbank.com" },
            { $set: { password: systemHash, role: "SYSTEM_USER", mobile: "9800000002" } },
            { upsert: true }
        );
        console.log("System user reset (system@ledgerbank.com / systempassword / role: SYSTEM_USER)");

        process.exit(0);
    } catch (err) {
        console.error("Error fixing admins:", err);
        process.exit(1);
    }
}

fixAdmin();
