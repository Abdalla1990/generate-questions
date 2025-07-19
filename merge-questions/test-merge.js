// test-merge.js - Test the merge functionality with sample data
const fs = require('fs');
const path = require('path');
const { mergeQuestionFiles, generateQuestionHash, normalizeQuestion } = require('./merge-questions');

/**
 * Create test data for validation
 */
function createTestData() {
  const testDir = path.join(__dirname, 'test-data');

  // Clean up and create test directory
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  fs.mkdirSync(testDir);

  // Test file 1: Standard questions
  const testFile1 = [
    {
      "id": "q1",
      "categoryId": "cat1",
      "points": 300,
      "title": "متى وقعت معركة القادسية؟",
      "question-type": "multiple-choice",
      "choices": ["سنة 13 هجرية", "سنة 15 هجرية", "سنة 17 هجرية", "سنة 19 هجرية"],
      "correct-answer-index": 2
    },
    {
      "id": "q2",
      "categoryId": "cat2",
      "points": 500,
      "title": "حدد النطاق الصحيح لمساحة الجزائر",
      "question-type": "range",
      "min-value": 2000000,
      "max-value": 3000000,
      "correct-answer": 2381741,
      "range": 50000,
      "unit": "كم²"
    }
  ];

  // Test file 2: Duplicate and legacy format
  const testFile2 = [
    {
      "id": "q1_duplicate",
      "categoryId": "cat1",
      "points": 300,
      "title": "متى وقعت معركة القادسية؟", // Same as file 1
      "question-type": "multiple-choice",
      "choices": ["سنة 13 هجرية", "سنة 15 هجرية", "سنة 17 هجرية", "سنة 19 هجرية"],
      "correct-answer-idx": 2 // Legacy field name
    },
    {
      "id": "q3",
      "categoryId": "cat3",
      "points": 100,
      "title": "ما هي عاصمة مصر؟",
      "question-type": "multiple-choice",
      "choices": ["القاهرة", "الإسكندرية", "الغردقة", "شرم الشيخ"],
      "correct-answer-index": 0
    }
  ];

  // Test file 3: Image question
  const testFile3 = [
    {
      "id": "q4",
      "categoryId": "cat4",
      "points": 400,
      "title": "ما هذا النبات؟",
      "question-type": "image",
      "choices": ["زيتون", "تين", "عنب", "تفاح"],
      "correct-answer-index": 0,
      "imageUrl": "/images/plant1.jpg",
      "image-context": "plant"
    }
  ];

  // Write test files
  fs.writeFileSync(path.join(testDir, 'questions-test1.json'), JSON.stringify(testFile1, null, 2));
  fs.writeFileSync(path.join(testDir, 'questions-test2.json'), JSON.stringify(testFile2, null, 2));
  fs.writeFileSync(path.join(testDir, 'questions-test3.json'), JSON.stringify(testFile3, null, 2));

  return testDir;
}

/**
 * Test the hash generation function
 */
function testHashGeneration() {
  console.log('🧪 Testing question hash generation...\n');

  const testQuestions = [
    {
      title: "متى وقعت معركة القادسية؟",
      "question-type": "multiple-choice",
      choices: ["أ", "ب", "ج", "د"]
    },
    {
      title: "حدد النطاق الصحيح",
      "question-type": "range",
      "min-value": 1000,
      "max-value": 2000,
      unit: "كم"
    }
  ];

  testQuestions.forEach((q, i) => {
    const hash = generateQuestionHash(q);
    console.log(`Question ${i + 1}: ${q.title.substring(0, 30)}...`);
    console.log(`Hash: ${hash}\n`);
  });
}

/**
 * Test question normalization
 */
function testNormalization() {
  console.log('🔧 Testing question normalization...\n');

  const legacyQuestion = {
    "id": "legacy1",
    "categoryId": "cat1",
    "points": 300,
    "title": "Legacy question?",
    "question-type": "multiple-choice",
    "choices": ["A", "B", "C", "D"],
    "correct-answer-idx": 1, // Legacy field
    "extra-field": "should be ignored"
  };

  console.log('Original question:');
  console.log(JSON.stringify(legacyQuestion, null, 2));

  const normalized = normalizeQuestion(legacyQuestion, 'test.json');

  console.log('\nNormalized question:');
  console.log(JSON.stringify(normalized, null, 2));
}

/**
 * Run full merge test
 */
async function runMergeTest() {
  console.log('🧪 Running full merge test...\n');

  // Create test data
  const testDir = createTestData();
  console.log(`📁 Created test data in: ${testDir}`);

  try {
    // Run merge
    const outputFile = path.join(testDir, 'merged-test-output.json');
    const result = await mergeQuestionFiles(testDir, outputFile);

    console.log('\n✅ Merge test completed successfully!');
    console.log('Result:', result.stats);

    // Verify output
    if (fs.existsSync(outputFile)) {
      const mergedData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      console.log(`\n📊 Output verification:`);
      console.log(`- Questions in merged file: ${mergedData.length}`);
      console.log(`- Expected unique questions: 4 (1 duplicate should be removed)`);

      if (mergedData.length === 4) {
        console.log('✅ Correct number of questions after deduplication');
      } else {
        console.log('❌ Unexpected number of questions');
      }

      // Check for legacy field mapping
      const hasCorrectAnswerIndex = mergedData.some(q =>
        q['question-type'] === 'multiple-choice' &&
        q.hasOwnProperty('correct-answer-index') &&
        !q.hasOwnProperty('correct-answer-idx')
      );

      if (hasCorrectAnswerIndex) {
        console.log('✅ Legacy field mapping worked correctly');
      } else {
        console.log('❌ Legacy field mapping failed');
      }
    }

  } catch (error) {
    console.error('❌ Merge test failed:', error.message);
  } finally {
    // Clean up test data
    fs.rmSync(testDir, { recursive: true });
    console.log('\n🧹 Cleaned up test data');
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('🚀 Question Merge Tool - Test Suite');
  console.log('=====================================\n');

  try {
    testHashGeneration();
    testNormalization();
    await runMergeTest();

    console.log('\n🎉 All tests completed!');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  main();
}
