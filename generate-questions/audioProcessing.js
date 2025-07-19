const { OpenAI } = require('openai');

// Initialize OpenAI with API key
if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Generate an AI prompt based on the question context
 * @param {Object} question - The question object
 * @returns {string} The generated prompt
 */
function generatePrompt(question) {
  // Extract title for pattern matching
  const { title } = question;

  // Context patterns for Arabic audio
  const contextPatterns = {
    recitation: /قرآن|تلاوة|قارئ|سورة|آية/,
    poetry: /شعر|قصيدة|بيت|شاعر|أبيات/,
    music: /مقام|موسيقى|لحن|غناء|أغنية|عزف/,
    nature: /طائر|حيوان|صوت|ظاهرة|طبيعة/,
    dialect: /لهجة|عامية|محكية|منطقة|لكنة/,
    speech: /خطاب|كلمة|خطبة|حديث|محاضرة/
  };

  // Determine audio type based on patterns
  const matchedTypes = Object.entries(contextPatterns)
    .filter(([, pattern]) => pattern.test(title))
    .map(([type]) => type);

  const audioType = matchedTypes[0] || 'general';

  // Define type-specific voice models
  const voiceModels = {
    recitation: 'alloy', // Neutral, clear voice for Quranic content
    poetry: 'echo',      // Expressive voice for poetry
    music: 'shimmer',    // Musical voice for maqam questions
    nature: 'fable',     // Natural voice for animal sounds
    dialect: 'nova',     // Regional voice for dialect questions
    speech: 'onyx',      // Formal voice for speeches
    general: 'alloy'     // Default voice
  };

  return {
    model: voiceModels[audioType],
    voice: voiceModels[audioType],
    input: generateTextForVoice(question, audioType)
  };
}

/**
 * Generate appropriate text for voice conversion
 * @param {Object} question - The question object
 * @param {string} type - The audio type
 * @returns {string} Text to be converted to speech
 */
function generateTextForVoice(question, type) {
  const { title, 'correct-answer': answer } = question;

  // Generate context-aware audio content that demonstrates the answer without explicitly stating it
  const contextMap = {
    recitation: (answer) => `بسم الله الرحمن الرحيم، ${answer}`,

    poetry: (answer) => {
      // For poetry, generate a sample verse in the style being asked about
      const poetryMap = {
        'الشعر الجاهلي': 'قفا نبكي من ذكرى حبيب ومنزل',
        'الشعر الحر': 'في المساء الحزين، تغرد الطيور',
        default: 'يا ليل الصب متى غده'
      };
      return poetryMap[answer] || poetryMap.default;
    },

    music: (answer) => {
      // For maqam questions, use phrases typical of that maqam
      const maqamMap = {
        'مقام البيات': 'يا ليلي يا عيني',
        'مقام الراست': 'صباح الخير يا جميل',
        'مقام الحجاز': 'يا مسافر وحدك',
        default: 'يا ليل يا عين'
      };
      return maqamMap[answer] || maqamMap.default;
    },

    nature: (answer) => {
      // For nature sounds, describe the sound in the dialect/style of the answer
      const natureMap = {
        'البلبل': 'غرد البلبل في الصباح الباكر',
        'الصقر': 'حلق الصقر عاليا في السماء',
        default: 'صوت من الطبيعة الجميلة'
      };
      return natureMap[answer] || natureMap.default;
    },

    dialect: (answer) => {
      // For dialect questions, use common phrases in that dialect without revealing which it is
      const dialectMap = {
        'اللهجة المصرية': 'صباح الفل يا قمر، عامل ايه النهاردة؟ والله واحشني أوي',
        'اللهجة الشامية': 'صباح الخير حبيبي، شو أخبارك اليوم؟ والله اشتقتلك كتير',
        'اللهجة الخليجية': 'مرحبا، شخبارك اليوم؟ والله مشتاقين لك وايد',
        'اللهجة المغربية': 'صباح الخير، كيف داير؟ والله باغي نشوفك',
        default: 'مرحبا بك، كيف حالك اليوم؟'
      };
      return dialectMap[answer] || dialectMap.default;
    },

    speech: (answer) => {
      // For speech questions, use a relevant excerpt that shows the style without naming the speaker
      const speechMap = {
        'الخطاب السياسي': 'أيها الشعب العظيم، نحن اليوم نقف على مفترق طرق تاريخي',
        'الخطاب الديني': 'أيها الإخوة والأخوات، إن الحديث عن القيم والأخلاق',
        default: 'أيها الحضور الكريم'
      };
      return speechMap[answer] || speechMap.default;
    },

    general: () => 'مرحباً بكم في هذا المحتوى التعليمي'
  };

  // Get the appropriate text generator for the type
  const textGenerator = contextMap[type] || contextMap.general;

  // Generate the text using the answer
  return textGenerator(answer);
}

/**
 * Generate audio using OpenAI's Text-to-Speech
 * @param {Object} question - The question object
 * @returns {Promise<Object>} Audio data and type
 */
async function generateAudio(question) {
  const prompt = generatePrompt(question);
  console.log('\nGenerating audio for:', question.title);

  try {
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: prompt.voice,
      input: prompt.input,
      response_format: "mp3"
    });

    // Convert the audio to base64
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const base64Audio = audioBuffer.toString('base64');

    return {
      'audio-type': 'base64',
      'audio-data': `data:audio/mp3;base64,${base64Audio}`
    };
  } catch (error) {
    console.error('Error generating audio:', error);
    return {
      'audio-type': 'placeholder',
      'audio-data': question['audio-url'] // Fallback to placeholder URL
    };
  }
}

module.exports = {
  generateAudio
};