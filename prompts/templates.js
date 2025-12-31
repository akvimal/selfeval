const QUESTION_TYPES = {
  mcq: 'mcq',
  truefalse: 'truefalse',
  concept: 'concept',
  comparison: 'comparison',
  fillblank: 'fillblank'
};

const QUESTION_TYPE_LABELS = {
  mcq: 'Multiple Choice',
  truefalse: 'True or False',
  concept: 'Concept Explanation',
  comparison: 'Comparison',
  fillblank: 'Fill in the Blank'
};

function getQuestionPrompt(topic, subtopics, questionType, specificSubtopic = null) {
  const subtopicList = subtopics.join(', ');

  // Use specific subtopic if provided, otherwise pick randomly
  const focusSubtopic = specificSubtopic
    ? specificSubtopic
    : (subtopics.length > 0
        ? subtopics[Math.floor(Math.random() * subtopics.length)]
        : topic.name);

  // Random seed for variety
  const seed = Math.floor(Math.random() * 10000);
  const difficulty = ['beginner', 'intermediate', 'advanced'][Math.floor(Math.random() * 3)];

  const prompts = {
    mcq: `Generate a UNIQUE multiple choice question about ${topic.name}, specifically focusing on "${focusSubtopic}".
Topic areas: ${subtopicList}
Difficulty: ${difficulty}
Random seed: ${seed}

IMPORTANT: Generate a completely different question each time. Be creative and cover different aspects.

Return ONLY a valid JSON object in this exact format:
{
  "question": "Your question here?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswer": 0,
  "explanation": "Detailed explanation of why this is correct and why others are wrong."
}

The correctAnswer should be the index (0-3) of the correct option.
Make the question educational and challenging but fair.`,

    truefalse: `Generate a UNIQUE true or false question about ${topic.name}, specifically focusing on "${focusSubtopic}".
Topic areas: ${subtopicList}
Difficulty: ${difficulty}
Random seed: ${seed}

IMPORTANT: Generate a completely different question each time. Be creative and cover different aspects.

Return ONLY a valid JSON object in this exact format:
{
  "question": "Your statement here.",
  "correctAnswer": true,
  "explanation": "Detailed explanation of why this is true/false."
}

Make the statement educational and not too obvious.`,

    concept: `Generate a UNIQUE concept explanation question about ${topic.name}, specifically focusing on "${focusSubtopic}".
Topic areas: ${subtopicList}
Difficulty: ${difficulty}
Random seed: ${seed}

IMPORTANT: Generate a completely different question each time. Be creative and cover different aspects.

Return ONLY a valid JSON object in this exact format:
{
  "question": "Explain the concept of [specific concept] in your own words.",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3"],
  "sampleAnswer": "A comprehensive explanation that covers all key points.",
  "explanation": "Additional context and why understanding this concept is important."
}

Ask about a specific, important concept that learners should understand.`,

    comparison: `Generate a UNIQUE comparison question about ${topic.name}, specifically focusing on "${focusSubtopic}".
Topic areas: ${subtopicList}
Difficulty: ${difficulty}
Random seed: ${seed}

IMPORTANT: Generate a completely different question each time. Be creative and cover different aspects.

Return ONLY a valid JSON object in this exact format:
{
  "question": "Compare and contrast [item1] and [item2].",
  "item1": "First item name",
  "item2": "Second item name",
  "keyDifferences": ["Difference 1", "Difference 2", "Difference 3"],
  "keySimilarities": ["Similarity 1", "Similarity 2"],
  "sampleAnswer": "A comprehensive comparison covering key differences and similarities.",
  "explanation": "Why understanding this comparison is important."
}

Choose two related but distinct concepts that are often confused or compared.`,

    fillblank: `Generate a UNIQUE fill in the blank question about ${topic.name}, specifically focusing on "${focusSubtopic}".
Topic areas: ${subtopicList}
Difficulty: ${difficulty}
Random seed: ${seed}

IMPORTANT: Generate a completely different question each time. Be creative and cover different aspects.

Return ONLY a valid JSON object in this exact format:
{
  "question": "Complete statement with _____ as the blank.",
  "correctAnswer": "The word or phrase that fills the blank",
  "acceptableAnswers": ["correct answer", "alternative correct answer"],
  "explanation": "Detailed explanation of why this answer is correct."
}

Create a meaningful statement where filling the blank tests understanding, not just recall.`
  };

  return prompts[questionType] || prompts.mcq;
}

function getEvaluationPrompt(questionType, question, userAnswer, questionData) {
  if (questionType === 'concept') {
    return `Evaluate this concept explanation answer.

Question: ${question}
Key points that should be covered: ${questionData.keyPoints.join(', ')}
Sample answer: ${questionData.sampleAnswer}

User's answer: ${userAnswer}

Return ONLY a valid JSON object in this exact format:
{
  "score": 85,
  "isCorrect": true,
  "feedback": "Detailed feedback on what the user got right and what could be improved.",
  "missingPoints": ["Any key points that were not covered"],
  "strengths": ["What the user explained well"]
}

Score from 0-100. isCorrect is true if score >= 60.`;
  }

  if (questionType === 'comparison') {
    return `Evaluate this comparison answer.

Question: ${question}
Comparing: ${questionData.item1} vs ${questionData.item2}
Key differences: ${questionData.keyDifferences.join(', ')}
Key similarities: ${questionData.keySimilarities.join(', ')}
Sample answer: ${questionData.sampleAnswer}

User's answer: ${userAnswer}

Return ONLY a valid JSON object in this exact format:
{
  "score": 85,
  "isCorrect": true,
  "feedback": "Detailed feedback on the comparison.",
  "missingPoints": ["Any important points not covered"],
  "strengths": ["What the user compared well"]
}

Score from 0-100. isCorrect is true if score >= 60.`;
  }

  return null; // Other types don't need AI evaluation
}

function getSuggestionsPrompt(performance) {
  const courseStats = Object.entries(performance.byCourse || {})
    .map(([id, data]) => `${data.name}: ${data.averageScore}% avg (${data.attempts} attempts)`)
    .join('\n');

  const topicStats = Object.entries(performance.byTopic || {})
    .map(([id, data]) => `${data.name}: ${data.averageScore}% avg (${data.attempts} attempts)`)
    .join('\n');

  const typeStats = Object.entries(performance.byQuestionType || {})
    .filter(([_, data]) => data.attempts > 0)
    .map(([type, data]) => {
      const avg = data.attempts > 0 ? Math.round(data.totalScore / data.attempts) : 0;
      return `${QUESTION_TYPE_LABELS[type]}: ${avg}% avg (${data.attempts} attempts)`;
    })
    .join('\n');

  const overall = performance.overall || { averageScore: 0, totalQuestions: 0 };

  return `Based on this learner's performance, provide personalized suggestions and motivation.

Overall: ${overall.averageScore}% average across ${overall.totalQuestions} questions

Performance by Course:
${courseStats || 'No courses attempted yet'}

Performance by Topic:
${topicStats || 'No topics attempted yet'}

Performance by Question Type:
${typeStats || 'No questions attempted yet'}

Return ONLY a valid JSON object in this exact format:
{
  "motivation": "A personalized, encouraging message based on their progress.",
  "strengths": ["Area they're doing well in", "Another strength"],
  "areasToImprove": ["Topic or type needing work", "Another area"],
  "suggestions": ["Specific actionable suggestion 1", "Specific actionable suggestion 2", "Specific actionable suggestion 3"],
  "nextSteps": "What they should focus on next."
}

Be encouraging but honest. Focus on growth mindset and specific improvements.`;
}

// ============================================================
// INTERVIEW PROMPTS
// ============================================================

function getPersonaContext(persona) {
  if (!persona) {
    return `You are a friendly but thorough technical interviewer.`;
  }

  return `You are acting as a ${persona.name} interviewer.

Your interview style: ${persona.description}
Focus areas: ${persona.focusAreas?.join(', ') || 'general technical knowledge'}
Question style examples: ${persona.questionStyles?.join('; ') || 'open-ended technical questions'}

Behavior guidelines:
${persona.behaviorGuidelines?.map(g => `- ${g}`).join('\n') || '- Be professional and thorough'}

Evaluation emphasis:
- Technical accuracy: ${Math.round((persona.evaluationWeight?.technical || 0.5) * 100)}%
- Communication: ${Math.round((persona.evaluationWeight?.communication || 0.25) * 100)}%
- Problem solving: ${Math.round((persona.evaluationWeight?.problemSolving || 0.25) * 100)}%`;
}

function getRoleContext(role) {
  if (!role) {
    return '';
  }

  const levelDescriptions = {
    1: 'Entry-level focusing on fundamentals and learning ability',
    2: 'Mid-level with solid skills and growing independence',
    3: 'Senior-level with deep expertise and mentoring ability',
    4: 'Lead-level with technical leadership and strategic thinking'
  };

  let context = `
Target Role: ${role.name}${role.type === 'course-specific' ? ' (Specialized Role)' : ''}
Experience Level: ${role.yearsExperience || levelDescriptions[role.level] || 'Mid-level'}`;

  if (role.expectations) {
    context += `
Expected Profile:
- Technical depth: ${role.expectations.technicalDepth || 'solid'}
- Independence: ${role.expectations.independence || 'semi-independent'}
- Complexity handling: ${role.expectations.complexity || 'moderate'}`;
  }

  if (role.evaluationCriteria) {
    context += `
Evaluation criteria:
${role.evaluationCriteria.map(c => `- ${c}`).join('\n')}`;
  }

  if (role.focusTopics) {
    context += `
Key focus areas for this role: ${role.focusTopics.join(', ')}`;
  }

  return context;
}

function getDifficultyInstructions(difficultyContext) {
  if (!difficultyContext) {
    return '';
  }

  const levelGuidance = {
    1: 'Keep questions at a foundational level. Focus on basic concepts, simple use cases, and guided problem-solving. Provide hints when needed.',
    2: 'Ask moderately challenging questions. Expect understanding of core concepts and some ability to apply them independently.',
    3: 'Ask advanced questions requiring deep understanding. Explore edge cases, architectural decisions, and trade-offs.',
    4: 'Ask expert-level questions. Focus on system design, leadership scenarios, complex trade-offs, and strategic thinking.'
  };

  let instructions = `
Current Difficulty Level: ${difficultyContext.currentLevel}/4 (${difficultyContext.levelName})
${levelGuidance[difficultyContext.currentLevel] || levelGuidance[2]}`;

  if (difficultyContext.recentAssessments && difficultyContext.recentAssessments.length > 0) {
    instructions += `

Recent response quality: ${difficultyContext.recentAssessments.join(', ')}`;
  }

  instructions += `

Adaptation rules:
- If candidate is struggling (brief/partial answers), simplify questions or offer hints
- If candidate is excelling (excellent answers), increase depth or complexity
- Stay encouraging regardless of difficulty adjustments`;

  return instructions;
}

function getInterviewStartPrompt(course, topics, persona = null, role = null, difficultyContext = null) {
  const topicNames = topics.map(t => t.name).join(', ');
  const subtopics = topics.flatMap(t => t.subtopics || []).slice(0, 10).join(', ');

  const personaContext = getPersonaContext(persona);
  const roleContext = getRoleContext(role);
  const difficultyInstructions = getDifficultyInstructions(difficultyContext);

  return `${personaContext}
${roleContext}
${difficultyInstructions}

You are conducting an interview about ${course.name}.

The interview will cover these topics: ${topicNames}
Specific areas: ${subtopics}

Start the interview with:
1. A brief, friendly greeting${persona ? ` that reflects your ${persona.style} style` : ''}
2. Ask your first question about one of the topics

Return ONLY a valid JSON object in this exact format:
{
  "message": "Your greeting and first question here",
  "currentTopic": "The topic name you're asking about"
}

Guidelines:
- Be conversational and encouraging
- Start with a question appropriate for the target difficulty level
- Focus on understanding and application, not just recall
- Keep the question clear and specific${persona ? `
- Stay in character as a ${persona.name}` : ''}`;
}

function getInterviewContinuePrompt(course, topics, conversationHistory, userResponse, persona = null, role = null, difficultyContext = null) {
  const topicNames = topics.map(t => t.name).join(', ');

  const historyText = conversationHistory.map(msg =>
    `${msg.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${msg.content}`
  ).join('\n\n');

  const personaContext = getPersonaContext(persona);
  const roleContext = getRoleContext(role);
  const difficultyInstructions = getDifficultyInstructions(difficultyContext);

  return `${personaContext}
${roleContext}
${difficultyInstructions}

You are continuing an interview about ${course.name}.
Topics being covered: ${topicNames}

Conversation so far:
${historyText}

Candidate's latest response: ${userResponse}

Based on their response and your interviewer persona, do ONE of the following:
1. If the answer was incomplete or needs clarification, ask a probing follow-up question
2. If the answer was good, provide brief positive feedback and ask about a different aspect or topic
3. If the answer showed a misconception, gently correct it and ask a related question

Return ONLY a valid JSON object in this exact format:
{
  "message": "Your response including any feedback and your next question",
  "currentTopic": "The topic name you're asking about",
  "assessmentOfLastAnswer": "brief|partial|good|excellent",
  "isProbing": true or false
}

Assessment guide:
- "brief": Answer was too short, missing key points, or showed lack of understanding
- "partial": Answer covered some aspects but missed important details
- "good": Answer was solid, covered main points correctly
- "excellent": Answer was comprehensive, showed deep understanding, included good examples

Guidelines:
- Be encouraging but honest
- Ask probing questions to test depth of understanding
- Adjust question difficulty based on current level and recent performance
- If they struggle, simplify or give hints
- Mix different topics over time
- Keep questions conversational but substantive${persona ? `
- Stay in character as a ${persona.name} - focus on ${persona.focusAreas?.slice(0, 3).join(', ') || 'technical knowledge'}` : ''}`;
}

function getInterviewSummaryPrompt(course, topics, conversationHistory, persona = null, role = null, difficultyTracker = null) {
  const historyText = conversationHistory.map(msg =>
    `${msg.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${msg.content}`
  ).join('\n\n');

  let roleEvaluation = '';
  if (role) {
    roleEvaluation = `
Target Role: ${role.name}
${role.evaluationCriteria ? `Role Evaluation Criteria:
${role.evaluationCriteria.map(c => `- ${c}`).join('\n')}` : ''}`;
  }

  let personaEvaluation = '';
  if (persona && persona.evaluationWeight) {
    personaEvaluation = `
Evaluation Weights for ${persona.name} interview:
- Technical accuracy: ${Math.round(persona.evaluationWeight.technical * 100)}%
- Communication: ${Math.round(persona.evaluationWeight.communication * 100)}%
- Problem solving: ${Math.round(persona.evaluationWeight.problemSolving * 100)}%`;
  }

  let difficultyAnalysis = '';
  if (difficultyTracker) {
    difficultyAnalysis = `
Difficulty Progression:
- Started at level: ${difficultyTracker.adjustmentHistory?.[0]?.fromLevel || difficultyTracker.currentLevel}/4
- Ended at level: ${difficultyTracker.currentLevel}/4
${difficultyTracker.adjustmentHistory?.length > 0 ? `- Adjustments made: ${difficultyTracker.adjustmentHistory.length}` : '- No difficulty adjustments needed'}`;
  }

  return `You are a technical interviewer who just completed an interview about ${course.name}.
${roleEvaluation}
${personaEvaluation}
${difficultyAnalysis}

Full interview transcript:
${historyText}

Analyze the candidate's performance and provide a comprehensive summary.

Return ONLY a valid JSON object in this exact format:
{
  "score": 75,
  "overallFeedback": "A paragraph summarizing the candidate's overall performance",
  "topicsCovered": ["Topic 1", "Topic 2"],
  "strengths": ["Strength 1", "Strength 2", "Strength 3"],
  "areasToImprove": ["Area 1", "Area 2"],
  "recommendedNextSteps": "What the candidate should focus on next",
  "roleFitScore": 70,
  "roleFitFeedback": "Assessment of how well the candidate fits the target role",
  "difficultyProgression": "How the candidate handled increasing/decreasing difficulty"
}

Guidelines:
- Score from 0-100 based on demonstrated knowledge
- roleFitScore: 0-100 based on fit for the target role (omit if no role specified)
- Be constructive and specific in feedback
- Identify clear strengths and areas for improvement
- Give actionable next steps${persona ? `
- Evaluate with emphasis on ${persona.focusAreas?.slice(0, 2).join(' and ') || 'overall performance'}` : ''}`;
}

// ============================================================
// GUIDED LESSON PROMPTS
// ============================================================

function getLessonStartPrompt(courseName, topicName, subtopic) {
  return `You are an expert tutor teaching "${subtopic}" (part of ${topicName} in the ${courseName} course).

Create an engaging, step-by-step lesson to teach this concept. Your response should:

1. Start with a brief, friendly introduction
2. Explain the core concept clearly with a simple analogy or example
3. End with a simple question to check understanding

IMPORTANT GUIDELINES:
- Use clear, simple language
- Include a practical example or analogy
- Be encouraging and supportive
- Keep the initial explanation concise (2-3 paragraphs max)
- Ask ONE question at the end to engage the learner

Respond in JSON format:
{
  "content": "Your lesson content here with the question at the end",
  "step": 1
}`;
}

function getLessonContinuePrompt(courseName, topicName, subtopic, currentStep, messages) {
  const conversationHistory = messages.map(m =>
    `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`
  ).join('\n\n');

  return `You are an expert tutor teaching "${subtopic}" (part of ${topicName} in the ${courseName} course).

Current lesson step: ${currentStep}

Conversation so far:
${conversationHistory}

Based on the student's last response, continue the lesson:

1. If they answered correctly: Praise them briefly, add a bit more depth or a related concept, then ask another question OR if they've demonstrated solid understanding (after 3-4 good exchanges), conclude the lesson.

2. If they answered incorrectly or partially: Gently correct them, provide additional explanation, and ask a simpler follow-up question.

3. If they asked a question: Answer it clearly, then guide them back to the concept.

GUIDELINES:
- Be encouraging and supportive
- Build on what they know
- Use examples to clarify
- Keep responses focused (2-3 paragraphs max)
- Always end with a question unless concluding

A lesson is complete when the student has:
- Demonstrated understanding of the core concept
- Answered 2-3 questions correctly
- Shown they can apply the concept

Respond in JSON format:
{
  "content": "Your response here",
  "step": ${currentStep + 1},
  "completed": false
}

If the lesson is complete, set "completed": true and include a congratulatory summary instead of a question.`;
}

function getLessonHintPrompt(subtopic, currentStep, messages) {
  const lastExchange = messages.slice(-2).map(m =>
    `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`
  ).join('\n\n');

  return `A student learning "${subtopic}" needs a hint.

Recent exchange:
${lastExchange}

Provide a helpful hint that:
- Guides them toward the answer without giving it away
- Uses a different angle or simpler explanation
- Is encouraging

Respond in JSON format:
{
  "hint": "Your hint here"
}`;
}

module.exports = {
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  getQuestionPrompt,
  getEvaluationPrompt,
  getSuggestionsPrompt,
  getInterviewStartPrompt,
  getInterviewContinuePrompt,
  getInterviewSummaryPrompt,
  getLessonStartPrompt,
  getLessonContinuePrompt,
  getLessonHintPrompt
};
