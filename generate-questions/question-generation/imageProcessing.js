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

// Initialize OpenAI with API key
if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Constants for DALL-E costs
const COST_PER_IMAGE = 0.04; // $0.04 for 1024x1024 standard quality

/**
 * Generate an AI prompt based on the question context
 * @param {Object} question - The question object
 * @returns {string} The generated prompt
 */
function generatePrompt(question) {
  // Extract and validate required fields
  const { title, question: questionText, 'correct-answer': answer } = question;

  // Context patterns for Arabic text with expanded patterns
  const contextPatterns = {
    geographical: /موقع|خريطة|مدينة|دولة|منطقة|مكان|أين|اين|محافظة|عاصمة|شمال|جنوب|شرق|غرب|بلد|قارة|جبل|نهر|بحر|محيط/,
    scientific: /عينة|خلية|كائن|مجهر|هيكل|لاحظ|يلاحظ|تشريح|جسم|علمي|بكتيريا|فيروس|خلايا|نبات|حيوان|ظاهرة|تفاعل/,
    comparative: /فرق|مقارنة|مقابل|أنواع|انواع|نوع|يختلف|يتشابه|تشابه|اختلاف|ميز|قارن|حدد/,
    process: /خطوة|عملية|دورة|كيف|يعمل|وظيفة|مراحل|تطور|تحول|تغير|يتحول|يتطور|تسلسل/,
    historical: /قديم|تاريخ|فترة|عصر|قرن|متى|حضارة|عهد|زمن|ملك|خليفة|سلطان|معركة|حرب|فتح/,
    architectural: /عمارة|بناء|قصر|مسجد|قلعة|برج|منارة|قبة|زخرفة|طراز|تصميم/,
    cultural: /تراث|فن|حرفة|صناعة|ملابس|طعام|موسيقى|رقص|احتفال|عادات|تقاليد/,
    personality: /شخصية|عالم|قائد|شاعر|أديب|فنان|مفكر|فيلسوف|مخترع|مكتشف/
  };

  // Determine question type based on patterns
  const matchedTypes = Object.entries(contextPatterns)
    .filter(([, pattern]) => pattern.test(questionText) || pattern.test(title))
    .map(([type]) => type);

  const questionType = matchedTypes[0] || 'general';

  // Define category-specific context generators
  const contextGenerators = {
    geographical: (answer) => `Create a map or geographical scene that includes ${answer} along with 3-4 similar locations of the same type. Show all locations with equal prominence, varying architectural styles and features. Include relevant geographical elements like mountains, rivers, or coast lines if applicable.`,

    scientific: (answer) => `Create a detailed scientific illustration showing ${answer} alongside 3-4 related but visually distinct specimens/examples. Include relevant environmental or contextual elements. Show all specimens with equal detail and prominence.`,

    comparative: (answer) => `Present a balanced composition showing ${answer} and 3-4 similar items from the same category. Ensure all items are depicted with equal detail and prominence. Include relevant environmental context.`,

    process: (answer) => `Illustrate a comprehensive view of the system or process related to ${answer}, showing multiple possible stages or variations. Include relevant environmental and contextual elements without highlighting any specific step.`,

    historical: (answer) => `Create a detailed historical scene from the era of ${answer}, showing multiple historical elements, artifacts, and architectural styles from that period. Include contextual elements that represent the broader historical context.`,

    architectural: (answer) => `Create an architectural scene that includes ${answer} among several similar structures of the same period/style. Show multiple architectural elements and details common to that era. Include environmental context.`,

    cultural: (answer) => `Present a rich cultural scene that includes ${answer} along with related cultural elements and practices. Show multiple participants or examples with equal prominence. Include relevant environmental context.`,

    personality: (answer) => `Create a scene representing the era, field, or context of ${answer} without showing specific individuals. Include relevant artifacts, tools, settings, and cultural elements of their time period or domain.`,

    general: (answer) => `Create a comprehensive educational scene related to ${answer}, showing multiple related elements and examples with equal prominence. Include relevant contextual details and environmental elements.`
  };

  // Build the prompt with smart misdirection
  const promptComponents = [
    // Base style and context
    'Create a high-quality educational illustration suitable for an Arabic language context.',
    'The image must be culturally appropriate and regionally relevant.',
    'Absolutely no text, labels, or numbers in the image.',

    // Question-specific context with smart use of the answer
    contextGenerators[questionType](answer),

    // Critical requirements
    'Critical requirements:',
    '- Show multiple equally prominent examples to avoid revealing the answer',
    '- Maintain consistent quality and detail across all elements',
    '- Use historically and culturally accurate details',
    '- Create a balanced, professional composition',
    '- Ensure all elements are clearly visible and well-defined',

    // Educational context
    'The image will be used in an educational testing context,',
    'so it must provide clear visual information while maintaining neutrality.'
  ];

  return promptComponents.join(' ');
}

/**
 * Generate an image using DALL-E
 * @param {Object} question - The question object
 * @returns {Promise<string>} Base64 encoded image
 */
async function generateImage(question) {
  const prompt = generatePrompt(question);
  console.log('\nGenerated prompt:', prompt);

  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1024x1024",
    quality: "standard",
    response_format: "b64_json"
  });

  return {
    'image-type': 'base64',
    'image-data': `data:image/png;base64,${response.data[0].b64_json}`
  };
}

module.exports = {
  generateImage
};
