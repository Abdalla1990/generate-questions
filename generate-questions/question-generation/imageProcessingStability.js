// Load environment variables from .env file
// Check for different environment files in priority order: .env.dev, .env
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.dev');
const fallbackEnvPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else if (fs.existsSync(fallbackEnvPath)) {
  require('dotenv').config({ path: fallbackEnvPath });
}

const { OpenAI } = require('openai');

// Initialize Stability API settings
if (!process.env.STABILITY_API_KEY) {
  console.error('Error: STABILITY_API_KEY environment variable is required');
  process.exit(1);
}

const STABILITY_API_BASE = 'https://api.stability.ai';
const STABILITY_API_KEY = process.env.STABILITY_API_KEY;

// Initialize OpenAI for translation
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Constants for costs
const COST_PER_IMAGE = 0.02; // $0.02 per image with SDXL

// Cost tracking
let totalCostUSD = 0;
let imagesGenerated = 0;

/**
 * Translate Arabic text to English using OpenAI
 * @param {string} arabicText - The Arabic text to translate
 * @returns {Promise<string>} The English translation
 */
async function translateToEnglish(arabicText) {
  if (!openai) {
    console.warn('OpenAI API key not found, using original text for image generation');
    return arabicText;
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a translator. Translate the given Arabic text to English. Return only the translation, no explanations.'
        },
        {
          role: 'user',
          content: arabicText
        }
      ],
      temperature: 0.1,
      max_tokens: 100
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.warn('Translation failed, using original text:', error.message);
    return arabicText;
  }
}

/**
 * Generate an AI prompt based on the question context
 * @param {Object} question - The question object
 * @param {string} translatedAnswer - The English translation of the answer
 * @param {string} translatedQuestion - The English translation of the question (optional)
 * @returns {string} The generated prompt
 */
function generatePrompt(question, translatedAnswer, translatedQuestion = null) {
  const imageContext = question['image-context'];

  // Use translated question for additional context if available
  const contextHint = translatedQuestion ? ` Related to: ${translatedQuestion}` : '';

  if (imageContext === 'arabic-calligraphy') {
    return {
      text: `Create a high-resolution image of traditional Arabic calligraphy in the style of ${translatedAnswer}. Focus on authentic brush strokes and composition typical of this calligraphy style. No text labels, signatures, or watermarks.${contextHint}`,
      stylePreset: 'photographic',
      cfg_scale: 7,
      steps: 50,
      samples: 1
    };
  }
  if (imageContext === 'plant') {
    return {
      text: `Create a natural, detailed photograph of ${translatedAnswer}. Show it in its typical growing environment with natural lighting. Capture distinctive features of this specific plant. No text, labels, or scientific markers.${contextHint}`,
      stylePreset: 'photographic',
      cfg_scale: 7,
      steps: 50,
      samples: 1
    };
  }
  if (imageContext === 'country') {
    return {
      text: `Create a world map or regional map with ${translatedAnswer} highlighted or outlined in a distinct color (red, yellow, or bright blue). Show the country's borders clearly distinguished from neighboring countries. Use a clean, educational map style with no country names, labels, or text. The highlighted country should be the focal point.${contextHint}`,
      stylePreset: 'photographic',
      cfg_scale: 7,
      steps: 50,
      samples: 1
    };
  }
  // fallback for legacy or unsupported contexts
  return {
    text: `Create a clear, professional photograph of ${translatedAnswer}. No text, labels, or markers.${contextHint}`,
    stylePreset: 'photographic',
    cfg_scale: 7,
    steps: 50,
    samples: 1
  };
}

/**
 * Generate an image using Stability AI
 * @param {Object} question - The question object
 * @returns {Promise<Object>} Image data object
 */
async function generateImage(question) {
  // Only process image-type questions with allowed contexts
  const allowedContexts = ['arabic-calligraphy', 'plant', 'country'];
  if (question['question-type'] !== 'image' || !allowedContexts.includes(question['image-context'])) {
    console.error('Unsupported image context or question type:', question['image-context']);
    return {
      'image-type': 'placeholder',
      'image-data': question['image-hint'] || 'Unsupported image context.'
    };
  }

  // Translate both answer and question to English for better Stability AI prompts
  const translatedAnswer = await translateToEnglish(question.answer);
  const translatedQuestion = await translateToEnglish(question.question);
  console.log(`\nTranslated answer: "${question.answer}" -> "${translatedAnswer}"`);
  console.log(`Translated question: "${question.question}" -> "${translatedQuestion}"`);

  const promptConfig = generatePrompt(question, translatedAnswer, translatedQuestion);
  console.log('\nGenerated prompt:', promptConfig.text);

  const requestPayload = {
    text_prompts: [{ text: promptConfig.text, weight: 1 }],
    cfg_scale: promptConfig.cfg_scale,
    height: 1024,
    width: 1024,
    samples: promptConfig.samples,
    steps: promptConfig.steps,
    style_preset: promptConfig.stylePreset
  };

  console.log('\nRequest payload:', JSON.stringify(requestPayload, null, 2));

  try {
    const response = await fetch(
      `${STABILITY_API_BASE}/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${STABILITY_API_KEY}`,
        },
        body: JSON.stringify(requestPayload),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Stability API error (${response.status}): ${errorData.message || response.statusText}`);
    }

    const result = await response.json();
    const base64Image = result.artifacts[0].base64;

    // Track costs
    imagesGenerated++;
    totalCostUSD += COST_PER_IMAGE;

    return {
      'image-type': 'base64',
      'image-data': `data:image/png;base64,${base64Image}`
    };

  } catch (error) {
    console.error('Error generating image:', error.message);
    return {
      'image-type': 'placeholder',
      'image-data': question['image-hint']
    };
  }
}

// Add cost reporting function
function reportCosts() {
  console.log('\nStability AI Cost Report:');
  console.log(`Images generated: ${imagesGenerated}`);
  console.log(`Total cost: $${totalCostUSD.toFixed(2)} USD`);
}

/**
 * Process a questions file
 * @param {string} inputFile - Path to input JSON file
 * @param {string} outputFile - Path to output JSON file
 */
async function processQuestionsFile(inputFile, outputFile) {
  try {
    // Read and parse input file
    console.log('Reading questions file:', inputFile);
    const allQuestions = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

    // Filter only image-type questions
    const imageQuestions = allQuestions.filter(q => q['question-type'] === 'image');
    console.log(`Found ${imageQuestions.length} image questions to process`);

    if (imageQuestions.length === 0) {
      console.log('No image questions found in the file.');
      return;
    }

    // Initialize tracking
    let processedCount = 0;
    const results = new Map();

    // Process each image question
    for (const question of imageQuestions) {
      try {
        console.log(`\nProcessing question: ${question.title || question.question}`);
        const imageData = await generateImage(question);

        results.set(question.id, {
          ...question,
          ...imageData,
          'original-image-hint': question['image-hint']
        });

        processedCount++;
        console.log('✓ Image generated successfully');
      } catch (error) {
        console.error(`✗ Failed to process question:`, error.message);
        results.set(question.id, question); // Keep original question on error
      }
    }

    // Combine processed questions with non-image questions
    const outputQuestions = allQuestions.map(q =>
      q['question-type'] === 'image' ? results.get(q.id) : q
    );

    // Save results
    fs.writeFileSync(outputFile, JSON.stringify(outputQuestions, null, 2));

    // Print statistics
    console.log('\nProcessing Statistics:');
    console.log('------------------');
    console.log(`Total image questions: ${imageQuestions.length}`);
    console.log(`Successfully processed: ${processedCount}`);
    console.log(`Failed to process: ${imageQuestions.length - processedCount}`);
    console.log(`Total cost: $${(totalCostUSD).toFixed(2)}`);
    console.log('Done!');

  } catch (error) {
    console.error('Error processing file:', error);
    throw error;
  }
}

// Test single image generation
async function testSingleImage(title, correctAnswer) {
  console.log('Testing single image generation:');
  console.log('Title:', title);
  console.log('Correct Answer:', correctAnswer);

  // Infer image-context from title or correctAnswer
  let imageContext = 'plant'; // default
  if (/خط|ديواني|نسخ|رقعة|ثلث|كوفي|فارسي|تعليق|جلي/.test(title) || /خط|ديواني|نسخ|رقعة|ثلث|كوفي|فارسي|تعليق|جلي/.test(correctAnswer)) {
    imageContext = 'arabic-calligraphy';
  } else if (/دولة|بلد|مدينة|عاصمة|خريطة|موقع|جغرافيا/.test(title) || /دولة|بلد|مدينة|عاصمة|خريطة|موقع|جغرافيا/.test(correctAnswer)) {
    imageContext = 'country';
  } else if (/نبات|شجرة|فاكهة|خضار|زهرة|ورقة|ثمرة/.test(title) || /نبات|شجرة|فاكهة|خضار|زهرة|ورقة|ثمرة/.test(correctAnswer)) {
    imageContext = 'plant';
  }

  const testQuestion = {
    id: 'test-1',
    question: title,
    answer: correctAnswer,
    title,
    'correct-answer': correctAnswer,
    'question-type': 'image',
    'image-hint': 'Test image',
    'image-context': imageContext
  };

  try {
    const imageData = await generateImage(testQuestion);
    if (imageData['image-type'] === 'base64') {
      // Save the generated image to a file
      const imageBuffer = Buffer.from(
        imageData['image-data'].replace('data:image/png;base64,', ''),
        'base64'
      );
      const outputPath = path.join(process.cwd(), 'test-output.png');
      fs.writeFileSync(outputPath, imageBuffer);
      console.log('✓ Image generated successfully and saved to:', outputPath);
    } else {
      console.log('✗ Failed to generate image');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Report costs
  reportCosts();
}

// Run if called directly
if (require.main === module) {
  const [, , command, ...args] = process.argv;

  if (command === 'test') {
    // Usage: node imageProcessingStability.js test "question title" "correct answer"
    const [title, correctAnswer] = args;
    if (!title || !correctAnswer) {
      console.error('Usage: node imageProcessingStability.js test "question title" "correct answer"');
      process.exit(1);
    }
    testSingleImage(title, correctAnswer).catch(console.error);
  } else {
    // Original file processing logic
    const [inputFile, outputFile] = args;
    if (!inputFile || !outputFile) {
      console.error('Usage:');
      console.error('  Process file: node imageProcessingStability.js process <input-file> <output-file>');
      console.error('  Test single: node imageProcessingStability.js test "question title" "correct answer"');
      process.exit(1);
    }
    processQuestionsFile(inputFile, outputFile).catch(console.error);
  }
}

module.exports = {
  generateImage,
  reportCosts,
  processQuestionsFile,
  testSingleImage
};
