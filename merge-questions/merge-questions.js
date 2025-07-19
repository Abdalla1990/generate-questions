// merge-questions.js - Merge all question JSON files into one mega file
const fs = require('fs');
const path = require('path');

/**
 * Configuration for the merge process
 */
const CONFIG = {
  // Define the expected structure for different question types
  questionTypeSchemas: {
    'multiple-choice': {
      required: ['id', 'categoryId', 'points', 'title', 'question-type', 'choices', 'correct-answer-index'],
      optional: ['image-hint', 'image-instructions', 'imageUrl', 'audioUrl']
    },
    'range': {
      required: ['id', 'categoryId', 'points', 'title', 'question-type', 'min-value', 'max-value', 'correct-answer', 'range', 'unit'],
      optional: ['image-hint', 'image-instructions', 'imageUrl', 'audioUrl']
    },
    'image': {
      required: ['id', 'categoryId', 'points', 'title', 'question-type', 'choices', 'correct-answer-index', 'imageUrl'],
      optional: ['image-hint', 'image-instructions', 'image-context']
    },
    'voice': {
      required: ['id', 'categoryId', 'points', 'title', 'question-type', 'audioUrl'],
      optional: ['choices', 'correct-answer-index', 'correct-answer', 'audio-context']
    },
    'video': {
      required: ['id', 'categoryId', 'points', 'title', 'question-type', 'videoUrl'],
      optional: ['choices', 'correct-answer-index', 'correct-answer', 'video-context']
    }
  },

  // Files to exclude from merging
  excludeFiles: [
    'questions-required-fields.json',
    'question-types-config.json'
  ],

  // Directory patterns to search for question files
  searchPatterns: [
    'questions-*.json',
    'public/questions*.json'
  ]
};

/**
 * Find all question JSON files in the workspace
 * @param {string} rootDir - Root directory to search from
 * @returns {Array} Array of file paths
 */
function findQuestionFiles(rootDir) {
  const questionFiles = [];

  // Search in root directory
  const rootFiles = fs.readdirSync(rootDir)
    .filter(file => file.startsWith('questions-') && file.endsWith('.json'))
    .filter(file => !CONFIG.excludeFiles.includes(file))
    .map(file => path.join(rootDir, file));

  questionFiles.push(...rootFiles);

  return questionFiles.sort();
}

/**
 * Load and parse a JSON file safely
 * @param {string} filePath - Path to the JSON file
 * @returns {Object} Parsed JSON or null if invalid
 */
function loadJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    // Validate that it's an array of questions
    if (!Array.isArray(data)) {
      console.warn(`⚠️  ${path.basename(filePath)}: Not an array, skipping`);
      return null;
    }

    return {
      filePath,
      questions: data,
      fileName: path.basename(filePath)
    };
  } catch (error) {
    console.warn(`⚠️  ${path.basename(filePath)}: Failed to parse - ${error.message}`);
    return null;
  }
}

/**
 * Normalize a question to the expected structure
 * @param {Object} question - Raw question object
 * @param {string} sourceFile - Source file name for logging
 * @returns {Object} Normalized question
 */
function normalizeQuestion(question, sourceFile) {
  const questionType = question['question-type'];
  const schema = CONFIG.questionTypeSchemas[questionType];

  if (!schema) {
    console.warn(`⚠️  Unknown question type "${questionType}" in ${sourceFile}`);
    return question; // Return as-is if we don't know the schema
  }

  const normalized = {};

  // Add all required fields
  schema.required.forEach(field => {
    if (question.hasOwnProperty(field)) {
      normalized[field] = question[field];
    } else {
      console.warn(`⚠️  Missing required field "${field}" in question ${question.id || 'unknown'} from ${sourceFile}`);
    }
  });

  // Add optional fields if they exist
  schema.optional.forEach(field => {
    if (question.hasOwnProperty(field)) {
      normalized[field] = question[field];
    }
  });

  // Handle legacy field mappings
  if (question.hasOwnProperty('correct-answer-idx') && !normalized['correct-answer-index']) {
    normalized['correct-answer-index'] = question['correct-answer-idx'];
    console.log(`📝 Mapped legacy field "correct-answer-idx" to "correct-answer-index" for question ${question.id}`);
  }

  // Ensure points is a valid value
  if (normalized.points && ![100, 300, 500].includes(normalized.points)) {
    console.warn(`⚠️  Invalid points value ${normalized.points} for question ${question.id}, keeping as-is`);
  }

  return normalized;
}

/**
 * Generate a unique hash for a question to detect duplicates
 * @param {Object} question - Question object
 * @returns {string} Question hash
 */
function generateQuestionHash(question) {
  // Use title and question type as primary identifiers
  const titleNormalized = (question.title || '').trim().toLowerCase();
  const type = question['question-type'] || 'unknown';

  // For multiple choice questions, include choices in hash
  if (type === 'multiple-choice' && question.choices) {
    const choicesHash = question.choices.join('|').toLowerCase();
    return `${type}:${titleNormalized}:${choicesHash}`;
  }

  // For range questions, include min/max values
  if (type === 'range') {
    const rangeHash = `${question['min-value']}-${question['max-value']}-${question.unit}`;
    return `${type}:${titleNormalized}:${rangeHash}`;
  }

  // For other types, just use title and type
  return `${type}:${titleNormalized}`;
}

/**
 * Generate a unique ID for questions that don't have one
 * @param {number} index - Question index
 * @param {string} prefix - ID prefix
 * @returns {string} Generated ID
 */
function generateQuestionId(index, prefix = 'merged') {
  return `${prefix}_q${String(index + 1).padStart(4, '0')}`;
}

/**
 * Merge all question files into one mega file
 * @param {string} rootDir - Root directory containing question files
 * @param {string} outputFile - Output file path
 * @returns {Object} Merge statistics
 */
async function mergeQuestionFiles(rootDir, outputFile) {
  console.log('🔄 Starting question file merge process...\n');

  // Find all question files
  const questionFiles = findQuestionFiles(rootDir);
  console.log(`📁 Found ${questionFiles.length} question files:`);
  questionFiles.forEach(file => console.log(`   - ${path.basename(file)}`));
  console.log();

  if (questionFiles.length === 0) {
    throw new Error('No question files found to merge');
  }

  // Load all files
  const loadedFiles = [];
  let totalQuestionsFound = 0;

  for (const filePath of questionFiles) {
    console.log(`📖 Loading ${path.basename(filePath)}...`);
    const fileData = loadJsonFile(filePath);

    if (fileData) {
      loadedFiles.push(fileData);
      totalQuestionsFound += fileData.questions.length;
      console.log(`   ✅ Loaded ${fileData.questions.length} questions`);
    }
  }

  console.log(`\n📊 Total questions found: ${totalQuestionsFound}`);

  // Process and merge questions
  const questionMap = new Map(); // hash -> {question, sources}
  const stats = {
    totalFiles: loadedFiles.length,
    totalQuestionsFound,
    questionsProcessed: 0,
    duplicatesFound: 0,
    questionsNormalized: 0,
    invalidQuestions: 0,
    finalCount: 0
  };

  console.log('\n🔄 Processing questions...');

  for (const fileData of loadedFiles) {
    console.log(`\n📝 Processing ${fileData.fileName}...`);

    for (let i = 0; i < fileData.questions.length; i++) {
      const rawQuestion = fileData.questions[i];
      stats.questionsProcessed++;

      // Validate basic structure
      if (!rawQuestion || typeof rawQuestion !== 'object') {
        console.warn(`   ⚠️  Invalid question at index ${i}, skipping`);
        stats.invalidQuestions++;
        continue;
      }

      // Normalize the question
      const normalizedQuestion = normalizeQuestion(rawQuestion, fileData.fileName);

      if (JSON.stringify(normalizedQuestion) !== JSON.stringify(rawQuestion)) {
        stats.questionsNormalized++;
      }

      // Generate hash for duplicate detection
      const questionHash = generateQuestionHash(normalizedQuestion);

      if (questionMap.has(questionHash)) {
        // Duplicate found
        stats.duplicatesFound++;
        const existing = questionMap.get(questionHash);
        existing.sources.push(fileData.fileName);
        console.log(`   🔄 Duplicate found: "${normalizedQuestion.title?.substring(0, 50)}..."`);
        console.log(`      Sources: ${existing.sources.join(', ')}`);
      } else {
        // New unique question
        questionMap.set(questionHash, {
          question: normalizedQuestion,
          sources: [fileData.fileName]
        });
      }
    }
  }

  // Generate final questions array
  console.log('\n🔧 Generating final questions array...');
  const finalQuestions = [];
  let idCounter = 0;

  for (const [hash, data] of questionMap) {
    const question = { ...data.question };

    // Ensure question has a unique ID
    if (!question.id || finalQuestions.some(q => q.id === question.id)) {
      question.id = generateQuestionId(idCounter);
      idCounter++;
    }

    finalQuestions.push(question);
  }

  stats.finalCount = finalQuestions.length;

  // Sort questions by category and points for better organization
  finalQuestions.sort((a, b) => {
    if (a.categoryId !== b.categoryId) {
      return (a.categoryId || '').localeCompare(b.categoryId || '');
    }
    return (a.points || 0) - (b.points || 0);
  });

  // Write output file
  console.log(`\n💾 Writing merged questions to ${path.basename(outputFile)}...`);
  fs.writeFileSync(outputFile, JSON.stringify(finalQuestions, null, 2));

  // Generate statistics report
  console.log('\n📊 Merge Complete! Statistics:');
  console.log('================================');
  console.log(`Files processed: ${stats.totalFiles}`);
  console.log(`Questions found: ${stats.totalQuestionsFound}`);
  console.log(`Questions processed: ${stats.questionsProcessed}`);
  console.log(`Duplicates removed: ${stats.duplicatesFound}`);
  console.log(`Questions normalized: ${stats.questionsNormalized}`);
  console.log(`Invalid questions skipped: ${stats.invalidQuestions}`);
  console.log(`Final unique questions: ${stats.finalCount}`);
  console.log(`Reduction: ${((stats.duplicatesFound / stats.totalQuestionsFound) * 100).toFixed(1)}%`);
  console.log('================================');

  return {
    stats,
    outputFile,
    finalQuestions
  };
}

/**
 * Main execution function
 */
async function main() {
  try {
    const rootDir = process.cwd();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(rootDir, `merged-questions-${timestamp}.json`);

    console.log('🚀 Question Merge Tool');
    console.log('======================\n');
    console.log(`Working directory: ${rootDir}`);
    console.log(`Output file: ${path.basename(outputFile)}\n`);

    const result = await mergeQuestionFiles(rootDir, outputFile);

    console.log(`\n✅ Merge completed successfully!`);
    console.log(`📁 Output: ${result.outputFile}`);
    console.log(`📊 ${result.stats.finalCount} unique questions saved`);

  } catch (error) {
    console.error('\n❌ Error during merge process:', error.message);
    process.exit(1);
  }
}

// Export for testing
module.exports = {
  mergeQuestionFiles,
  findQuestionFiles,
  normalizeQuestion,
  generateQuestionHash,
  CONFIG
};

// Run if called directly
if (require.main === module) {
  main();
}
