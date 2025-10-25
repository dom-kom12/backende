// server.cjs 2
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 3000;

// ====== 🔒 KONFIGURACJA CORS ======
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

// ====== 🌍 PRZEKIEROWANIE STRONY GŁÓWNEJ ======
app.get("/", (req, res) => {
  res.redirect("https://shymc.rf.gd");
});

// ====== ⚙️ POŁĄCZENIE Z MONGODB ======
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://komputer200012_db_user:domino2012R@cluster0.8y3zzec.mongodb.net/";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Połączono z MongoDB Atlas"))
  .catch(err => console.error("❌ Błąd połączenia z MongoDB:", err));

// ====== 📦 SCHEMATY DANYCH ======
const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  lastLogin: Date
});

const messageSchema = new mongoose.Schema({
  to: String,
  from: String,
  subject: String,
  content: String,
  date: { type: Date, default: Date.now }
});

const logSchema = new mongoose.Schema({
  user: String,
  action: String,
  date: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Message = mongoose.model("Message", messageSchema);
const Log = mongoose.model("Log", logSchema);

// ====== 🧾 FUNKCJE POMOCNICZE ======
function logUserAction(user, action) {
  new Log({ user, action }).save();
  console.log(`📘 [${new Date().toISOString()}] ${user}: ${action}`);
}

// ====== 🧍‍♂️ REJESTRACJA ======
app.post("/api/register", async (req, res) => {
  const { username, domain, password } = req.body;
  if (!username || !domain || !password)
    return res.status(400).json({ message: "⚠️ Podaj wszystkie dane" });

  const email = (username + domain).toLowerCase();
  const exists = await User.findOne({ email });
  if (exists)
    return res.status(400).json({ message: "❌ Użytkownik już istnieje" });

  await User.create({ email, password, lastLogin: null });
  logUserAction(email, "🆕 Rejestracja nowego użytkownika");
  res.json({ message: `✅ Zarejestrowano jako ${email}` });
});

// ====== 🔑 LOGOWANIE ======
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, password });
  if (!user)
    return res.status(401).json({ message: "❌ Nieprawidłowe dane logowania" });

  user.lastLogin = new Date();
  await user.save();
  logUserAction(email, "✅ Logowanie");
  res.json({ message: `Witaj ponownie, ${email}` });
});

// ====== ✉️ WIADOMOŚCI ======
app.post("/api/messages", async (req, res) => {
  const { to, from, subject, content } = req.body;
  if (!to || !from || !content)
    return res.status(400).json({ message: "⚠️ Brak wymaganych danych" });

  await Message.create({ to, from, subject, content });
  logUserAction(from, `📨 Wysłał wiadomość do ${to}`);
  res.json({ message: "✅ Wiadomość wysłana" });
});

app.get("/api/messages/:email", async (req, res) => {
  const { email } = req.params;
  const messages = await Message.find({ to: email });
  res.json(messages);
});

// ====== 🧾 LOGI ======
app.get("/api/logs", async (req, res) => {
  const logs = await Log.find().sort({ date: -1 });
  res.json(logs);
});

// ====== 🚀 START SERWERA ======
app.listen(PORT, () => {
  console.log(`🌐 Serwer działa na porcie ${PORT}`);
});
