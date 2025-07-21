// index.js - Main entry point for question generation
// Load environment variables from .env file
// Check for different environment files in priority order: .env.dev, .env
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '..', '.env.dev');
const fallbackEnvPath = path.join(__dirname, '..', '..', '.env');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else if (fs.existsSync(fallbackEnvPath)) {
  require('dotenv').config({ path: fallbackEnvPath });
}

const { generateQuestionsWithOpenAI, parseQuestionsFromResponse } = require('./generator');
const { validateQuestions } = require('./validation');
const { analyzeQuestionTypeDistribution, analyzeCategoryDistribution } = require('./distribution');
const { processAllQuestions, getProcessingStats, resetProcessingStats } = require('./processing');
const { storeQuestions, generateStorageStats } = require('./storage');

/**
 * Get elapsed time since start in a human-readable format
 * @param {number} startTime - Start time in milliseconds
 * @returns {string} - Formatted elapsed time
 */
function getElapsedTime(startTime) {
  const elapsed = Date.now() - startTime;
  return formatExecutionTime(elapsed);
}

/**
 * Format execution time in a human-readable format
 * @param {number} milliseconds - Time in milliseconds
 * @returns {string} - Formatted time (e.g., "2m 30s", "45s", "1h 15m 30s")
 */
function formatExecutionTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Main function to generate Arabic trivia questions
 * @param {number} numQuestions - Number of questions to generate (default from env or 10)
 * @returns {Promise<Object>} - Returns execution report with questions and statistics
 */
async function generateGPTQuestions(numQuestions = null) {
  // Start execution time tracking
  const executionStart = Date.now();
  const executionStartISO = new Date().toISOString();

  // Reset processing statistics
  resetProcessingStats();

  // Adjust how many questions you want per run
  const NUM_Q = numQuestions || Number(process.env.NUM_QUESTIONS) || 10;

  console.log(`🚀 Starting generation of ${NUM_Q} Arabic trivia questions...`);
  console.log(`⏰ Start time: ${executionStartISO}`);

  try {

    // Generate questions using OpenAI
    console.log(`⏱️  [${getElapsedTime(executionStart)}] Generating questions with OpenAI...`);
    const { response, costs } = await generateQuestionsWithOpenAI(NUM_Q);

    // Parse questions from response
    console.log(`⏱️  [${getElapsedTime(executionStart)}] Parsing questions from response...`);
    let questions = parseQuestionsFromResponse(response);

    // Process all questions for media content
    console.log(`⏱️  [${getElapsedTime(executionStart)}] Processing media content...`);
    questions = await processAllQuestions(questions);

    // Validate questions
    console.log(`⏱️  [${getElapsedTime(executionStart)}] Validating questions...`);
    const { validatedQuestions } = validateQuestions(questions);
    questions = validatedQuestions;

    // Analyze distributions
    console.log(`⏱️  [${getElapsedTime(executionStart)}] Analyzing distributions...`);
    analyzeQuestionTypeDistribution(questions);
    analyzeCategoryDistribution(questions);

    // Store questions in DynamoDB
    console.log(`⏱️  [${getElapsedTime(executionStart)}] Storing questions in DynamoDB...`);
    let storageResult = null;
    try {
      storageResult = await storeQuestions(questions, {
        checkDuplicates: true,
        skipOnDuplicate: true,
        useBatch: true
      });
      console.log(`✅ DynamoDB storage complete: ${storageResult.stored} stored, ${storageResult.skipped} skipped, ${storageResult.failed} failed`);
    } catch (error) {
      console.error(`⚠️  DynamoDB storage failed: ${error.message}`);
      // Continue execution even if storage fails
      storageResult = {
        total: questions.length,
        stored: 0,
        skipped: 0,
        failed: questions.length,
        error: error.message
      };
    }

    // Save questions to file
    console.log(`⏱️  [${getElapsedTime(executionStart)}] Saving questions to file...`);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.resolve(process.cwd(), `questions-${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(questions, null, 2));

    console.log(`✔️  Wrote ${questions.length} questions to ${filePath}`);

    // Calculate execution time
    const executionEnd = Date.now();
    const executionEndISO = new Date().toISOString();
    const totalExecutionTime = executionEnd - executionStart;
    const executionTimeFormatted = formatExecutionTime(totalExecutionTime);

    // Report final statistics
    const processingStats = getProcessingStats();
    console.log('\n📊 Final Generation Report:');
    console.log('============================');
    console.log(`Total questions generated: ${questions.length}`);
    console.log(`Execution time: ${executionTimeFormatted}`);
    console.log(`OpenAI cost: $${costs.total.toFixed(4)}`);
    console.log(`Media processing cost: $${processingStats.totalCost.toFixed(4)}`);
    console.log(`Total cost: $${(costs.total + processingStats.totalCost).toFixed(4)}`);
    console.log('\nMedia Statistics:');
    console.log(`Images generated: ${processingStats.images.generated}`);
    console.log(`Images failed: ${processingStats.images.failed}`);
    console.log(`Audio generated: ${processingStats.audio.generated}`);
    console.log(`Audio failed: ${processingStats.audio.failed}`);
    console.log('\nStorage Statistics:');
    console.log(`Questions stored in DynamoDB: ${storageResult ? storageResult.stored : 0}`);
    console.log(`Questions skipped (duplicates): ${storageResult ? storageResult.skipped : 0}`);
    console.log(`Storage failures: ${storageResult ? storageResult.failed : 0}`);
    console.log('============================\n');

    // Create comprehensive execution report
    const executionReport = {
      metadata: {
        timestamp: executionEndISO,
        startTime: executionStartISO,
        endTime: executionEndISO,
        executionTimeMs: totalExecutionTime,
        executionTimeFormatted: executionTimeFormatted,
        questionsRequested: NUM_Q,
        questionsGenerated: questions.length
      },
      costs: {
        openai: {
          total: costs.total,
          details: costs
        },
        media: {
          total: processingStats.totalCost,
          images: processingStats.images.cost,
          audio: processingStats.audio.cost
        },
        grandTotal: costs.total + processingStats.totalCost
      },
      statistics: {
        media: {
          images: {
            generated: processingStats.images.generated,
            failed: processingStats.images.failed,
            successRate: processingStats.images.generated > 0 ?
              ((processingStats.images.generated / (processingStats.images.generated + processingStats.images.failed)) * 100).toFixed(1) + '%' :
              'N/A'
          },
          audio: {
            generated: processingStats.audio.generated,
            failed: processingStats.audio.failed,
            successRate: processingStats.audio.generated > 0 ?
              ((processingStats.audio.generated / (processingStats.audio.generated + processingStats.audio.failed)) * 100).toFixed(1) + '%' :
              'N/A'
          }
        }
      },
      storage: {
        dynamodb: storageResult ? {
          stored: storageResult.stored,
          skipped: storageResult.skipped,
          failed: storageResult.failed,
          total: storageResult.total,
          successRate: storageResult.total > 0 ?
            ((storageResult.stored / storageResult.total) * 100).toFixed(1) + '%' : 'N/A',
          error: storageResult.error || null
        } : {
          stored: 0,
          skipped: 0,
          failed: 0,
          total: 0,
          successRate: 'N/A',
          error: 'Storage not attempted'
        }
      },
      output: {
        questionsFile: filePath,
        reportFile: null // Will be set below
      }
    };

    // Export execution report to JSON
    const reportFilePath = path.resolve(process.cwd(), `execution-report-${timestamp}.json`);
    executionReport.output.reportFile = reportFilePath;

    console.log(`⏱️  [${getElapsedTime(executionStart)}] Exporting execution report...`);
    fs.writeFileSync(reportFilePath, JSON.stringify(executionReport, null, 2));

    console.log(`📋 Execution report exported to: ${reportFilePath}`);
    console.log(`⏰ Total execution time: ${executionTimeFormatted}\n`);

    return {
      questions,
      filePath,
      reportFilePath,
      executionReport,
      storageResult,
      stats: {
        ...processingStats,
        openaiCost: costs.total,
        totalCost: costs.total + processingStats.totalCost,
        executionTime: totalExecutionTime,
        executionTimeFormatted: executionTimeFormatted,
        storage: storageResult
      }
    };

  } catch (error) {
    console.error('❌ Error generating questions:', error.message);
    throw error;
  }
}

/**
 * Cost reporting function
 * @param {Object} executionReport - Optional execution report to include timing info
 */
function reportCosts(executionReport = null) {
  const stats = getProcessingStats();
  console.log('\n💰 Cost Report:');
  console.log('================');

  if (executionReport && executionReport.metadata) {
    console.log(`Execution time: ${executionReport.metadata.executionTimeFormatted}`);
    console.log(`Questions generated: ${executionReport.metadata.questionsGenerated}`);
    console.log('----------------');
  }

  console.log(`Images: ${stats.images.generated} generated, ${stats.images.failed} failed`);
  console.log(`Image cost: $${stats.images.cost.toFixed(4)}`);
  console.log(`Audio: ${stats.audio.generated} generated, ${stats.audio.failed} failed`);
  console.log(`Audio cost: $${stats.audio.cost.toFixed(4)}`);
  console.log(`Total media cost: $${stats.totalCost.toFixed(4)}`);

  if (executionReport && executionReport.costs) {
    console.log(`OpenAI cost: $${executionReport.costs.openai.total.toFixed(4)}`);
    console.log(`Grand total cost: $${executionReport.costs.grandTotal.toFixed(4)}`);
  }

  console.log('================\n');
}

module.exports = {
  generateGPTQuestions,
  reportCosts,
  getElapsedTime,
  formatExecutionTime
};

// Main execution when run directly
async function main() {
  try {
    const result = await generateGPTQuestions();
    reportCosts(result.executionReport);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
