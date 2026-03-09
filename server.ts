import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const db = new Database("database.sqlite");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    email TEXT
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/users/:phone", (req, res) => {
    const phone = req.params.phone.replace(/\D/g, '');
    const user = db.prepare("SELECT * FROM users WHERE phone = ?").get(phone);
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: "User not found" });
    }
  });

  app.post("/api/bookings", (req, res) => {
    const { 
      phoneNumber, 
      firstName, 
      lastName, 
      email,
      pickupLocation,
      dropoffLocation,
      distance,
      duration
    } = req.body;

    console.log("Received phoneNumber:", phoneNumber, "type:", typeof phoneNumber);

    // Save or update user
    const phone = phoneNumber ? phoneNumber.replace(/\D/g, '') : '';
    console.log("Storing phone as:", phone);
    const existingUser = db.prepare("SELECT * FROM users WHERE phone = ?").get(phone);
    if (existingUser) {
      db.prepare("UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE phone = ?")
        .run(firstName, lastName, email, phone);
    } else {
      db.prepare("INSERT INTO users (phone, first_name, last_name, email) VALUES (?, ?, ?, ?)")
        .run(phone, firstName, lastName, email);
    }

    // Mock booking submission
    console.log("New Booking Received:", req.body);
    
    res.json({ 
      status: "success", 
      message: "Booking submitted successfully",
      bookingId: Math.floor(Math.random() * 1000000)
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
