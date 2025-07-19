// test-execution-tracking.js - Test execution time tracking functionality
const { getElapsedTime, formatExecutionTime } = require('./index');

/**
 * Test function to demonstrate execution time tracking
 */
async function testExecutionTracking() {
  console.log('🧪 Testing execution time tracking functionality...\n');

  const startTime = Date.now();
  const startISO = new Date().toISOString();

  console.log(`⏰ Start time: ${startISO}`);
  console.log(`⏱️  [${getElapsedTime(startTime)}] Starting test...`);

  // Simulate some work with delays
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log(`⏱️  [${getElapsedTime(startTime)}] First task completed...`);

  await new Promise(resolve => setTimeout(resolve, 1500));
  console.log(`⏱️  [${getElapsedTime(startTime)}] Second task completed...`);

  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log(`⏱️  [${getElapsedTime(startTime)}] Third task completed...`);

  const endTime = Date.now();
  const endISO = new Date().toISOString();
  const totalTime = endTime - startTime;

  console.log(`⏰ End time: ${endISO}`);
  console.log(`⏱️  Total execution time: ${formatExecutionTime(totalTime)}`);

  // Test different time formats
  console.log('\n🧪 Testing time formatting:');
  console.log(`1.5 seconds: ${formatExecutionTime(1500)}`);
  console.log(`90 seconds: ${formatExecutionTime(90000)}`);
  console.log(`3665 seconds (1h 1m 5s): ${formatExecutionTime(3665000)}`);
  console.log(`7320 seconds (2h 2m): ${formatExecutionTime(7320000)}`);

  // Create a mock execution report
  const mockReport = {
    metadata: {
      timestamp: endISO,
      startTime: startISO,
      endTime: endISO,
      executionTimeMs: totalTime,
      executionTimeFormatted: formatExecutionTime(totalTime),
      questionsRequested: 10,
      questionsGenerated: 8
    },
    costs: {
      openai: { total: 0.1234 },
      media: { total: 0.0456 },
      grandTotal: 0.1690
    },
    statistics: {
      media: {
        images: {
          generated: 3,
          failed: 1,
          successRate: '75.0%'
        },
        audio: {
          generated: 2,
          failed: 0,
          successRate: '100.0%'
        }
      }
    },
    output: {
      questionsFile: '/path/to/questions.json',
      reportFile: '/path/to/execution-report.json'
    }
  };

  console.log('\n📋 Mock execution report structure:');
  console.log(JSON.stringify(mockReport, null, 2));

  console.log('\n✅ Execution time tracking test completed successfully!');
}

// Run the test
if (require.main === module) {
  testExecutionTracking().catch(console.error);
}

module.exports = { testExecutionTracking };
