const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const {
  getCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  createTopic,
  updateTopic,
  deleteTopic
} = require('../services/storage');
const { getCourseActivityStats } = require('../services/database');

// ==================== COURSE ROUTES ====================

// GET /api/courses - Get all courses
router.get('/', async (req, res) => {
  try {
    const data = await getCourses();
    let courses = data.courses;

    // Filter out disabled courses for non-admin users
    // Check if user is admin (if authenticated)
    const isAdmin = req.user && req.user.role === 'admin';
    if (!isAdmin) {
      courses = courses.filter(c => c.enabled !== false);
    }

    res.json(courses);
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Failed to load courses' });
  }
});

// GET /api/courses/:id - Get a specific course with its topics
router.get('/:id', async (req, res) => {
  try {
    const course = await getCourse(req.params.id);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if course is disabled and user is not admin
    const isAdmin = req.user && req.user.role === 'admin';
    if (course.enabled === false && !isAdmin) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json(course);
  } catch (error) {
    console.error('Error fetching course:', error);
    res.status(500).json({ error: 'Failed to load course' });
  }
});

// POST /api/courses - Create a new course (Admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, description, topics } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Course name is required' });
    }

    const course = await createCourse({
      name,
      description: description || '',
      topics: topics || []
    });

    res.status(201).json(course);
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/courses/:id - Update a course (Admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    const course = await updateCourse(req.params.id, updates);
    res.json(course);
  } catch (error) {
    console.error('Error updating course:', error);
    res.status(400).json({ error: error.message });
  }
});

// GET /api/courses/:id/activity - Get course activity stats (Admin only)
router.get('/:id/activity', requireAdmin, async (req, res) => {
  try {
    const stats = await getCourseActivityStats(req.params.id);
    res.json(stats);
  } catch (error) {
    console.error('Error getting course activity:', error);
    res.status(500).json({ error: 'Failed to get course activity' });
  }
});

// DELETE /api/courses/:id - Delete a course (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const deleted = await deleteCourse(req.params.id);
    res.json({ message: 'Course deleted successfully', course: deleted });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(400).json({ error: error.message });
  }
});

// ==================== TOPIC ROUTES ====================

// GET /api/courses/:id/topics - Get topics for a course
router.get('/:id/topics', async (req, res) => {
  try {
    const course = await getCourse(req.params.id);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json(course.topics);
  } catch (error) {
    console.error('Error fetching topics:', error);
    res.status(500).json({ error: 'Failed to load topics' });
  }
});

// POST /api/courses/:id/topics - Add a topic to a course (Admin only)
router.post('/:id/topics', requireAdmin, async (req, res) => {
  try {
    const { name, description, subtopics } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Topic name is required' });
    }

    const topic = await createTopic(req.params.id, {
      name,
      description: description || '',
      subtopics: subtopics || []
    });

    res.status(201).json(topic);
  } catch (error) {
    console.error('Error creating topic:', error);
    res.status(400).json({ error: error.message });
  }
});

// POST /api/courses/:id/topics/bulk - Bulk import topics (Admin only)
router.post('/:id/topics/bulk', requireAdmin, async (req, res) => {
  try {
    const { topics } = req.body;
    const courseId = req.params.id;

    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ error: 'Topics array is required' });
    }

    // Validate course exists
    const course = await getCourse(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Import topics one by one
    const imported = [];
    const errors = [];

    for (let i = 0; i < topics.length; i++) {
      const topicData = topics[i];

      if (!topicData.name) {
        errors.push(`Topic ${i + 1}: name is required`);
        continue;
      }

      try {
        const topic = await createTopic(courseId, {
          name: topicData.name,
          description: topicData.description || '',
          subtopics: topicData.subtopics || []
        });
        imported.push(topic);
      } catch (error) {
        errors.push(`Topic "${topicData.name}": ${error.message}`);
      }
    }

    res.status(201).json({
      imported: imported.length,
      errors: errors.length > 0 ? errors : undefined,
      topics: imported
    });
  } catch (error) {
    console.error('Error bulk importing topics:', error);
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/courses/:courseId/topics/:topicId - Update a topic (Admin only)
router.put('/:courseId/topics/:topicId', requireAdmin, async (req, res) => {
  try {
    const { name, description, subtopics } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (subtopics !== undefined) updates.subtopics = subtopics;

    const topic = await updateTopic(req.params.courseId, req.params.topicId, updates);
    res.json(topic);
  } catch (error) {
    console.error('Error updating topic:', error);
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/courses/:courseId/topics/:topicId - Delete a topic (Admin only)
router.delete('/:courseId/topics/:topicId', requireAdmin, async (req, res) => {
  try {
    const deleted = await deleteTopic(req.params.courseId, req.params.topicId);
    res.json({ message: 'Topic deleted successfully', topic: deleted });
  } catch (error) {
    console.error('Error deleting topic:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
