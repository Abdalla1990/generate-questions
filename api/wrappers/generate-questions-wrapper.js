// api/wrappers/generate-questions-wrapper.js - ES Module wrapper for generate-questions
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import the CommonJS module
const generateQuestionsModule = require('../../generate-questions/question-generation/index.js');

// Extract the functions we need
const { generateGPTQuestions } = generateQuestionsModule;

// Export as ES modules
export {
  generateGPTQuestions
};

// Default export for backwards compatibility
export default {
  generateGPTQuestions
};
