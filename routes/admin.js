const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const {
  getAllUsers,
  findUserById,
  updateUser,
  deleteUser,
  getPerformance,
  getPerformanceStats,
  getPerformanceByCourse,
  getHistory,
  getInterviews,
  getSetting,
  setSetting,
  getAllSettings
} = require('../services/database');
const { AVAILABLE_MODELS, DEFAULT_MODEL } = require('../services/groq');

// All admin routes require admin role
router.use(requireAdmin);

// GET /api/admin/users - List all users
router.get('/users', async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/admin/users/:id - Get specific user
router.get('/users/:id', async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PUT /api/admin/users/:id - Update user
router.put('/users/:id', async (req, res) => {
  try {
    const { name, role, email, enabled } = req.body;
    const userId = parseInt(req.params.id);

    // Prevent admin from changing their own role
    if (userId === req.user.id && role && role !== req.user.role) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    // Prevent admin from disabling themselves
    if (userId === req.user.id && enabled === false) {
      return res.status(400).json({ error: 'Cannot disable your own account' });
    }

    const updates = {};
    if (name) updates.name = name;
    if (role && ['admin', 'learner'].includes(role)) updates.role = role;
    if (email) updates.email = email;
    if (enabled !== undefined) updates.enabled = enabled;

    const updated = await updateUser(userId, updates);
    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = await findUserById(userId);
    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Prevent admin from deleting themselves
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const deleted = await deleteUser(userId);
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/admin/users/:id/performance - View user's performance
router.get('/users/:id/performance', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const user = await findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stats = await getPerformanceStats(userId);
    const recent = await getPerformance(userId);

    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      stats,
      recent: recent.slice(0, 20)
    });
  } catch (error) {
    console.error('Error fetching user performance:', error);
    res.status(500).json({ error: 'Failed to fetch performance' });
  }
});

// GET /api/admin/users/:id/history - View user's history
router.get('/users/:id/history', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const courseId = req.query.courseId || null;
    const user = await findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const history = await getHistory(userId, courseId, 100);

    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      history
    });
  } catch (error) {
    console.error('Error fetching user history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// GET /api/admin/users/:id/interviews - View user's interviews
router.get('/users/:id/interviews', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const user = await findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const interviews = await getInterviews(userId);

    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      interviews
    });
  } catch (error) {
    console.error('Error fetching user interviews:', error);
    res.status(500).json({ error: 'Failed to fetch interviews' });
  }
});

// GET /api/admin/stats - Platform statistics
router.get('/stats', async (req, res) => {
  try {
    const users = await getAllUsers();
    const adminCount = users.filter(u => u.role === 'admin').length;
    const learnerCount = users.filter(u => u.role === 'learner').length;

    res.json({
      totalUsers: users.length,
      admins: adminCount,
      learners: learnerCount
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/admin/course-performance - Get all learners' performance by course
router.get('/course-performance', async (req, res) => {
  try {
    const { getCourses } = require('../services/storage');
    const coursesData = await getCourses();
    const users = await getAllUsers();
    const learners = users.filter(u => u.role === 'learner');

    const result = [];

    for (const course of coursesData.courses) {
      const coursePerformance = {
        courseId: course.id,
        courseName: course.name,
        learners: []
      };

      for (const learner of learners) {
        const stats = await getPerformanceStats(learner.id);
        const courseRecords = await getPerformanceByCourse(learner.id, course.id);

        if (courseRecords.length > 0) {
          // Calculate course-specific stats
          let correct = 0;
          let totalScore = 0;
          courseRecords.forEach(r => {
            if (r.is_correct) correct++;
            totalScore += r.score;
          });

          coursePerformance.learners.push({
            id: learner.id,
            name: learner.name,
            email: learner.email,
            attempts: courseRecords.length,
            correct: correct,
            averageScore: Math.round(totalScore / courseRecords.length),
            lastActivity: courseRecords[0]?.created_at
          });
        }
      }

      // Only include courses with at least one learner activity
      if (coursePerformance.learners.length > 0) {
        result.push(coursePerformance);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching course performance:', error);
    res.status(500).json({ error: 'Failed to fetch course performance' });
  }
});

// GET /api/admin/api-keys-status - Check which API keys are configured
router.get('/api-keys-status', (req, res) => {
  res.json({
    groq: !!process.env.GROQ_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY
  });
});

// GET /api/admin/settings - Get all settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await getAllSettings();

    // Add current model info
    const currentModelKey = settings.ai_model || DEFAULT_MODEL;
    const currentModel = AVAILABLE_MODELS[currentModelKey] || AVAILABLE_MODELS[DEFAULT_MODEL];

    res.json({
      settings: {
        ai_model: currentModelKey,
        ...settings
      },
      currentModel,
      availableModels: Object.entries(AVAILABLE_MODELS).map(([key, config]) => ({
        key,
        ...config
      }))
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/admin/settings - Update settings
router.put('/settings', async (req, res) => {
  try {
    const { ai_model, require_email_verification, interview_min_questions, interview_min_score } = req.body;

    if (ai_model) {
      // Validate model key
      if (!AVAILABLE_MODELS[ai_model]) {
        return res.status(400).json({ error: 'Invalid model selection' });
      }
      await setSetting('ai_model', ai_model);
    }

    if (require_email_verification !== undefined) {
      await setSetting('require_email_verification', require_email_verification);
    }

    if (interview_min_questions !== undefined) {
      const minQuestions = parseInt(interview_min_questions) || 0;
      await setSetting('interview_min_questions', minQuestions.toString());
    }

    if (interview_min_score !== undefined) {
      const minScore = Math.min(100, Math.max(0, parseInt(interview_min_score) || 0));
      await setSetting('interview_min_score', minScore.toString());
    }

    if (req.body.interview_daily_question_limit !== undefined) {
      const dailyLimit = Math.max(1, parseInt(req.body.interview_daily_question_limit) || 50);
      await setSetting('interview_daily_question_limit', dailyLimit.toString());
    }

    if (req.body.enabled_question_types !== undefined) {
      // Validate and save enabled question types
      const validTypes = ['mcq', 'truefalse', 'concept', 'comparison', 'fillblank'];
      const enabledTypes = req.body.enabled_question_types.filter(t => validTypes.includes(t));
      await setSetting('enabled_question_types', JSON.stringify(enabledTypes));
    }

    if (req.body.allow_question_type_selection !== undefined) {
      await setSetting('allow_question_type_selection', req.body.allow_question_type_selection ? 'true' : 'false');
    }

    if (req.body.require_user_api_keys !== undefined) {
      await setSetting('require_user_api_keys', req.body.require_user_api_keys ? 'true' : 'false');
    }

    // Return updated settings
    const settings = await getAllSettings();
    const currentModelKey = settings.ai_model || DEFAULT_MODEL;
    const currentModel = AVAILABLE_MODELS[currentModelKey];

    res.json({
      message: 'Settings updated successfully',
      settings: {
        ai_model: currentModelKey,
        ...settings
      },
      currentModel
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
