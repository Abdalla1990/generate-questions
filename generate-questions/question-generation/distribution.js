// distribution.js - Distribution analysis and reporting
const { CATEGORIES, getEnabledQuestionTypes } = require('./config');

/**
 * Analyze and report question type distribution
 * @param {Array} questions - Array of questions to analyze
 * @returns {Object} Distribution analysis results
 */
function analyzeQuestionTypeDistribution(questions) {
  const enabledTypes = getEnabledQuestionTypes();
  const typeCount = {};
  questions.forEach(q => {
    typeCount[q['question-type']] = (typeCount[q['question-type']] || 0) + 1;
  });

  // Calculate expected count per type (only for enabled types)
  const expectedCountPerType = Math.floor(questions.length / enabledTypes.length);
  const maxDeviation = 1;

  console.log('\nQuestion Type Distribution Analysis:');
  console.log('----------------------------------');
  let distributionErrors = [];
  let hasMultipleChoiceExcess = false;
  let hasMissingTypes = false;

  enabledTypes.forEach(type => {
    const count = typeCount[type] || 0;
    const deviation = Math.abs(count - expectedCountPerType);
    const distribution = (count / questions.length * 100).toFixed(1);

    console.log(`${type}:`);
    console.log(`  Count: ${count} questions`);
    console.log(`  Expected: ${expectedCountPerType} ±${maxDeviation}`);
    console.log(`  Distribution: ${distribution}%`);
    console.log(`  Deviation: ${deviation}\n`);

    if (count === 0) {
      hasMissingTypes = true;
      distributionErrors.push(`${type} has no questions (minimum 1 required)`);
    } else if (deviation > maxDeviation) {
      distributionErrors.push(
        `${type} has ${count} questions (expected ${expectedCountPerType}±${maxDeviation})`
      );
    }

    if (type === 'multiple-choice' && count > expectedCountPerType + maxDeviation) {
      hasMultipleChoiceExcess = true;
    }
  });

  // Check for disabled types that were generated
  const disabledTypesFound = Object.keys(typeCount).filter(type => !enabledTypes.includes(type));
  if (disabledTypesFound.length > 0) {
    console.error('\n⚠️  Found questions with disabled types:');
    disabledTypesFound.forEach(type => {
      console.error(`  ${type}: ${typeCount[type]} questions (this type is disabled)`);
    });
    distributionErrors.push(`Disabled question types found: ${disabledTypesFound.join(', ')}`);
  }

  if (distributionErrors.length > 0 || hasMissingTypes || hasMultipleChoiceExcess) {
    console.error('\n❌ Question type distribution issues detected:');
    if (hasMissingTypes) {
      console.error('  Some enabled question types are missing (should have at least one of each enabled type)');
    }
    if (hasMultipleChoiceExcess) {
      console.error('  Too many multiple-choice questions');
    }
    distributionErrors.forEach(err => console.error(`  ${err}`));
    console.error('\nExpected distribution:');
    console.error(`  ${expectedCountPerType}±${maxDeviation} questions per enabled type`);
    console.error(`  Enabled types: ${enabledTypes.join(', ')}`);
    console.error('Note: Questions will still be saved, but please review distribution for future runs.\n');
  }

  return {
    typeCount,
    expectedCountPerType,
    distributionErrors,
    hasIssues: distributionErrors.length > 0 || hasMissingTypes || hasMultipleChoiceExcess,
    enabledTypes,
    disabledTypesFound
  };
}

/**
 * Analyze and report category distribution
 * @param {Array} questions - Array of questions to analyze
 * @returns {Object} Category distribution analysis results
 */
function analyzeCategoryDistribution(questions) {
  const categoryCount = {};
  questions.forEach(q => {
    categoryCount[q.categoryId] = (categoryCount[q.categoryId] || 0) + 1;
  });

  // Calculate expected count per category
  const expectedCountPerCategory = Math.floor(questions.length / CATEGORIES.length);
  const maxCategoryDeviation = 1;

  console.log('\nCategory Distribution Analysis:');
  console.log('--------------------------------');
  let categoryDistributionErrors = [];

  CATEGORIES.forEach(cat => {
    const count = categoryCount[cat.id] || 0;
    const deviation = Math.abs(count - expectedCountPerCategory);
    const distribution = (count / questions.length * 100).toFixed(1);

    console.log(`${cat.name} (${cat.id}):`);
    console.log(`  Count: ${count} questions`);
    console.log(`  Expected: ${expectedCountPerCategory} ±${maxCategoryDeviation}`);
    console.log(`  Distribution: ${distribution}%`);
    console.log(`  Deviation: ${deviation}\n`);

    if (count === 0) {
      categoryDistributionErrors.push(`${cat.name} has no questions (minimum 1 required)`);
    } else if (deviation > maxCategoryDeviation) {
      categoryDistributionErrors.push(
        `${cat.name} has ${count} questions (expected ${expectedCountPerCategory}±${maxCategoryDeviation})`
      );
    }
  });

  if (categoryDistributionErrors.length > 0) {
    console.error('\n❌ Category distribution issues detected:');
    categoryDistributionErrors.forEach(err => console.error(`  ${err}`));
    console.error('\nExpected distribution:');
    console.error(`  ${expectedCountPerCategory}±${maxCategoryDeviation} questions per category`);
    console.error('Note: Questions will still be saved, but please review distribution for future runs.\n');
  }

  return {
    categoryCount,
    expectedCountPerCategory,
    distributionErrors: categoryDistributionErrors,
    hasIssues: categoryDistributionErrors.length > 0
  };
}

module.exports = {
  analyzeQuestionTypeDistribution,
  analyzeCategoryDistribution
};
