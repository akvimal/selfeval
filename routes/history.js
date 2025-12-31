const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getHistory, getHistoryByCourse, getHistoryByTopic, getIncorrectQuestions, clearHistory, clearHistoryByCourse } = require('../services/storage');

// All history routes require authentication
router.use(requireAuth);

// GET /api/history - Get all question history
router.get('/', async (req, res) => {
  try {
    const history = await getHistory();
    res.json(history);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// GET /api/history/course/:courseId - Get history for a specific course
router.get('/course/:courseId', async (req, res) => {
  try {
    const questions = await getHistoryByCourse(req.params.courseId);
    res.json({ questions });
  } catch (error) {
    console.error('Error fetching course history:', error);
    res.status(500).json({ error: 'Failed to load course history' });
  }
});

// GET /api/history/topic/:courseId/:topicId - Get history for a specific topic
router.get('/topic/:courseId/:topicId', async (req, res) => {
  try {
    const questions = await getHistoryByTopic(req.params.courseId, req.params.topicId);
    res.json({ questions });
  } catch (error) {
    console.error('Error fetching topic history:', error);
    res.status(500).json({ error: 'Failed to load topic history' });
  }
});

// GET /api/history/incorrect - Get all incorrect questions for retry
router.get('/incorrect', async (req, res) => {
  try {
    const questions = await getIncorrectQuestions();
    res.json({ questions });
  } catch (error) {
    console.error('Error fetching incorrect questions:', error);
    res.status(500).json({ error: 'Failed to load incorrect questions' });
  }
});

// DELETE /api/history - Clear all history
router.delete('/', async (req, res) => {
  try {
    await clearHistory();
    res.json({ message: 'History cleared successfully' });
  } catch (error) {
    console.error('Error clearing history:', error);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// DELETE /api/history/course/:courseId - Clear history for a specific course
router.delete('/course/:courseId', async (req, res) => {
  try {
    await clearHistoryByCourse(req.params.courseId);
    res.json({ message: 'Course history cleared successfully' });
  } catch (error) {
    console.error('Error clearing course history:', error);
    res.status(500).json({ error: 'Failed to clear course history' });
  }
});

module.exports = router;
