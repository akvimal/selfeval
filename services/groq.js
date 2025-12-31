const {
  getQuestionPrompt,
  getEvaluationPrompt,
  getSuggestionsPrompt,
  getInterviewStartPrompt,
  getInterviewContinuePrompt,
  getInterviewSummaryPrompt
} = require('../prompts/templates');
const { getSetting } = require('./database');

// API endpoints
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Available models configuration
const AVAILABLE_MODELS = {
  // Groq models
  'groq:llama-3.3-70b-versatile': { provider: 'groq', model: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq)' },
  'groq:llama-3.1-8b-instant': { provider: 'groq', model: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Groq)' },
  'groq:mixtral-8x7b-32768': { provider: 'groq', model: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Groq)' },
  // Anthropic models
  'anthropic:claude-3-5-haiku-latest': { provider: 'anthropic', model: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku' },
  'anthropic:claude-3-5-sonnet-latest': { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet' },
  'anthropic:claude-3-opus-latest': { provider: 'anthropic', model: 'claude-3-opus-latest', name: 'Claude 3 Opus' },
};

const DEFAULT_MODEL = 'groq:llama-3.3-70b-versatile';

async function getModelConfig() {
  try {
    const modelKey = await getSetting('ai_model') || DEFAULT_MODEL;
    return AVAILABLE_MODELS[modelKey] || AVAILABLE_MODELS[DEFAULT_MODEL];
  } catch (error) {
    // Database might not be initialized yet
    return AVAILABLE_MODELS[DEFAULT_MODEL];
  }
}

async function callGroqAPI(prompt, modelConfig) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set in environment variables');
  }

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelConfig.model,
      messages: [
        {
          role: 'system',
          content: 'You are an educational assistant that generates quiz questions and evaluates answers. Always respond with valid JSON only, no markdown formatting or additional text.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.9,
      max_tokens: 1024
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callAnthropicAPI(prompt, modelConfig) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set in environment variables. Add it to your .env file.');
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelConfig.model,
      max_tokens: 1024,
      system: 'You are an educational assistant that generates quiz questions and evaluates answers. Always respond with valid JSON only, no markdown formatting or additional text.',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

async function callAI(prompt) {
  const modelConfig = await getModelConfig();

  let content;
  if (modelConfig.provider === 'anthropic') {
    content = await callAnthropicAPI(prompt, modelConfig);
  } else {
    content = await callGroqAPI(prompt, modelConfig);
  }

  // Parse JSON from response, handling potential markdown code blocks
  let jsonStr = content;
  if (content.includes('```')) {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      jsonStr = match[1];
    }
  }

  try {
    return JSON.parse(jsonStr.trim());
  } catch (e) {
    console.error('Failed to parse AI response:', content);
    throw new Error('Failed to parse AI response as JSON');
  }
}

// Legacy function name for compatibility
async function callGroq(prompt) {
  return callAI(prompt);
}

async function generateQuestion(topic, questionType) {
  const prompt = getQuestionPrompt(topic, topic.subtopics, questionType);
  const question = await callGroq(prompt);

  return {
    ...question,
    type: questionType,
    topicId: topic.id,
    topicName: topic.name
  };
}

async function evaluateAnswer(questionType, question, userAnswer, questionData) {
  const prompt = getEvaluationPrompt(questionType, question, userAnswer, questionData);

  if (!prompt) {
    // For MCQ, True/False, Fill in the blank - use direct comparison
    return evaluateDirectAnswer(questionType, userAnswer, questionData);
  }

  // For concept and comparison - use AI evaluation
  return await callGroq(prompt);
}

function evaluateDirectAnswer(questionType, userAnswer, questionData) {
  let isCorrect = false;
  let score = 0;
  let feedback = '';

  switch (questionType) {
    case 'mcq':
      const selectedIndex = parseInt(userAnswer, 10);
      isCorrect = selectedIndex === questionData.correctAnswer;
      score = isCorrect ? 100 : 0;
      feedback = isCorrect
        ? 'Correct! ' + questionData.explanation
        : `Incorrect. The correct answer was: "${questionData.options[questionData.correctAnswer]}". ${questionData.explanation}`;
      break;

    case 'truefalse':
      const userBool = userAnswer === 'true' || userAnswer === true;
      isCorrect = userBool === questionData.correctAnswer;
      score = isCorrect ? 100 : 0;
      feedback = isCorrect
        ? 'Correct! ' + questionData.explanation
        : `Incorrect. The statement is ${questionData.correctAnswer ? 'TRUE' : 'FALSE'}. ${questionData.explanation}`;
      break;

    case 'fillblank':
      const userAnswerLower = userAnswer.toLowerCase().trim();
      const acceptableAnswers = questionData.acceptableAnswers.map(a => a.toLowerCase().trim());
      isCorrect = acceptableAnswers.includes(userAnswerLower);
      score = isCorrect ? 100 : 0;
      feedback = isCorrect
        ? 'Correct! ' + questionData.explanation
        : `Incorrect. The correct answer was: "${questionData.correctAnswer}". ${questionData.explanation}`;
      break;
  }

  return { isCorrect, score, feedback };
}

async function getSuggestions(performance) {
  if (!performance.overall || performance.overall.totalQuestions === 0) {
    return {
      motivation: "Welcome to your learning journey! Start practicing with any topic to begin tracking your progress.",
      strengths: [],
      areasToImprove: [],
      suggestions: [
        "Pick a topic you're curious about and try a few questions",
        "Don't worry about getting everything right - learning from mistakes is valuable",
        "Try different question types to find what works best for you"
      ],
      nextSteps: "Begin with a topic you're most interested in!"
    };
  }

  const prompt = getSuggestionsPrompt(performance);
  return await callGroq(prompt);
}

// ============================================================
// INTERVIEW FUNCTIONS
// ============================================================

async function startInterview(course, topics, persona = null, role = null, difficultyContext = null) {
  const prompt = getInterviewStartPrompt(course, topics, persona, role, difficultyContext);
  return await callGroq(prompt);
}

async function continueInterview(course, topics, conversationHistory, userResponse, persona = null, role = null, difficultyContext = null) {
  const prompt = getInterviewContinuePrompt(course, topics, conversationHistory, userResponse, persona, role, difficultyContext);
  return await callGroq(prompt);
}

async function endInterview(course, topics, conversationHistory, persona = null, role = null, difficultyTracker = null) {
  const prompt = getInterviewSummaryPrompt(course, topics, conversationHistory, persona, role, difficultyTracker);
  return await callGroq(prompt);
}

module.exports = {
  callGroq,
  callAI,
  generateQuestion,
  evaluateAnswer,
  getSuggestions,
  startInterview,
  continueInterview,
  endInterview,
  AVAILABLE_MODELS,
  DEFAULT_MODEL
};
