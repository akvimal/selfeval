const express = require('express');
const router = express.Router();
const {
  createUser,
  findUserByEmail,
  findUserById,
  verifyPassword,
  updateUser,
  updateUserPassword,
  setVerificationToken,
  findUserByVerificationToken,
  verifyUserEmail,
  setResetToken,
  findUserByResetToken,
  clearResetToken,
  getSetting
} = require('../services/database');
const { requireAuth } = require('../middleware/auth');
const { generateToken, sendVerificationEmail, sendPasswordResetEmail } = require('../services/email');

// Check if email verification is required
async function isEmailVerificationRequired() {
  const setting = await getSetting('require_email_verification');
  return setting === 'true' || setting === '1';
}

// POST /api/auth/signup - Register new user
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Create user (default role: learner)
    const user = await createUser(email, password, name, 'learner');

    // Check if email verification is required
    const verificationRequired = await isEmailVerificationRequired();

    if (verificationRequired) {
      // Generate verification token and send email
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
      await setVerificationToken(user.id, token, expiresAt);

      try {
        await sendVerificationEmail(email, name, token);
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        // Continue anyway - user can request resend
      }

      res.status(201).json({
        message: 'Account created. Please check your email to verify your account. An administrator will also need to enable your account.',
        requiresVerification: true,
        requiresApproval: true,
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
      });
    } else {
      // No email verification required, but account still needs admin approval
      res.status(201).json({
        message: 'Account created successfully. Please wait for an administrator to enable your account.',
        requiresVerification: false,
        requiresApproval: true,
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
      });
    }
  } catch (error) {
    if (error.message === 'Email already exists') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// POST /api/auth/signin - Login user
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = await verifyPassword(user, password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if user account is enabled (admins are always enabled)
    if (user.enabled === 0 && user.role !== 'admin') {
      return res.status(403).json({
        error: 'Your account has been disabled. Please contact an administrator.',
        disabled: true
      });
    }

    // Check if email verification is required and user is not verified
    const verificationRequired = await isEmailVerificationRequired();
    if (verificationRequired && !user.email_verified && user.role !== 'admin') {
      return res.status(403).json({
        error: 'Please verify your email before signing in',
        requiresVerification: true,
        email: user.email
      });
    }

    // Regenerate session for security
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regenerate error:', err);
        return res.status(500).json({ error: 'Login failed' });
      }

      req.session.userId = user.id;

      res.json({
        message: 'Logged in successfully',
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
      });
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/signout - Logout user
router.post('/signout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Signout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

// GET /api/auth/me - Get current user
router.get('/me', requireAuth, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      created_at: req.user.created_at
    }
  });
});

// PUT /api/auth/me - Update current user profile
router.put('/me', requireAuth, async (req, res) => {
  try {
    const { name, email } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      updates.email = email;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    await updateUser(req.user.id, updates);
    const updatedUser = await findUserById(req.user.id);

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role
      }
    });
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// PUT /api/auth/password - Change password
router.put('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Get user with password hash
    const user = await findUserByEmail(req.user.email);
    const isValid = await verifyPassword(user, currentPassword);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    await updateUserPassword(req.user.id, newPassword);
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// POST /api/auth/verify-email - Verify email with token
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const user = await findUserByVerificationToken(token);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification link' });
    }

    await verifyUserEmail(user.id);

    res.json({ message: 'Email verified successfully. You can now sign in.' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

// POST /api/auth/resend-verification - Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      // Don't reveal if email exists
      return res.json({ message: 'If an account exists, a verification email has been sent.' });
    }

    if (user.email_verified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Generate new verification token
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    await setVerificationToken(user.id, token, expiresAt);

    try {
      await sendVerificationEmail(email, user.name, token);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
    }

    res.json({ message: 'If an account exists, a verification email has been sent.' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      // Don't reveal if email exists - security measure
      return res.json({ message: 'If an account exists, a password reset link has been sent.' });
    }

    // Generate reset token
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
    await setResetToken(user.id, token, expiresAt);

    try {
      await sendPasswordResetEmail(email, user.name, token);
    } catch (emailError) {
      console.error('Failed to send reset email:', emailError);
    }

    res.json({ message: 'If an account exists, a password reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password - Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await findUserByResetToken(token);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    // Update password and clear reset token
    await updateUserPassword(user.id, newPassword);
    await clearResetToken(user.id);

    // Also verify email if not already verified
    if (!user.email_verified) {
      await verifyUserEmail(user.id);
    }

    res.json({ message: 'Password reset successfully. You can now sign in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// GET /api/auth/verify-reset-token - Check if reset token is valid
router.get('/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ valid: false, error: 'Token is required' });
    }

    const user = await findUserByResetToken(token);
    if (!user) {
      return res.json({ valid: false, error: 'Invalid or expired reset link' });
    }

    res.json({ valid: true, email: user.email });
  } catch (error) {
    console.error('Verify reset token error:', error);
    res.status(500).json({ valid: false, error: 'Failed to verify token' });
  }
});

module.exports = router;
