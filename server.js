require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const { initDatabase, createDefaultAdmin } = require('./services/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Session middleware
const isProduction = process.env.NODE_ENV === 'production';
const useSecureCookies = process.env.SECURE_COOKIES === 'true'; // Only enable with HTTPS

if (isProduction && process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1); // Trust first proxy (for nginx/load balancer)
}

app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: path.join(__dirname, 'data')
  }),
  secret: process.env.SESSION_SECRET || 'selfeval-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: useSecureCookies,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/questions', require('./routes/questions'));
app.use('/api/evaluate', require('./routes/evaluate'));
app.use('/api/performance', require('./routes/performance'));
app.use('/api/history', require('./routes/history'));
app.use('/api/interview', require('./routes/interview'));
app.use('/api/learn', require('./routes/learn'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/disputes', require('./routes/disputes'));

// Page Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/signin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signin.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/course/:courseId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'course.html'));
});

app.get('/manage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'manage.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

app.get('/verify-email', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'verify-email.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
async function start() {
  try {
    await initDatabase();
    await createDefaultAdmin();

    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════╗
║         SelfEval - Learning Q&A App                   ║
╠═══════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}             ║
║  Manage Courses:    http://localhost:${PORT}/manage      ║
╚═══════════════════════════════════════════════════════╝
      `);

      if (!process.env.GROQ_API_KEY) {
        console.warn('\n⚠️  Warning: GROQ_API_KEY not found in environment.');
        console.warn('   Create a .env file with your Groq API key to enable AI features.\n');
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
