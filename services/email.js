const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Create transporter based on environment configuration
function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('SMTP not configured. Emails will be logged to console instead.');
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: parseInt(port),
    secure: port === '465',
    auth: { user, pass }
  });
}

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = createTransporter();
  }
  return transporter;
}

// Generate a secure random token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Get the base URL for the application
function getBaseUrl() {
  return process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
}

// Send verification email
async function sendVerificationEmail(email, name, token) {
  const baseUrl = getBaseUrl();
  const verificationUrl = `${baseUrl}/verify-email?token=${token}`;

  const subject = 'Verify your email - SelfEval';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0d6efd;">Welcome to SelfEval!</h2>
      <p>Hi ${name},</p>
      <p>Thank you for signing up. Please verify your email address by clicking the button below:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}"
           style="background-color: #0d6efd; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Verify Email
        </a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
      <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #999; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
    </div>
  `;

  const text = `
Welcome to SelfEval!

Hi ${name},

Thank you for signing up. Please verify your email address by visiting:
${verificationUrl}

This link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.
  `;

  return sendEmail(email, subject, text, html);
}

// Send password reset email
async function sendPasswordResetEmail(email, name, token) {
  const baseUrl = getBaseUrl();
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  const subject = 'Reset your password - SelfEval';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0d6efd;">Password Reset Request</h2>
      <p>Hi ${name},</p>
      <p>We received a request to reset your password. Click the button below to create a new password:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}"
           style="background-color: #0d6efd; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Reset Password
        </a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #666;">${resetUrl}</p>
      <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #999; font-size: 12px;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
    </div>
  `;

  const text = `
Password Reset Request

Hi ${name},

We received a request to reset your password. Visit this link to create a new password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email.
  `;

  return sendEmail(email, subject, text, html);
}

// Generic send email function
async function sendEmail(to, subject, text, html) {
  const transport = getTransporter();
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@selfeval.local';

  const mailOptions = {
    from: `SelfEval <${fromEmail}>`,
    to,
    subject,
    text,
    html
  };

  if (transport) {
    try {
      const result = await transport.sendMail(mailOptions);
      console.log('Email sent:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  } else {
    // Log email to console for development
    console.log('\n========== EMAIL (SMTP not configured) ==========');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('Text:', text);
    console.log('=================================================\n');
    return { success: true, logged: true };
  }
}

module.exports = {
  generateToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendEmail
};
