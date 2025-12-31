const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getPerformance, getPerformanceStats, getPerformanceByCourse, resetPerformance } = require('../services/database');
const { getSuggestions } = require('../services/groq');
const { getCourse } = require('../services/storage');

// Helper to transform database results to expected format
async function buildPerformanceData(userId, courseId = null) {
  const records = courseId
    ? await getPerformanceByCourse(userId, courseId)
    : await getPerformance(userId);

  const stats = await getPerformanceStats(userId);

  // Build aggregated data
  const byCourse = {};
  const byTopic = {};
  const byType = {};
  const recentActivity = [];

  records.forEach(record => {
    // By course
    if (!byCourse[record.course_id]) {
      byCourse[record.course_id] = {
        attempts: 0,
        correct: 0,
        totalScore: 0,
        averageScore: 0,
        topics: {},
        byType: {}
      };
    }
    const course = byCourse[record.course_id];
    course.attempts++;
    if (record.is_correct) course.correct++;
    course.totalScore += record.score;
    course.averageScore = Math.round(course.totalScore / course.attempts);

    // By topic within course
    if (!course.topics[record.topic_id]) {
      course.topics[record.topic_id] = {
        topicId: record.topic_id,
        attempts: 0,
        correct: 0,
        totalScore: 0,
        averageScore: 0
      };
    }
    const topic = course.topics[record.topic_id];
    topic.attempts++;
    if (record.is_correct) topic.correct++;
    topic.totalScore += record.score;
    topic.averageScore = Math.round(topic.totalScore / topic.attempts);

    // By type within course
    if (!course.byType[record.question_type]) {
      course.byType[record.question_type] = {
        attempts: 0,
        correct: 0,
        totalScore: 0,
        averageScore: 0
      };
    }
    const type = course.byType[record.question_type];
    type.attempts++;
    if (record.is_correct) type.correct++;
    type.totalScore += record.score;
    type.averageScore = Math.round(type.totalScore / type.attempts);

    // Global by topic
    const topicKey = `${record.course_id}:${record.topic_id}`;
    if (!byTopic[topicKey]) {
      byTopic[topicKey] = {
        courseId: record.course_id,
        topicId: record.topic_id,
        attempts: 0,
        correct: 0,
        averageScore: 0
      };
    }
    byTopic[topicKey].attempts++;
    if (record.is_correct) byTopic[topicKey].correct++;

    // Global by type
    if (!byType[record.question_type]) {
      byType[record.question_type] = { attempts: 0, correct: 0 };
    }
    byType[record.question_type].attempts++;
    if (record.is_correct) byType[record.question_type].correct++;
  });

  // Recent activity (last 20)
  records.slice(0, 20).forEach(record => {
    recentActivity.push({
      courseId: record.course_id,
      topicId: record.topic_id,
      questionType: record.question_type,
      score: record.score,
      isCorrect: record.is_correct,
      timestamp: record.created_at
    });
  });

  return {
    overall: {
      totalQuestions: stats.totalQuestions || 0,
      correctAnswers: stats.correctAnswers || 0,
      averageScore: Math.round(stats.averageScore || 0)
    },
    byCourse,
    byTopic,
    byQuestionType: byType,
    recentActivity
  };
}

// GET /api/performance - Get all performance data (Requires auth)
router.get('/', requireAuth, async (req, res) => {
  try {
    const performance = await buildPerformanceData(req.user.id);
    res.json(performance);
  } catch (error) {
    console.error('Error fetching performance:', error);
    res.status(500).json({ error: 'Failed to load performance data' });
  }
});

// GET /api/performance/course/:courseId - Get performance for a specific course (Requires auth)
router.get('/course/:courseId', requireAuth, async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const performance = await buildPerformanceData(req.user.id, courseId);
    const courseData = performance.byCourse[courseId];

    // Get course data to map topic IDs to names
    const course = await getCourse(courseId);
    const topicNameMap = {};
    if (course && course.topics) {
      course.topics.forEach(topic => {
        topicNameMap[topic.id] = topic.name;
      });
    }

    if (courseData) {
      // Add topic names to the topics data
      const topicsWithNames = {};
      Object.entries(courseData.topics || {}).forEach(([topicId, topicData]) => {
        topicsWithNames[topicId] = {
          ...topicData,
          name: topicNameMap[topicId] || topicId
        };
      });

      // Add topic names and question text to recent activity
      const recentWithDetails = performance.recentActivity.map(activity => ({
        ...activity,
        topicName: topicNameMap[activity.topicId] || activity.topicId
      }));

      res.json({
        course: courseData,
        topics: topicsWithNames,
        byType: courseData.byType || {},
        recentActivity: recentWithDetails
      });
    } else {
      res.json({
        course: {
          attempts: 0,
          correct: 0,
          totalScore: 0,
          averageScore: 0,
          topics: {},
          byType: {}
        },
        topics: {},
        byType: {},
        recentActivity: []
      });
    }
  } catch (error) {
    console.error('Error fetching course performance:', error);
    res.status(500).json({ error: 'Failed to load course performance' });
  }
});

// GET /api/performance/suggestions - Get AI-powered suggestions (Requires auth)
router.get('/suggestions', requireAuth, async (req, res) => {
  try {
    const performance = await buildPerformanceData(req.user.id);
    const suggestions = await getSuggestions(performance, req.user.id);
    res.json(suggestions);
  } catch (error) {
    console.error('Error getting suggestions:', error);
    res.status(500).json({ error: 'Failed to generate suggestions: ' + error.message });
  }
});

// POST /api/performance/reset - Reset performance data (Requires auth)
router.post('/reset', requireAuth, async (req, res) => {
  try {
    const { courseId } = req.body;
    await resetPerformance(req.user.id, courseId);
    const performance = await buildPerformanceData(req.user.id);
    res.json({ message: 'Performance data reset successfully', performance });
  } catch (error) {
    console.error('Error resetting performance:', error);
    res.status(500).json({ error: 'Failed to reset performance data' });
  }
});

module.exports = router;
