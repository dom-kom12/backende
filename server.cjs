// === Gmail GX Backend (PL strefa czasowa, logi + CORS tylko dla shymc.rf.gd) ===
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const fetch = require('node-fetch'); // Node < 18

const app = express();
const PORT = process.env.PORT || 3000;

// === Ścieżki i pliki ===
const usersFile = path.join(__dirname, 'users.json');
const mailsFile = path.join(__dirname, 'mails.json');
const logsDir = path.join(__dirname, 'USERS-LOGS');

// Tworzenie folderów/plików jeśli nie istnieją
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, JSON.stringify([], null, 2));
if (!fs.existsSync(mailsFile)) fs.writeFileSync(mailsFile, JSON.stringify([], null, 2));

// === Middleware ===
app.use(bodyParser.json({ limit: '20mb' }));

// CORS – musi być przed endpointami
app.use((req, res, next) => {
  const allowedOrigin = 'https://shymc.rf.gd';
  if (req.headers.origin === allowedOrigin) {
    res.header('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// === Pomocnicze funkcje ===
function readJSON(file, def = []) {
  try { 
    if (!fs.existsSync(file)) return def; 
    return JSON.parse(fs.readFileSync(file, 'utf8') || '[]'); 
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

function logUserAction(user, action, req = null) {
  try {
    const logFile = path.join(logsDir, `${user}-log.txt`);
    const now = new Date();
    const date = now.toLocaleString('pl-PL', {
      timeZone: 'Europe/Warsaw',
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit'
    });
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : 'localhost';
    fs.appendFileSync(logFile, `[${date}] (IP: ${ip}) ${action}\n`);
  } catch (err) { 
    console.error('Błąd logowania akcji:', err); 
  }
}

// === ROUTES ===
app.get('/', (req, res) => res.redirect('https://shymc.rf.gd'));

// Proxy logów z Render
app.get('/api/logs', async (req, res) => {
  try {
    const response = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/events?type=LOG&max=50`, {
      headers: { Authorization: `Bearer ${RENDER_API_TOKEN}` }
    });
    if (!response.ok) return res.status(response.status).json({ error:'Błąd pobierania logów z Render' });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error:'Błąd sieci: ' + err.message });
  }
});

// Rejestracja
app.post('/api/register', (req,res)=>{ 
  const {username,domain,password}=req.body;
  if(!username||!domain||!password) return res.status(400).json({message:'⚠️ Podaj wszystkie dane'});
  const email=(username+domain).toLowerCase();
  const users=readJSON(usersFile);
  if(users.find(u=>u.email===email)) return res.status(400).json({message:'❌ Użytkownik już istnieje'});
  users.push({email,password,lastLogin:null});
  writeJSON(usersFile,users);
  logUserAction(email,'🆕 Rejestracja nowego użytkownika',req);
  res.json({message:`✅ Zarejestrowano jako ${email}`});
  console.log(`Nowa rejestracja ${email}`);
});

// Logowanie
app.post('/api/login', (req,res)=>{ 
  const {username,domain,password}=req.body;
  const email=(username+domain).toLowerCase();
  const users=readJSON(usersFile);
  const user=users.find(u=>u.email===email&&u.password===password);
  if(!user) return res.status(401).json({message:'❌ Nieprawidłowe dane logowania'});
  user.lastLogin=new Date().toISOString();
  writeJSON(usersFile,users);
  logUserAction(email,'✅ Zalogowano',req);
  res.json({message:`Zalogowano jako ${email}`});
  console.log(`Nowy login ${email}`);
});

// Wysyłanie wiadomości
app.post('/api/send', (req,res)=>{ 
  const {from,to,subject,body}=req.body;
  if(!from||!to||!subject||!body) return res.status(400).json({message:'⚠️ Brak danych wiadomości'});
  const mails=readJSON(mailsFile);
  mails.push({id:Date.now(),from,to,subject,body,date:new Date().toISOString(),folder:'inbox'});
  writeJSON(mailsFile,mails);
  logUserAction(from,`📤 Wysłano wiadomość do ${to}`,req);
  res.json({message:'📨 Wiadomość wysłana!'});
  console.log(`Wysłano wiadomość do ${to} od ${from}`);
});

// Pobieranie wiadomości
app.get('/api/messages/:email',(req,res)=>{ 
  const email=req.params.email.toLowerCase();
  const mails=readJSON(mailsFile);
  res.json(mails.filter(m=>m.to===email||m.from===email));
});

// Usuwanie wiadomości
app.delete('/api/delete/:id',(req,res)=>{ 
  const id=parseInt(req.params.id);
  let mails=readJSON(mailsFile);
  const mail=mails.find(m=>m.id===id);
  if(!mail) return res.status(404).json({message:'❌ Mail nie istnieje'});
  mails=mails.filter(m=>m.id!==id);
  writeJSON(mailsFile,mails);
  logUserAction(mail.from,`❌ Usunięto wiadomość (${id})`,req);
  res.json({message:'🗑️ Mail usunięty'});
});

// === Obsługa nieznanych endpointów (404) ===
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

// Start serwera
app.listen(PORT,()=>console.log(`🚀 Backend Gmail GX działa na porcie ${PORT}`));
