const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { addPerformance, addHistory } = require('../services/database');
const { evaluateAnswer } = require('../services/groq');

// POST /api/evaluate - Evaluate an answer (Requires auth)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { questionData, userAnswer, skipped } = req.body;

    if (!questionData || userAnswer === undefined || userAnswer === null) {
      return res.status(400).json({ error: 'questionData and userAnswer are required' });
    }

    const { type, question, courseId, courseName, topicId, topicName } = questionData;
    const userId = req.user.id;

    let result;

    // Handle skipped questions
    if (skipped) {
      result = {
        score: 0,
        isCorrect: false,
        feedback: 'Question skipped.',
        skipped: true
      };
    } else {
      // Evaluate the answer (pass userId for user API keys)
      result = await evaluateAnswer(type, question, userAnswer, questionData, userId);
    }

    // Update performance tracking (user-specific in SQLite)
    await addPerformance(
      userId,
      courseId,
      topicId,
      type,
      result.score,
      result.isCorrect
    );

    // Save to history for future reference (user-specific in SQLite)
    await addHistory(userId, courseId, topicId, type, questionData, userAnswer, result);

    res.json({
      ...result,
      questionType: type,
      courseId,
      courseName,
      topicId,
      topicName
    });
  } catch (error) {
    console.error('Error evaluating answer:', error);
    res.status(500).json({ error: 'Failed to evaluate answer: ' + error.message });
  }
});

module.exports = router;
