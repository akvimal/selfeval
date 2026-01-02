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
  getAllSettings,
  getAllDisputes,
  getDisputeById,
  resolveDispute,
  updateHistoryResult,
  updatePerformanceScore,
  getHistoryById,
  getCacheStats,
  getAllCachedQuestions,
  deleteCachedQuestion,
  clearQuestionCache
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
      // Build topic name map
      const topicMap = {};
      if (course.topics) {
        course.topics.forEach(t => { topicMap[t.id] = t.name; });
      }

      const coursePerformance = {
        courseId: course.id,
        courseName: course.name,
        topics: course.topics || [],
        learners: [],
        // Course-level aggregates
        summary: {
          totalQuestions: 0,
          totalCorrect: 0,
          averageScore: 0,
          activeLearners: 0,
          byTopic: {},
          byType: {}
        }
      };

      let courseTotalScore = 0;

      for (const learner of learners) {
        const courseRecords = await getPerformanceByCourse(learner.id, course.id);

        if (courseRecords.length > 0) {
          // Calculate learner's course-specific stats
          let correct = 0;
          let totalScore = 0;
          const learnerByTopic = {};
          const learnerByType = {};

          courseRecords.forEach(r => {
            if (r.is_correct) correct++;
            totalScore += r.score;

            // Topic breakdown for learner
            if (!learnerByTopic[r.topic_id]) {
              learnerByTopic[r.topic_id] = {
                name: topicMap[r.topic_id] || r.topic_id,
                attempts: 0,
                correct: 0,
                totalScore: 0
              };
            }
            learnerByTopic[r.topic_id].attempts++;
            if (r.is_correct) learnerByTopic[r.topic_id].correct++;
            learnerByTopic[r.topic_id].totalScore += r.score;

            // Type breakdown for learner
            if (!learnerByType[r.question_type]) {
              learnerByType[r.question_type] = { attempts: 0, correct: 0, totalScore: 0 };
            }
            learnerByType[r.question_type].attempts++;
            if (r.is_correct) learnerByType[r.question_type].correct++;
            learnerByType[r.question_type].totalScore += r.score;

            // Course-level topic aggregation
            if (!coursePerformance.summary.byTopic[r.topic_id]) {
              coursePerformance.summary.byTopic[r.topic_id] = {
                name: topicMap[r.topic_id] || r.topic_id,
                attempts: 0,
                correct: 0,
                totalScore: 0
              };
            }
            coursePerformance.summary.byTopic[r.topic_id].attempts++;
            if (r.is_correct) coursePerformance.summary.byTopic[r.topic_id].correct++;
            coursePerformance.summary.byTopic[r.topic_id].totalScore += r.score;

            // Course-level type aggregation
            if (!coursePerformance.summary.byType[r.question_type]) {
              coursePerformance.summary.byType[r.question_type] = { attempts: 0, correct: 0, totalScore: 0 };
            }
            coursePerformance.summary.byType[r.question_type].attempts++;
            if (r.is_correct) coursePerformance.summary.byType[r.question_type].correct++;
            coursePerformance.summary.byType[r.question_type].totalScore += r.score;
          });

          // Calculate averages for learner topic/type breakdown
          Object.values(learnerByTopic).forEach(t => {
            t.averageScore = Math.round(t.totalScore / t.attempts);
          });
          Object.values(learnerByType).forEach(t => {
            t.averageScore = Math.round(t.totalScore / t.attempts);
          });

          coursePerformance.learners.push({
            id: learner.id,
            name: learner.name,
            email: learner.email,
            attempts: courseRecords.length,
            correct: correct,
            averageScore: Math.round(totalScore / courseRecords.length),
            lastActivity: courseRecords[0]?.created_at,
            byTopic: learnerByTopic,
            byType: learnerByType
          });

          // Update course totals
          coursePerformance.summary.totalQuestions += courseRecords.length;
          coursePerformance.summary.totalCorrect += correct;
          courseTotalScore += totalScore;
        }
      }

      // Calculate course-level averages
      if (coursePerformance.learners.length > 0) {
        coursePerformance.summary.activeLearners = coursePerformance.learners.length;
        coursePerformance.summary.averageScore = Math.round(courseTotalScore / coursePerformance.summary.totalQuestions);

        // Calculate averages for topic/type summaries
        Object.values(coursePerformance.summary.byTopic).forEach(t => {
          t.averageScore = Math.round(t.totalScore / t.attempts);
        });
        Object.values(coursePerformance.summary.byType).forEach(t => {
          t.averageScore = Math.round(t.totalScore / t.attempts);
        });

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

    if (req.body.allow_clear_history !== undefined) {
      await setSetting('allow_clear_history', req.body.allow_clear_history ? 'true' : 'false');
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

// GET /api/admin/disputes - Get all disputes
router.get('/disputes', async (req, res) => {
  try {
    const status = req.query.status || null;
    const disputes = await getAllDisputes(status);
    res.json({ disputes });
  } catch (error) {
    console.error('Error fetching disputes:', error);
    res.status(500).json({ error: 'Failed to fetch disputes' });
  }
});

// GET /api/admin/disputes/:id - Get a specific dispute
router.get('/disputes/:id', async (req, res) => {
  try {
    const disputeId = parseInt(req.params.id);
    const dispute = await getDisputeById(disputeId);

    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    res.json({ dispute });
  } catch (error) {
    console.error('Error fetching dispute:', error);
    res.status(500).json({ error: 'Failed to fetch dispute' });
  }
});

// PUT /api/admin/disputes/:id/approve - Approve a dispute and re-evaluate
router.put('/disputes/:id/approve', async (req, res) => {
  try {
    const disputeId = parseInt(req.params.id);
    const adminId = req.user.id;

    const dispute = await getDisputeById(disputeId);
    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    if (dispute.status !== 'pending') {
      return res.status(400).json({ error: 'This dispute has already been resolved' });
    }

    // Get the history record for re-evaluation
    const history = await getHistoryById(dispute.history_id);
    if (!history) {
      return res.status(404).json({ error: 'Question history not found' });
    }

    // Re-evaluate the answer with AI
    const { evaluateAnswer } = require('../services/groq');
    const { getCourse } = require('../services/storage');

    const course = await getCourse(history.course_id);
    const topic = course?.topics?.find(t => t.id === history.topic_id);

    const newResult = await evaluateAnswer(
      history.question_data,
      history.user_answer,
      topic?.name || history.topic_id,
      req.user.id, // Use admin's ID for API tracking
      `Re-evaluation requested by learner. Original feedback: ${history.result.feedback || 'N/A'}. Learner's dispute reason: ${dispute.dispute_reason}`
    );

    // Update the history with new result
    await updateHistoryResult(dispute.history_id, newResult);

    // Update performance score if score changed
    const newScore = newResult.score || 0;
    const isCorrect = newScore >= 70;
    await updatePerformanceScore(dispute.history_id, newScore, isCorrect);

    // Resolve the dispute
    await resolveDispute(disputeId, 'approved', adminId, 'Re-evaluated based on your feedback.', newScore);

    res.json({
      message: 'Dispute approved and answer re-evaluated',
      newScore,
      newResult
    });
  } catch (error) {
    console.error('Error approving dispute:', error);
    res.status(500).json({ error: 'Failed to approve dispute' });
  }
});

// PUT /api/admin/disputes/:id/disapprove - Disapprove a dispute
router.put('/disputes/:id/disapprove', async (req, res) => {
  try {
    const disputeId = parseInt(req.params.id);
    const adminId = req.user.id;
    const { adminComments } = req.body;

    if (!adminComments || adminComments.trim().length < 10) {
      return res.status(400).json({ error: 'Please provide a reason for disapproval (at least 10 characters)' });
    }

    const dispute = await getDisputeById(disputeId);
    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    if (dispute.status !== 'pending') {
      return res.status(400).json({ error: 'This dispute has already been resolved' });
    }

    // Resolve the dispute as disapproved
    await resolveDispute(disputeId, 'disapproved', adminId, adminComments.trim(), null);

    res.json({
      message: 'Dispute disapproved',
      adminComments: adminComments.trim()
    });
  } catch (error) {
    console.error('Error disapproving dispute:', error);
    res.status(500).json({ error: 'Failed to disapprove dispute' });
  }
});

// GET /api/admin/cache - Get cache statistics and questions
router.get('/cache', async (req, res) => {
  try {
    const stats = await getCacheStats();
    const questions = await getAllCachedQuestions();
    res.json({ stats, questions });
  } catch (error) {
    console.error('Error fetching cache:', error);
    res.status(500).json({ error: 'Failed to fetch cache' });
  }
});

// DELETE /api/admin/cache/:id - Delete a specific cached question
router.delete('/cache/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await deleteCachedQuestion(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Cached question not found' });
    }
    res.json({ message: 'Cached question deleted' });
  } catch (error) {
    console.error('Error deleting cached question:', error);
    res.status(500).json({ error: 'Failed to delete cached question' });
  }
});

// DELETE /api/admin/cache - Clear all cached questions
router.delete('/cache', async (req, res) => {
  try {
    const { courseId, topicId } = req.query;
    const count = await clearQuestionCache(courseId || null, topicId || null);
    res.json({ message: `Cleared ${count} cached questions` });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

module.exports = router;
