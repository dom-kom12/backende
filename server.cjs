// === Gmail GX Backend (PL strefa czasowa, logi w pełnym formacie + CORS) ===

// Importy (CommonJS)
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

// Dla Vercela – typy (TS hint, nie przeszkadza w działaniu)
const { VercelRequest, VercelResponse } = require('@vercel/node');

const app = express();
const PORT = process.env.PORT || 3000;

// === Ścieżki i pliki ===
const frontendDir = path.join(__dirname, '../frontend');
const usersFile = path.join(__dirname, 'users.json');
const mailsFile = path.join(__dirname, 'mails.json');
const logsDir = path.join(__dirname, 'USERS-LOGS');

// Tworzenie folderów i plików jeśli nie istnieją
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, JSON.stringify([], null, 2));
if (!fs.existsSync(mailsFile)) fs.writeFileSync(mailsFile, JSON.stringify([], null, 2));

// === Middleware ===
app.use(bodyParser.json({ limit: '2mb' }));
app.use(express.static(frontendDir));

// CORS – pozwól na żądania z frontendu
app.use(cors({
  origin: 'https://shymc.rf.gd', // Twój frontend
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// === Pomocnicze funkcje ===
function readJSON(file, def = []) {
  try {
    if (!fs.existsSync(file)) return def;
    const data = fs.readFileSync(file, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Błąd odczytu JSON:', err);
    return def;
  }
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Błąd zapisu JSON:', err);
  }
}

// Logowanie akcji użytkownika (data w strefie PL, z IP)
function logUserAction(user, action, req = null) {
  try {
    const logFile = path.join(logsDir, `${user}-log.txt`);
    const now = new Date();
    const date = now.toLocaleString('pl-PL', {
      timeZone: 'Europe/Warsaw',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : 'localhost';
    const line = `[${date}] (IP: ${ip}) ${action}\n`;
    fs.appendFileSync(logFile, line);
  } catch (err) {
    console.error('Błąd logowania akcji:', err);
  }
}

// Funkcje do danych
function readUsers() { return readJSON(usersFile, []); }
function readMails() { return readJSON(mailsFile, []); }
function saveUsers(u) { writeJSON(usersFile, u); }
function saveMails(m) { writeJSON(mailsFile, m); }

// === ROUTES ===

// Strona główna (login)
app.get('/', (req, res) => res.sendFile(path.join(frontendDir, 'login.html')));

// Rejestracja
app.post('/api/register', (req, res) => {
  const { username, domain, password } = req.body;
  if (!username || !domain || !password)
    return res.status(400).json({ message: '⚠️ Podaj wszystkie dane' });

  const email = (username + domain).toLowerCase();
  const users = readUsers();
  if (users.find(u => u.email === email))
    return res.status(400).json({ message: '❌ Użytkownik już istnieje' });

  users.push({ email, password, lastLogin: null });
  saveUsers(users);
  logUserAction(email, '🆕 Rejestracja nowego użytkownika', req);
  res.json({ message: `✅ Zarejestrowano jako ${email}` });
});

// Logowanie
app.post('/api/login', (req, res) => {
  const { username, domain, password } = req.body;
  const email = (username + domain).toLowerCase();
  const users = readUsers();
  const user = users.find(u => u.email === email && u.password === password);

  if (!user) return res.status(401).json({ message: '❌ Nieprawidłowe dane logowania' });

  user.lastLogin = new Date().toISOString();
  saveUsers(users);
  logUserAction(email, '✅ Zalogowano', req);
  res.json({ message: `Zalogowano jako ${email}` });
});

// Wysyłanie wiadomości
app.post('/api/send', (req, res) => {
  const { from, to, subject, body } = req.body;
  if (!from || !to || !subject || !body)
    return res.status(400).json({ message: '⚠️ Brak danych wiadomości' });

  const mails = readMails();
  const newMail = {
    id: Date.now(),
    from, to, subject, body,
    date: new Date().toISOString(),
    folder: 'inbox'
  };
  mails.push(newMail);
  saveMails(mails);
  logUserAction(from, `📤 Wysłano wiadomość do ${to}`, req);
  res.json({ message: '📨 Wiadomość wysłana!' });
});

// Pobieranie wiadomości użytkownika
app.get('/api/messages/:email', (req, res) => {
  const email = req.params.email.toLowerCase();
  const mails = readMails();
  const filtered = mails.filter(m => m.to === email || m.from === email);
  res.json(filtered);
});

// Przenoszenie wiadomości do folderu
app.post('/api/move', (req, res) => {
  const { id, folder } = req.body;
  const mails = readMails();
  const mail = mails.find(m => m.id === id);
  if (!mail) return res.status(404).json({ message: '❌ Mail nie istnieje' });

  mail.folder = folder;
  saveMails(mails);
  logUserAction(mail.from, `🗑️ Przeniósł wiadomość (${id}) do ${folder}`, req);
  res.json({ message: `📁 Przeniesiono do folderu: ${folder}` });
});

// Usuwanie wiadomości
app.delete('/api/delete/:id', (req, res) => {
  const id = parseInt(req.params.id);
  let mails = readMails();
  const mail = mails.find(m => m.id === id);
  if (!mail) return res.status(404).json({ message: '❌ Mail nie istnieje' });

  mails = mails.filter(m => m.id !== id);
  saveMails(mails);
  logUserAction(mail.from, `❌ Usunięto wiadomość (${id})`, req);
  res.json({ message: '🗑️ Mail usunięty' });
});

// Czyszczenie kosza po 30 dniach
function cleanTrash() {
  const mails = readMails();
  const now = Date.now();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const before = mails.length;

  const filtered = mails.filter(m => {
    if (m.folder !== 'trash') return true;
    const mailDate = new Date(m.date).getTime();
    return now - mailDate <= THIRTY_DAYS;
  });

  if (filtered.length !== before) {
    saveMails(filtered);
    console.log(`🗑️ Kosz wyczyszczony. Usunięto ${before - filtered.length} maili starszych niż 30 dni`);
  }
}

// Wywołanie czyszczenia przy starcie i co 24h
cleanTrash();
setInterval(cleanTrash, 24 * 60 * 60 * 1000);

// 404
app.use((req, res) => res.status(404).sendFile(path.join(frontendDir, '404.html')));

// Start lokalny
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Gmail GX działa na: http://localhost:${PORT}`);
  });
}

// === Handler dla Vercel ===
export default function handler(req, res) {
  app(req, res);
}
