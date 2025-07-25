#!/usr/bin/env node

// cli.js - Command-line interface for merging questions
const QuestionsMerger = require('./questions-merger');

/**
 * CLI for merging questions from multiple categories for a user
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
🔄 Questions Merger CLI

Usage: node cli.js <userId> <categoryId1,categoryId2,...>

Examples:
  node cli.js user123 science,history
  node cli.js user456 math,physics,chemistry
  
Options:
  --summary     Show user allocation summary only
  --help        Show this help message
`);
    process.exit(1);
  }

  const userId = args[0];

  // Check for help flag
  if (userId === '--help') {
    console.log(`
🔄 Questions Merger CLI

This tool merges questions from multiple categories for a specific user by:
1. Finding user's allocated sets in Redis (or allocating new ones)
2. Fetching question IDs from each set in DynamoDB
3. Retrieving actual questions from the questions table
4. Returning all questions from the selected categories

Usage: node cli.js <userId> <categoryId1,categoryId2,...>

Examples:
  node cli.js user123 science,history
  node cli.js user456 math,physics,chemistry
  
Options:
  --summary     Show user allocation summary only
`);
    process.exit(0);
  }

  // Check for summary flag
  if (args.includes('--summary')) {
    const merger = new QuestionsMerger();

    try {
      await merger.initialize();
      const summary = await merger.getUserAllocationSummary(userId);

      console.log(`\n📊 Allocation Summary for User: ${userId}`);
      console.log(`Total Allocations: ${summary.totalAllocations}`);
      console.log(`Categories: ${summary.categoriesCount}`);
      console.log(`Last Updated: ${summary.lastUpdated || 'Never'}`);

      if (summary.categoriesCount > 0) {
        console.log(`\nCategory Details:`);
        for (const [categoryId, info] of Object.entries(summary.categories)) {
          console.log(`  ${categoryId}: ${info.count} sets, last: ${info.lastAllocated || 'None'}`);
        }
      }

      await merger.disconnect();
    } catch (error) {
      console.error('❌ Error getting summary:', error.message);
      process.exit(1);
    }

    return;
  }

  // Parse category IDs
  const categoryIdsString = args[1];
  const categoryIds = categoryIdsString.split(',').map(id => id.trim()).filter(id => id.length > 0);

  if (categoryIds.length === 0) {
    console.error('❌ Error: No valid category IDs provided');
    process.exit(1);
  }

  console.log(`🔄 Merging questions for user: ${userId}`);
  console.log(`📂 Categories: ${categoryIds.join(', ')}`);

  const merger = new QuestionsMerger();

  try {
    // Initialize the merger
    await merger.initialize();

    // Merge questions
    const result = await merger.mergeQuestionsForUser(userId, categoryIds);

    // Display results
    console.log(`\n🎉 Merge Results:`);
    console.log(`User: ${result.userId}`);
    console.log(`Total Questions: ${result.summary.totalQuestions}`);
    console.log(`Successful Categories: ${result.summary.successfulCategories}/${result.summary.totalCategories}`);

    if (Object.keys(result.sets).length > 0) {
      console.log(`\n📦 Sets Used:`);
      for (const [categoryId, setId] of Object.entries(result.sets)) {
        console.log(`  ${categoryId}: ${setId}`);
      }
    }

    if (result.summary.categoriesWithNoSets.length > 0) {
      console.log(`\n⚠️  Categories with No Sets: ${result.summary.categoriesWithNoSets.join(', ')}`);
    }

    if (result.summary.categoriesWithErrors.length > 0) {
      console.log(`\n❌ Categories with Errors:`);
      result.summary.categoriesWithErrors.forEach(error => {
        console.log(`  ${error.categoryId}: ${error.error}`);
      });
    }

    // Option to display first few questions as sample
    if (result.questions.length > 0) {
      console.log(`\n📝 Sample Questions (first 3):`);
      result.questions.slice(0, 3).forEach((question, index) => {
        console.log(`  ${index + 1}. [${question.sourceCategory}] ${question.question || question.title || 'No title'}`);
      });

      if (result.questions.length > 3) {
        console.log(`  ... and ${result.questions.length - 3} more questions`);
      }
    }

    // Return JSON for programmatic use
    console.log(`\n📄 Full result available as JSON output`);
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('❌ Error merging questions:', error.message);
    process.exit(1);
  } finally {
    await merger.disconnect();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received interrupt signal, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received terminate signal, shutting down gracefully...');
  process.exit(0);
});

// Run the CLI
main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
