// api/wrappers/questions-merger-wrapper.js - ES Module wrapper for QuestionsMerger
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import the CommonJS module
const QuestionsMerger = require('../../merge-questions/questions-merger.js');

// Export as ES module
export default QuestionsMerger;
export { QuestionsMerger };
