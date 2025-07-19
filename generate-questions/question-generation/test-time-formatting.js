// test-time-formatting.js - Test edge cases for time formatting
const { formatExecutionTime } = require('./index');

/**
 * Test time formatting edge cases
 */
function testTimeFormatting() {
  console.log('🧪 Testing time formatting edge cases...\n');

  const testCases = [
    { ms: 0, description: 'Zero time' },
    { ms: 500, description: 'Less than 1 second' },
    { ms: 1000, description: 'Exactly 1 second' },
    { ms: 59000, description: '59 seconds' },
    { ms: 60000, description: 'Exactly 1 minute' },
    { ms: 61000, description: '1 minute 1 second' },
    { ms: 3599000, description: '59 minutes 59 seconds' },
    { ms: 3600000, description: 'Exactly 1 hour' },
    { ms: 3661000, description: '1 hour 1 minute 1 second' },
    { ms: 7200000, description: 'Exactly 2 hours' },
    { ms: 7323000, description: '2 hours 2 minutes 3 seconds' },
    { ms: 86400000, description: '24 hours (1 day)' }
  ];

  testCases.forEach(({ ms, description }) => {
    const formatted = formatExecutionTime(ms);
    console.log(`${ms.toString().padStart(8)} ms (${description.padEnd(25)}) → ${formatted}`);
  });

  console.log('\n✅ Time formatting tests completed!');
}

// Run if called directly
if (require.main === module) {
  testTimeFormatting();
}

module.exports = { testTimeFormatting };
