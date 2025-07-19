// config.js - Configuration and constants for question generation

// Import the new comprehensive question types configuration
const questionTypesConfig = require('./question-types-config.json');

// Import the legacy required fields for backward compatibility
const requiredFields = require('./questions-required-fields.json');

// Define available categories
const CATEGORIES = require('../categories.json');

/**
 * Get enabled question types from configuration
 * @returns {Array} Array of enabled question type names
 */
function getEnabledQuestionTypes() {
  return Object.keys(questionTypesConfig.questionTypes)
    .filter(type => questionTypesConfig.questionTypes[type].enabled);
}

/**
 * Get question type configuration
 * @param {string} type - Question type name
 * @returns {Object} Configuration for the question type
 */
function getQuestionTypeConfig(type) {
  return questionTypesConfig.questionTypes[type];
}

/**
 * Get all question type configurations (enabled and disabled)
 * @returns {Object} All question type configurations
 */
function getAllQuestionTypes() {
  return questionTypesConfig.questionTypes;
}

/**
 * Check if a question type requires media processing
 * @param {string} type - Question type name
 * @returns {boolean} True if media processing is required
 */
function requiresMediaProcessing(type) {
  const config = getQuestionTypeConfig(type);
  return config && config.mediaProcessing;
}

/**
 * Get allowed contexts for image questions
 * @returns {Array} Array of allowed image contexts
 */
function getAllowedImageContexts() {
  const imageConfig = getQuestionTypeConfig('image');
  return imageConfig ? imageConfig.allowedContexts || [] : [];
}

// Choose which image generator to use (default to Stability)
const useStabilityAI = process.env.USE_DALLE !== 'true';

// Lazy load generators to avoid requiring API keys during import
let _generateImage = null;
let _generateAudio = null;

function getImageGenerator() {
  if (!_generateImage) {
    if (useStabilityAI) {
      const { generateImage: generateStabilityImage } = require('../imageProcessingStability');
      _generateImage = generateStabilityImage;
    } else {
      const { generateImage: generateDallEImage } = require('../imageProcessing');
      _generateImage = generateDallEImage;
    }
  }
  return _generateImage;
}

function getAudioGenerator() {
  if (!_generateAudio) {
    const { generateAudio } = require('../audioProcessing');
    _generateAudio = generateAudio;
  }
  return _generateAudio;
}

// Get cost constants from media configuration
const imageService = useStabilityAI ? 'stability' : 'dalle';
const audioService = 'openai'; // Default for now

const IMAGE_COST = questionTypesConfig.mediaConfiguration.image.services[imageService].costPerImage;
const AUDIO_COST = questionTypesConfig.mediaConfiguration.audio.services[audioService].costPer1kChars;

// Legacy cost constants for backward compatibility
const DALL_E_COST = questionTypesConfig.mediaConfiguration.image.services.dalle.costPerImage;
const STABILITY_COST = questionTypesConfig.mediaConfiguration.image.services.stability.costPerImage;

// Create type mapping for the prompt - only include enabled types
const questionTypeMapping = {};
const questionTypeExamples = {};

Object.keys(questionTypesConfig.questionTypes).forEach(type => {
  const config = questionTypesConfig.questionTypes[type];
  if (config.enabled) {
    // Convert kebab-case to PascalCase for mapping
    const mappedName = type.split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');

    questionTypeMapping[type] = mappedName;
    questionTypeExamples[type] = config.promptExample;
  }
});

module.exports = {
  // Core configuration
  questionTypesConfig,
  getEnabledQuestionTypes,
  getQuestionTypeConfig,
  getAllQuestionTypes,
  requiresMediaProcessing,
  getAllowedImageContexts,

  // Generators
  useStabilityAI,
  getImageGenerator,
  getAudioGenerator,

  // Legacy compatibility
  requiredFields,
  CATEGORIES,

  // Costs
  DALL_E_COST,
  STABILITY_COST,
  AUDIO_COST,
  IMAGE_COST,

  // Dynamic mappings (based on enabled types)
  questionTypeMapping,
  questionTypeExamples
};
