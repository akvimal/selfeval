const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getHistory, deleteHistory } = require('../services/database');
const { getCourse } = require('../services/storage');

// All history routes require authentication
router.use(requireAuth);

// Helper to format history records
function formatHistoryRecords(records, topicNameMap = {}) {
  return records.map(record => ({
    id: record.id,
    timestamp: record.created_at,
    question: {
      ...record.question_data,
      topicName: topicNameMap[record.topic_id] || record.topic_id
    },
    userAnswer: record.user_answer,
    result: record.result
  }));
}

// GET /api/history - Get all question history
router.get('/', async (req, res) => {
  try {
    const records = await getHistory(req.user.id, null, 100);
    const questions = formatHistoryRecords(records);
    res.json({ questions });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// GET /api/history/course/:courseId - Get history for a specific course
router.get('/course/:courseId', async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const records = await getHistory(req.user.id, courseId, 100);

    // Get topic names from course
    const course = await getCourse(courseId);
    const topicNameMap = {};
    if (course && course.topics) {
      course.topics.forEach(topic => {
        topicNameMap[topic.id] = topic.name;
      });
    }

    const questions = formatHistoryRecords(records, topicNameMap);
    res.json({ questions });
  } catch (error) {
    console.error('Error fetching course history:', error);
    res.status(500).json({ error: 'Failed to load course history' });
  }
});

// GET /api/history/topic/:courseId/:topicId - Get history for a specific topic
router.get('/topic/:courseId/:topicId', async (req, res) => {
  try {
    const { courseId, topicId } = req.params;
    const records = await getHistory(req.user.id, courseId, 100);
    const filtered = records.filter(r => r.topic_id === topicId);

    // Get topic name from course
    const course = await getCourse(courseId);
    const topicNameMap = {};
    if (course && course.topics) {
      course.topics.forEach(topic => {
        topicNameMap[topic.id] = topic.name;
      });
    }

    const questions = formatHistoryRecords(filtered, topicNameMap);
    res.json({ questions });
  } catch (error) {
    console.error('Error fetching topic history:', error);
    res.status(500).json({ error: 'Failed to load topic history' });
  }
});

// GET /api/history/incorrect - Get all incorrect questions for retry
router.get('/incorrect', async (req, res) => {
  try {
    const records = await getHistory(req.user.id, null, 200);
    const incorrect = records.filter(r => !r.result.isCorrect);
    const questions = formatHistoryRecords(incorrect);
    res.json({ questions });
  } catch (error) {
    console.error('Error fetching incorrect questions:', error);
    res.status(500).json({ error: 'Failed to load incorrect questions' });
  }
});

// DELETE /api/history - Clear all history
router.delete('/', async (req, res) => {
  try {
    await deleteHistory(req.user.id);
    res.json({ message: 'History cleared successfully' });
  } catch (error) {
    console.error('Error clearing history:', error);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// DELETE /api/history/course/:courseId - Clear history for a specific course
router.delete('/course/:courseId', async (req, res) => {
  try {
    await deleteHistory(req.user.id, req.params.courseId);
    res.json({ message: 'Course history cleared successfully' });
  } catch (error) {
    console.error('Error clearing course history:', error);
    res.status(500).json({ error: 'Failed to clear course history' });
  }
});

module.exports = router;
