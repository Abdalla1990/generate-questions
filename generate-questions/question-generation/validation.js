// validation.js - Question validation logic
const { CATEGORIES, questionTypeMapping } = require('./config');

/**
 * Validate questions for proper structure, content, and distribution
 * @param {Array} questions - Array of questions to validate
 * @returns {Object} Validation results and filtered questions
 */
function validateQuestions(questions) {
  console.log('\nValidation Summary:');
  console.log('------------------');

  // Convert points to numbers in all questions
  questions.forEach(q => {
    q.points = Number(q.points);
  });

  // Validate point values
  const validPoints = [100, 300, 500];
  const invalidPointQuestions = questions.filter(q => !validPoints.includes(q.points));
  if (invalidPointQuestions.length > 0) {
    console.log('⚠️  Filtering questions with invalid point values:');
    invalidPointQuestions.forEach(q => {
      console.log(`  Question "${q.title}" has invalid points: ${q.points} (${typeof q.points})`);
    });
  }

  // Filter out questions with invalid points
  questions = questions.filter(q => validPoints.includes(q.points));

  // Validate categories
  const validCategoryIds = CATEGORIES.map(c => c.id);
  const invalidCategoryQuestions = questions.filter(q => !validCategoryIds.includes(q.categoryId));
  if (invalidCategoryQuestions.length > 0) {
    console.log('⚠️  Filtering questions with invalid category IDs:');
    invalidCategoryQuestions.forEach(q => {
      console.log(`  Question "${q.title}" has invalid categoryId: ${q.categoryId}`);
    });
  }

  // Filter out questions with invalid categories
  questions = questions.filter(q => validCategoryIds.includes(q.categoryId));

  // Check for Arabic content (basic check)
  const arabicRegex = /[\u0600-\u06FF]/; // Basic Arabic script range
  const nonArabicQuestions = questions.filter(q => !arabicRegex.test(q.title));
  if (nonArabicQuestions.length > 0) {
    console.log('⚠️  Filtering questions without Arabic content:');
    nonArabicQuestions.forEach(q => {
      console.log(`  Question with id ${q.id} does not contain Arabic text`);
    });
  }

  // Filter out non-Arabic questions
  questions = questions.filter(q => arabicRegex.test(q.title));

  // Filter out empty or invalid questions
  questions = questions.filter(q =>
    q && typeof q === 'object' &&
    q.id &&
    q.categoryId &&
    q.title &&
    q['question-type'] &&
    // For image questions, require either a successful image generation or an image-hint
    (q['question-type'] !== 'image' || (q.image || q['image-hint']))
  );

  // Print summary of filtered questions
  const totalFiltered = invalidPointQuestions.length + invalidCategoryQuestions.length + nonArabicQuestions.length;
  if (totalFiltered > 0) {
    console.log('\nFiltering Summary:');
    console.log(`  Points validation: ${invalidPointQuestions.length} questions removed`);
    console.log(`  Category validation: ${invalidCategoryQuestions.length} questions removed`);
    console.log(`  Arabic content validation: ${nonArabicQuestions.length} questions removed`);
    console.log(`  Total questions remaining: ${questions.length}`);
    console.log('------------------\n');
  }

  return {
    validatedQuestions: questions,
    filterStats: {
      invalidPoints: invalidPointQuestions.length,
      invalidCategories: invalidCategoryQuestions.length,
      nonArabic: nonArabicQuestions.length,
      totalFiltered
    }
  };
}

module.exports = {
  validateQuestions
};
