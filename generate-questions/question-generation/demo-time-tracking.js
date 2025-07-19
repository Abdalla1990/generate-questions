// demo-time-tracking.js - Quick demo of the time tracking in action
const { getElapsedTime, formatExecutionTime } = require('./index');

async function quickDemo() {
  console.log('🎭 Quick Demo: Time Tracking in Action\n');

  const startTime = Date.now();
  console.log(`🚀 Starting demo process...`);
  console.log(`⏰ Start time: ${new Date().toISOString()}`);

  console.log(`⏱️  [${getElapsedTime(startTime)}] Initializing system...`);
  await new Promise(r => setTimeout(r, 800));

  console.log(`⏱️  [${getElapsedTime(startTime)}] Connecting to APIs...`);
  await new Promise(r => setTimeout(r, 1200));

  console.log(`⏱️  [${getElapsedTime(startTime)}] Processing data...`);
  await new Promise(r => setTimeout(r, 900));

  console.log(`⏱️  [${getElapsedTime(startTime)}] Generating content...`);
  await new Promise(r => setTimeout(r, 1500));

  console.log(`⏱️  [${getElapsedTime(startTime)}] Validating results...`);
  await new Promise(r => setTimeout(r, 600));

  console.log(`⏱️  [${getElapsedTime(startTime)}] Saving files...`);
  await new Promise(r => setTimeout(r, 400));

  const totalTime = Date.now() - startTime;
  console.log(`⏰ Demo completed in: ${formatExecutionTime(totalTime)}`);

  console.log('\n📊 This is what you\'ll see during actual question generation!');
  console.log('✅ Demo completed successfully');
}

if (require.main === module) {
  quickDemo().catch(console.error);
}
