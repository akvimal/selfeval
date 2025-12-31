const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getCourse, getTopic } = require('../services/storage');
const { generateQuestion } = require('../services/groq');
const { QUESTION_TYPES } = require('../prompts/templates');

// POST /api/questions/generate - Generate a question (Requires auth)
router.post('/generate', requireAuth, async (req, res) => {
  try {
    const { courseId, topicId, questionType } = req.body;

    if (!courseId || !topicId) {
      return res.status(400).json({ error: 'courseId and topicId are required' });
    }

    // Validate question type
    const validTypes = Object.values(QUESTION_TYPES);
    const type = questionType || validTypes[Math.floor(Math.random() * validTypes.length)];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: 'Invalid question type',
        validTypes
      });
    }

    // Get course and topic
    const course = await getCourse(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const topic = course.topics.find(t => t.id === topicId);
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    // Generate question
    const question = await generateQuestion(topic, type);

    // Add course and topic info to question (ensure they're included)
    res.json({
      ...question,
      type: type,
      topicId: topic.id,
      topicName: topic.name,
      courseId: course.id,
      courseName: course.name
    });
  } catch (error) {
    console.error('Error generating question:', error);
    res.status(500).json({ error: 'Failed to generate question: ' + error.message });
  }
});

// GET /api/questions/types - Get available question types
router.get('/types', (req, res) => {
  const { QUESTION_TYPES, QUESTION_TYPE_LABELS } = require('../prompts/templates');

  const types = Object.keys(QUESTION_TYPES).map(key => ({
    id: QUESTION_TYPES[key],
    label: QUESTION_TYPE_LABELS[key]
  }));

  res.json(types);
});

module.exports = router;
