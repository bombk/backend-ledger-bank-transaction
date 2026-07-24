require("dotenv").config();
const mongoose = require("mongoose");
const userModel = require("./src/models/user.model");
const accountModel = require("./src/models/account.model");

async function seedAdmin() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to Database");
        
        const adminEmail = "admin@ledgerbank.com";
        let admin = await userModel.findOne({ email: adminEmail });
        
        if (!admin) {
            admin = new userModel({
                name: "System Admin",
                email: adminEmail,
                password: "adminpassword123",
                systemUser: true
            });
            await admin.save();
            console.log("Created Admin User.");
        }
        
        const adminAccount = await accountModel.findOne({ user: admin._id });
        if (!adminAccount) {
            await accountModel.create({
                user: admin._id,
                status: "ACTIVE"
            });
            console.log("Created Account for Admin User.");
        } else {
            console.log("Admin account already exists.");
        }
        
        console.log("Done.");
    } catch (err) {
        console.error("Error creating admin:", err);
    } finally {
        process.exit(0);
    }
}

seedAdmin();
