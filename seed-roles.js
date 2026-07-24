const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables
dotenv.config();

const userModel = require("./src/models/user.model");

async function seedRoles() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        console.log("Migrating existing users...");

        // Find users that have the old `systemUser` field
        // We will fetch all users and update them
        const users = await userModel.find({}).select("+systemUser +role");

        let migratedCount = 0;
        for (const user of users) {
            let roleToSet = "CUSTOMER";
            
            // Check if they were previously a system user
            // We're accessing it via _doc since it might not be in the new schema depending on mongoose version handling
            if (user._doc.systemUser === true) {
                 roleToSet = "SYSTEM_USER";
            }

            await userModel.updateOne({ _id: user._id }, { 
                $set: { role: roleToSet },
                $unset: { systemUser: 1 } // Remove the old field
            });
            migratedCount++;
        }
        
        console.log(`Migrated ${migratedCount} existing users.`);

        // Create an admin user if one doesn't exist
        const adminEmail = "admin@ledgerbank.com";
        const existingAdmin = await userModel.findOne({ email: adminEmail });

        if (!existingAdmin) {
            console.log("Creating default admin user...");
            await userModel.create({
                name: "System Admin",
                email: adminEmail,
                mobile: "9800000001", // Dummy mobile
                password: "adminpassword",
                role: "ADMIN"
            });
            console.log(`Created admin user: ${adminEmail} (password: adminpassword)`);
        } else {
             console.log("Admin user already exists.");
        }
        
        // Create a system user if one doesn't exist
        const systemEmail = "system@ledgerbank.com";
        const existingSystem = await userModel.findOne({ email: systemEmail });
        
        if (!existingSystem) {
             console.log("Creating default system user...");
             await userModel.create({
                name: "System User",
                email: systemEmail,
                mobile: "9800000002", // Dummy mobile
                password: "systempassword",
                role: "SYSTEM_USER"
            });
            console.log(`Created system user: ${systemEmail} (password: systempassword)`);
        } else {
             console.log("System user already exists.");
        }

        console.log("Migration complete.");
        process.exit(0);

    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

seedRoles();
