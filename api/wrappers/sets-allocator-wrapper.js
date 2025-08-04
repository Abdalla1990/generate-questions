// api/wrappers/sets-allocator-wrapper.js - ES Module wrapper for SetsAllocator
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import the CommonJS module
const SetsAllocator = require('../../generate-questions-sets/sets-allocator.js');

// Export as ES module
export default SetsAllocator;
export { SetsAllocator };
