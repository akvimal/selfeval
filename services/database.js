const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'selfeval.db');
const SALT_ROUNDS = 10;

let db = null;

// Initialize database and create tables
function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }

      db.serialize(() => {
        // Users table
        db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT CHECK(role IN ('admin', 'learner')) NOT NULL DEFAULT 'learner',
            enabled BOOLEAN DEFAULT 0,
            email_verified BOOLEAN DEFAULT 0,
            verification_token TEXT,
            verification_expires DATETIME,
            reset_token TEXT,
            reset_expires DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Add columns if they don't exist (for existing databases)
        db.run(`ALTER TABLE users ADD COLUMN enabled BOOLEAN DEFAULT 1`, () => {});
        db.run(`ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 0`, () => {});
        db.run(`ALTER TABLE users ADD COLUMN verification_token TEXT`, () => {});
        db.run(`ALTER TABLE users ADD COLUMN verification_expires DATETIME`, () => {});
        db.run(`ALTER TABLE users ADD COLUMN reset_token TEXT`, () => {});
        db.run(`ALTER TABLE users ADD COLUMN reset_expires DATETIME`, () => {});

        // User performance table
        db.run(`
          CREATE TABLE IF NOT EXISTS user_performance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            course_id TEXT NOT NULL,
            topic_id TEXT NOT NULL,
            question_type TEXT NOT NULL,
            score INTEGER NOT NULL,
            is_correct BOOLEAN NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // User history table
        db.run(`
          CREATE TABLE IF NOT EXISTS user_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            course_id TEXT NOT NULL,
            topic_id TEXT NOT NULL,
            question_type TEXT NOT NULL,
            question_data TEXT NOT NULL,
            user_answer TEXT NOT NULL,
            result TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // User interviews table
        db.run(`
          CREATE TABLE IF NOT EXISTS user_interviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_id TEXT UNIQUE NOT NULL,
            course_id TEXT NOT NULL,
            session_data TEXT NOT NULL,
            summary TEXT,
            start_time DATETIME NOT NULL,
            end_time DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // Settings table
        db.run(`
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // User API keys table
        db.run(`
          CREATE TABLE IF NOT EXISTS user_api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            groq_api_key TEXT,
            anthropic_api_key TEXT,
            preferred_model TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);
        // Add preferred_model column if doesn't exist
        db.run(`ALTER TABLE user_api_keys ADD COLUMN preferred_model TEXT`, () => {});

        // User API usage tracking table
        db.run(`
          CREATE TABLE IF NOT EXISTS user_api_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            tokens_used INTEGER DEFAULT 0,
            request_count INTEGER DEFAULT 1,
            date TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // Create indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_user_performance_user ON user_performance(user_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_user_performance_course ON user_performance(user_id, course_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_user_history_user ON user_history(user_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_user_interviews_user ON user_interviews(user_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_user_api_usage_user_date ON user_api_usage(user_id, date)`, (err) => {
          if (err) {
            reject(err);
          } else {
            console.log('Database initialized successfully');
            resolve();
          }
        });
      });
    });
  });
}

// Create default admin if no users exist
async function createDefaultAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@selfeval.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const adminName = process.env.ADMIN_NAME || 'Admin';

  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM users', async (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      if (row.count === 0) {
        try {
          await createUser(adminEmail, adminPassword, adminName, 'admin');
          console.log(`Default admin created: ${adminEmail}`);
          resolve(true);
        } catch (error) {
          reject(error);
        }
      } else {
        resolve(false);
      }
    });
  });
}

// User CRUD operations
async function createUser(email, password, name, role = 'learner') {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  // Admins are enabled by default, regular users need admin approval
  const enabled = role === 'admin' ? 1 : 0;

  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO users (email, password_hash, name, role, enabled) VALUES (?, ?, ?, ?, ?)',
      [email.toLowerCase(), passwordHash, name, role, enabled],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            reject(new Error('Email already exists'));
          } else {
            reject(err);
          }
        } else {
          resolve({ id: this.lastID, email: email.toLowerCase(), name, role, enabled });
        }
      }
    );
  });
}

function findUserByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function findUserById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id, email, name, role, created_at FROM users WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getAllUsers() {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, email, name, role, enabled, email_verified, created_at FROM users ORDER BY created_at DESC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function updateUser(id, updates) {
  const allowedFields = ['name', 'role', 'email', 'enabled'];
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      fields.push(`${key} = ?`);
      if (key === 'email') {
        values.push(value.toLowerCase());
      } else if (key === 'enabled') {
        values.push(value ? 1 : 0);
      } else {
        values.push(value);
      }
    }
  }

  if (fields.length === 0) {
    return Promise.resolve(null);
  }

  values.push(id);

  return new Promise((resolve, reject) => {
    db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values, function(err) {
      if (err) reject(err);
      else resolve(this.changes > 0);
    });
  });
}

async function updateUserPassword(id, newPassword) {
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id], function(err) {
      if (err) reject(err);
      else resolve(this.changes > 0);
    });
  });
}

function deleteUser(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
      if (err) reject(err);
      else resolve(this.changes > 0);
    });
  });
}

async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.password_hash);
}

// Email verification functions
function setVerificationToken(userId, token, expiresAt) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET verification_token = ?, verification_expires = ? WHERE id = ?',
      [token, expiresAt, userId],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      }
    );
  });
}

function findUserByVerificationToken(token) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM users WHERE verification_token = ? AND verification_expires > datetime("now")',
      [token],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

function verifyUserEmail(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET email_verified = 1, verification_token = NULL, verification_expires = NULL WHERE id = ?',
      [userId],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      }
    );
  });
}

// Password reset functions
function setResetToken(userId, token, expiresAt) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?',
      [token, expiresAt, userId],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      }
    );
  });
}

function findUserByResetToken(token) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM users WHERE reset_token = ? AND reset_expires > datetime("now")',
      [token],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

function clearResetToken(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET reset_token = NULL, reset_expires = NULL WHERE id = ?',
      [userId],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      }
    );
  });
}

// Performance operations
function addPerformance(userId, courseId, topicId, questionType, score, isCorrect) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO user_performance (user_id, course_id, topic_id, question_type, score, is_correct) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, courseId, topicId, questionType, score, isCorrect ? 1 : 0],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
}

function getPerformance(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM user_performance WHERE user_id = ? ORDER BY created_at DESC',
      [userId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

function getPerformanceStats(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT
        COUNT(*) as totalQuestions,
        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correctAnswers,
        AVG(score) as averageScore
      FROM user_performance WHERE user_id = ?`,
      [userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

function getPerformanceByCourse(userId, courseId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM user_performance WHERE user_id = ? AND course_id = ? ORDER BY created_at DESC',
      [userId, courseId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

function resetPerformance(userId, courseId = null) {
  return new Promise((resolve, reject) => {
    let query = 'DELETE FROM user_performance WHERE user_id = ?';
    const params = [userId];

    if (courseId) {
      query += ' AND course_id = ?';
      params.push(courseId);
    }

    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

// History operations
function addHistory(userId, courseId, topicId, questionType, questionData, userAnswer, result) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO user_history (user_id, course_id, topic_id, question_type, question_data, user_answer, result) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, courseId, topicId, questionType, JSON.stringify(questionData), userAnswer, JSON.stringify(result)],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
}

function getHistory(userId, courseId = null, limit = 50) {
  return new Promise((resolve, reject) => {
    let query = 'SELECT * FROM user_history WHERE user_id = ?';
    const params = [userId];

    if (courseId) {
      query += ' AND course_id = ?';
      params.push(courseId);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        // Parse JSON fields
        const parsed = rows.map(row => ({
          ...row,
          question_data: JSON.parse(row.question_data),
          result: JSON.parse(row.result)
        }));
        resolve(parsed);
      }
    });
  });
}

function deleteHistory(userId, courseId = null) {
  return new Promise((resolve, reject) => {
    let query = 'DELETE FROM user_history WHERE user_id = ?';
    const params = [userId];

    if (courseId) {
      query += ' AND course_id = ?';
      params.push(courseId);
    }

    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

// Interview operations
function saveInterview(userId, sessionId, courseId, sessionData, startTime) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO user_interviews (user_id, session_id, course_id, session_data, start_time) VALUES (?, ?, ?, ?, ?)',
      [userId, sessionId, courseId, JSON.stringify(sessionData), startTime],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
}

function updateInterview(sessionId, summary, endTime) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE user_interviews SET summary = ?, end_time = ? WHERE session_id = ?',
      [JSON.stringify(summary), endTime, sessionId],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      }
    );
  });
}

function getInterviews(userId, courseId = null, limit = 20) {
  return new Promise((resolve, reject) => {
    let query = 'SELECT * FROM user_interviews WHERE user_id = ?';
    const params = [userId];

    if (courseId) {
      query += ' AND course_id = ?';
      params.push(courseId);
    }

    query += ' ORDER BY start_time DESC LIMIT ?';
    params.push(limit);

    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        const parsed = rows.map(row => ({
          ...row,
          session_data: JSON.parse(row.session_data),
          summary: row.summary ? JSON.parse(row.summary) : null
        }));
        resolve(parsed);
      }
    });
  });
}

// Settings operations
function getSetting(key) {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.value : null);
    });
  });
}

function setSetting(key, value) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, value],
      function(err) {
        if (err) reject(err);
        else resolve(true);
      }
    );
  });
}

function getAllSettings() {
  return new Promise((resolve, reject) => {
    db.all('SELECT key, value FROM settings', (err, rows) => {
      if (err) reject(err);
      else {
        const settings = {};
        rows.forEach(row => { settings[row.key] = row.value; });
        resolve(settings);
      }
    });
  });
}

// Get course activity stats (for deletion warning)
function getCourseActivityStats(courseId) {
  return new Promise((resolve, reject) => {
    const stats = {
      performanceCount: 0,
      historyCount: 0,
      interviewCount: 0,
      uniqueUsers: 0
    };

    db.get(
      'SELECT COUNT(*) as count FROM user_performance WHERE course_id = ?',
      [courseId],
      (err, row) => {
        if (err) return reject(err);
        stats.performanceCount = row?.count || 0;

        db.get(
          'SELECT COUNT(*) as count FROM user_history WHERE course_id = ?',
          [courseId],
          (err, row) => {
            if (err) return reject(err);
            stats.historyCount = row?.count || 0;

            db.get(
              'SELECT COUNT(*) as count FROM user_interviews WHERE course_id = ?',
              [courseId],
              (err, row) => {
                if (err) return reject(err);
                stats.interviewCount = row?.count || 0;

                // Get unique users who have activity on this course
                db.get(
                  `SELECT COUNT(DISTINCT user_id) as count FROM (
                    SELECT user_id FROM user_performance WHERE course_id = ?
                    UNION
                    SELECT user_id FROM user_history WHERE course_id = ?
                    UNION
                    SELECT user_id FROM user_interviews WHERE course_id = ?
                  )`,
                  [courseId, courseId, courseId],
                  (err, row) => {
                    if (err) return reject(err);
                    stats.uniqueUsers = row?.count || 0;
                    stats.hasActivity = stats.performanceCount > 0 || stats.historyCount > 0 || stats.interviewCount > 0;
                    resolve(stats);
                  }
                );
              }
            );
          }
        );
      }
    );
  });
}

// User API keys operations
// Simple obfuscation for API keys (not true encryption - for production use proper encryption)
function obfuscateKey(key) {
  if (!key) return null;
  return Buffer.from(key).toString('base64');
}

function deobfuscateKey(encoded) {
  if (!encoded) return null;
  return Buffer.from(encoded, 'base64').toString('utf8');
}

function getUserApiKeys(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM user_api_keys WHERE user_id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else if (!row) resolve(null);
      else {
        resolve({
          groq_api_key: deobfuscateKey(row.groq_api_key),
          anthropic_api_key: deobfuscateKey(row.anthropic_api_key),
          preferred_model: row.preferred_model,
          updated_at: row.updated_at,
          // Return masked versions for display
          groq_configured: !!row.groq_api_key,
          anthropic_configured: !!row.anthropic_api_key
        });
      }
    });
  });
}

function setUserApiKeys(userId, groqKey, anthropicKey, preferredModel) {
  return new Promise((resolve, reject) => {
    const obfuscatedGroq = obfuscateKey(groqKey);
    const obfuscatedAnthropic = obfuscateKey(anthropicKey);

    db.run(
      `INSERT INTO user_api_keys (user_id, groq_api_key, anthropic_api_key, preferred_model, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         groq_api_key = COALESCE(?, groq_api_key),
         anthropic_api_key = COALESCE(?, anthropic_api_key),
         preferred_model = COALESCE(?, preferred_model),
         updated_at = CURRENT_TIMESTAMP`,
      [userId, obfuscatedGroq, obfuscatedAnthropic, preferredModel,
       obfuscatedGroq, obfuscatedAnthropic, preferredModel],
      function(err) {
        if (err) reject(err);
        else resolve(true);
      }
    );
  });
}

function deleteUserApiKey(userId, provider) {
  return new Promise((resolve, reject) => {
    const column = provider === 'groq' ? 'groq_api_key' : 'anthropic_api_key';
    db.run(
      `UPDATE user_api_keys SET ${column} = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
      [userId],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      }
    );
  });
}

// API usage tracking
function trackApiUsage(userId, provider, model, tokensUsed = 0) {
  const today = new Date().toISOString().split('T')[0];
  return new Promise((resolve, reject) => {
    // Try to update existing record for today
    db.run(
      `INSERT INTO user_api_usage (user_id, provider, model, tokens_used, request_count, date)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET
         tokens_used = tokens_used + ?,
         request_count = request_count + 1`,
      [userId, provider, model, tokensUsed, today, tokensUsed],
      function(err) {
        if (err) {
          // If ON CONFLICT doesn't work (no unique constraint), just insert
          db.run(
            'INSERT INTO user_api_usage (user_id, provider, model, tokens_used, date) VALUES (?, ?, ?, ?, ?)',
            [userId, provider, model, tokensUsed, today],
            function(err2) {
              if (err2) reject(err2);
              else resolve(true);
            }
          );
        } else {
          resolve(true);
        }
      }
    );
  });
}

function getApiUsage(userId, days = 30) {
  return new Promise((resolve, reject) => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    db.all(
      `SELECT date, provider, model, SUM(tokens_used) as tokens, SUM(request_count) as requests
       FROM user_api_usage
       WHERE user_id = ? AND date >= ?
       GROUP BY date, provider, model
       ORDER BY date DESC`,
      [userId, startDateStr],
      (err, rows) => {
        if (err) reject(err);
        else {
          // Aggregate totals
          const totals = { requests: 0, tokens: 0, byProvider: {} };
          rows.forEach(row => {
            totals.requests += row.requests;
            totals.tokens += row.tokens;
            if (!totals.byProvider[row.provider]) {
              totals.byProvider[row.provider] = { requests: 0, tokens: 0 };
            }
            totals.byProvider[row.provider].requests += row.requests;
            totals.byProvider[row.provider].tokens += row.tokens;
          });
          resolve({ daily: rows, totals });
        }
      }
    );
  });
}

// Get database instance
function getDb() {
  return db;
}

// Close database connection
function closeDatabase() {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  initDatabase,
  createDefaultAdmin,
  getDb,
  closeDatabase,
  // User operations
  createUser,
  findUserByEmail,
  findUserById,
  getAllUsers,
  updateUser,
  updateUserPassword,
  deleteUser,
  verifyPassword,
  // Performance operations
  addPerformance,
  getPerformance,
  getPerformanceStats,
  getPerformanceByCourse,
  resetPerformance,
  // History operations
  addHistory,
  getHistory,
  deleteHistory,
  // Interview operations
  saveInterview,
  updateInterview,
  getInterviews,
  // Settings operations
  getSetting,
  setSetting,
  getAllSettings,
  // Email verification
  setVerificationToken,
  findUserByVerificationToken,
  verifyUserEmail,
  // Password reset
  setResetToken,
  findUserByResetToken,
  clearResetToken,
  // Course activity
  getCourseActivityStats,
  // User API keys
  getUserApiKeys,
  setUserApiKeys,
  deleteUserApiKey,
  // API usage tracking
  trackApiUsage,
  getApiUsage
};
