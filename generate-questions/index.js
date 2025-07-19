// Load environment variables from .env file
// Check for different environment files in priority order: .env.dev, .env
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env.dev');
const fallbackEnvPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log('🔧 Loaded development environment from .env.dev');
} else if (fs.existsSync(fallbackEnvPath)) {
  require('dotenv').config({ path: fallbackEnvPath });
  console.log('📦 Loaded environment from .env');
} else {
  console.log('⚠️  No .env file found. Please create .env or .env.dev with your API keys.');
}

const { generateGPTQuestions } = require("./question-generation");

function GenerateQuestionsPage() {
  return new Promise(async (resolve, reject) => {
    try {
      await generateGPTQuestions();
      resolve("Questions generated successfully!");
    } catch (error) {
      console.error('Error generating questions:', error);
      reject(error);
    }
  });
}

if (typeof window === 'undefined') {
  // Node.js environment
  GenerateQuestionsPage().then((message) => {
    console.log(message);
    process.exit(0);
  }).catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}

