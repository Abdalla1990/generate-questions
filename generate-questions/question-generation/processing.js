// processing.js - Media processing logic for questions
const { getImageGenerator, getAudioGenerator, IMAGE_COST, AUDIO_COST, requiresMediaProcessing } = require('./config');

// Cost tracking variables
let totalImageCost = 0;
let totalImagesFailed = 0;
let totalImagesGenerated = 0;
let totalAudioGenerated = 0;
let totalAudioFailed = 0;
let totalAudioCost = 0;

/**
 * Process media content for a question (image or audio)
 * @param {Object} question - The question object to process
 * @param {Object} config - Configuration for media processing
 * @returns {Promise<Object>} Processed question with media data
 */
async function processMediaContent(question, config) {
  const {
    type,
    generator,
    statsTracking,
    mediaConfig
  } = config;

  try {
    console.log(`\nProcessing ${type} for question: ${question.title}`);
    const mediaData = await generator(question);

    // Update statistics
    if (type === 'image') {
      totalImagesGenerated++;
      totalImageCost += IMAGE_COST;
    } else if (type === 'audio') {
      totalAudioGenerated++;
      totalAudioCost += AUDIO_COST;
    }

    return {
      ...question,
      ...mediaData
    };
  } catch (error) {
    console.error(`✗ Failed to generate ${type}:`, error.message);

    // Update failure statistics
    if (type === 'image') {
      totalImagesFailed++;
    } else if (type === 'audio') {
      totalAudioFailed++;
    }

    return {
      ...question,
      [`${type}-type`]: 'placeholder',
      [`${type}-data`]: question[mediaConfig.fallbackField]
    };
  }
}

/**
 * Process a single question based on its type
 * @param {Object} question - The question object to process
 * @returns {Promise<Object>} Processed question
 */
async function processQuestion(question) {
  // Handle question-specific processing
  if (question['question-type'] === 'image') {
    return processMediaContent(question, {
      type: 'image',
      generator: getImageGenerator(),
      statsTracking: {
        generated: totalImagesGenerated,
        failed: totalImagesFailed,
        cost: totalImageCost
      },
      mediaConfig: {
        cost: IMAGE_COST,
        fallbackField: 'image-hint'
      }
    });
  }

  if (question['question-type'] === 'voice') {
    return processMediaContent(question, {
      type: 'audio',
      generator: getAudioGenerator(),
      statsTracking: {
        generated: totalAudioGenerated,
        failed: totalAudioFailed,
        cost: totalAudioCost
      },
      mediaConfig: {
        cost: AUDIO_COST,
        fallbackField: 'audio-url'
      }
    });
  }

  // For multiple choice, ensure correct-answer-index
  if (question['question-type'] === 'multiple-choice') {
    const { 'correct-answer': _, ...rest } = question;
    return rest;
  }

  // For other types (video), ensure they use correct-answer
  return question;
}

/**
 * Process all questions in parallel
 * @param {Array} questions - Array of questions to process
 * @returns {Promise<Array>} Array of processed questions
 */
async function processAllQuestions(questions) {
  console.log('\nProcessing questions...');
  console.log('---------------------');

  const processedQuestions = [];
  for (let i = 0; i < questions.length; i++) {
    console.log(`Processing question ${i + 1}/${questions.length}...`);
    const processedQuestion = await processQuestion(questions[i]);
    processedQuestions.push(processedQuestion);
  }

  return processedQuestions;
}

/**
 * Get current processing statistics
 * @returns {Object} Current statistics
 */
function getProcessingStats() {
  return {
    images: {
      generated: totalImagesGenerated,
      failed: totalImagesFailed,
      cost: totalImageCost
    },
    audio: {
      generated: totalAudioGenerated,
      failed: totalAudioFailed,
      cost: totalAudioCost
    },
    totalCost: totalImageCost + totalAudioCost
  };
}

/**
 * Reset processing statistics
 */
function resetProcessingStats() {
  totalImageCost = 0;
  totalImagesFailed = 0;
  totalImagesGenerated = 0;
  totalAudioGenerated = 0;
  totalAudioFailed = 0;
  totalAudioCost = 0;
}

module.exports = {
  processMediaContent,
  processQuestion,
  processAllQuestions,
  getProcessingStats,
  resetProcessingStats
};
