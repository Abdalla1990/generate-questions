// api/wrappers/generate-questions-sets-wrapper.js - ES Module wrapper for generate-questions-sets
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import the CommonJS module
const generateSetsModule = require('../../generate-questions-sets/index.js');

// Extract the functions we need
const { generateQuestionSets, ensureSetsTableExists } = generateSetsModule;

// Export as ES modules
export {
  generateQuestionSets,
  ensureSetsTableExists
};

// Default export for backwards compatibility
export default {
  generateQuestionSets,
  ensureSetsTableExists
};
