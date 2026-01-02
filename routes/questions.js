const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getCourse, getTopic } = require('../services/storage');
const { generateQuestion } = require('../services/groq');
const { QUESTION_TYPES } = require('../prompts/templates');
const { getSetting, getCachedQuestionForUser, addQuestionToCache } = require('../services/database');

// All question types with labels
const ALL_QUESTION_TYPES = {
  mcq: { id: 'mcq', label: 'Multiple Choice' },
  truefalse: { id: 'truefalse', label: 'True or False' },
  concept: { id: 'concept', label: 'Concept Explanation' },
  comparison: { id: 'comparison', label: 'Comparison' },
  fillblank: { id: 'fillblank', label: 'Fill in the Blank' }
};

// GET /api/questions/types - Get enabled question types
router.get('/types', async (req, res) => {
  try {
    const enabledTypesSetting = await getSetting('enabled_question_types');
    const allowSelectionSetting = await getSetting('allow_question_type_selection');

    let enabledTypes;
    if (enabledTypesSetting) {
      enabledTypes = JSON.parse(enabledTypesSetting);
    } else {
      // Default: all types enabled
      enabledTypes = Object.keys(ALL_QUESTION_TYPES);
    }

    // Check if learners are allowed to select question type (default: false - random only)
    const allowSelection = allowSelectionSetting === 'true';

    const types = enabledTypes.map(id => ALL_QUESTION_TYPES[id]).filter(Boolean);

    res.json({
      types,
      allowSelection,
      defaultToRandom: true
    });
  } catch (error) {
    console.error('Error fetching question types:', error);
    res.status(500).json({ error: 'Failed to fetch question types' });
  }
});

// POST /api/questions/generate - Generate a question (Requires auth)
router.post('/generate', requireAuth, async (req, res) => {
  try {
    const { courseId, topicId, questionType, subtopic } = req.body;

    if (!courseId || !topicId) {
      return res.status(400).json({ error: 'courseId and topicId are required' });
    }

    // Validate question type - check enabled types
    const enabledTypesSetting = await getSetting('enabled_question_types');
    let enabledTypes;
    if (enabledTypesSetting) {
      enabledTypes = JSON.parse(enabledTypesSetting);
    } else {
      enabledTypes = Object.values(QUESTION_TYPES);
    }

    // If questionType provided, use it; otherwise pick randomly from enabled types
    const type = questionType || enabledTypes[Math.floor(Math.random() * enabledTypes.length)];

    if (!enabledTypes.includes(type)) {
      return res.status(400).json({
        error: 'Invalid or disabled question type',
        enabledTypes
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

    // Check cache first for an unanswered question
    const cachedQuestion = await getCachedQuestionForUser(req.user.id, courseId, topicId, type);

    if (cachedQuestion) {
      // Return cached question with cacheId
      const questionData = cachedQuestion.questionData;
      return res.json({
        ...questionData,
        cacheId: cachedQuestion.id,
        fromCache: true,
        type: type,
        topicId: topic.id,
        topicName: topic.name,
        courseId: course.id,
        courseName: course.name
      });
    }

    // No cached question available, generate a new one
    const question = await generateQuestion(topic, type, subtopic || null, req.user.id);

    // Save to cache
    const cacheResult = await addQuestionToCache(courseId, topicId, type, question);

    // Add course and topic info to question (ensure they're included)
    res.json({
      ...question,
      cacheId: cacheResult.id,
      fromCache: false,
      type: type,
      topicId: topic.id,
      topicName: topic.name,
      courseId: course.id,
      courseName: course.name,
      subtopic: subtopic || question.subtopic || null
    });
  } catch (error) {
    console.error('Error generating question:', error);
    res.status(500).json({ error: 'Failed to generate question: ' + error.message });
  }
});

module.exports = router;
