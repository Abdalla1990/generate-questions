// generator.js - Main OpenAI generation logic
const { OpenAI } = require('openai');
const { v4: uuidv4 } = require('uuid');
const {
  requiredFields,
  CATEGORIES,
  questionTypeMapping,
  questionTypeExamples,
  getEnabledQuestionTypes,
  getAllowedImageContexts
} = require('./config');

/**
 * Build the system prompt for OpenAI
 * @param {number} NUM_Q - Number of questions to generate
 * @returns {string} The complete system prompt
 */
function buildSystemPrompt(NUM_Q) {
  // Get only enabled question types
  const enabledTypes = getEnabledQuestionTypes();
  const allowedImageContexts = getAllowedImageContexts();

  // Generate the field requirements part of the prompt - only for enabled types
  const fieldRequirements = Object.entries(requiredFields)
    .filter(([key]) => key !== 'base' && enabledTypes.includes(key))
    .map(([type, spec]) => {
      const allRequired = [
        ...(requiredFields.base.required || []),
        ...(spec.required || [])
      ];
      const allOptional = [
        ...(requiredFields.base.optional || []),
        ...(spec.optional || [])
      ];

      return `  • ${questionTypeMapping[type]}: 
    Required: ${allRequired.join(', ')}
    Optional: ${allOptional.length ? allOptional.join(', ') : 'none'}
    Example: ${questionTypeExamples[type]}
    ${spec.validation ? 'Validation:\n' + Object.entries(spec.validation)
          .map(([field, rule]) => `      - ${field}: ${rule}`).join('\n') : ''}`
    }).join('\n');

  // Create category guidance
  const categoryGuidance = CATEGORIES.map(cat =>
    `    - ${cat.id}: ${cat.name} (${cat.name} in Arabic context)`
  ).join('\n');

  // Calculate distribution for enabled types only
  const numEnabledTypes = enabledTypes.length;
  const questionsPerType = Math.floor(NUM_Q / numEnabledTypes);
  const remainingQuestions = NUM_Q % numEnabledTypes;

  // Build distribution text for enabled types
  const distributionText = enabledTypes.map(type =>
    `  - ${type}: ${questionsPerType} questions`
  ).join('\n');

  return `
You are an Arabic trivia-question generator. Every time you run, output a JSON array of ${NUM_Q} UNIQUE questions.
So when running this the next times dont produce the same questions.
All questions, answers, and content MUST be in Arabic language using proper Arabic script (not transliteration).

ENABLED QUESTION TYPES (CRITICAL):
• ONLY generate questions of these types: ${enabledTypes.join(', ')}
• DO NOT generate questions of any other type
• You MUST use ONLY the enabled types listed above

STRICT DISTRIBUTION REQUIREMENTS (CRITICAL):
• For ${NUM_Q} questions, you MUST distribute them as follows:
${distributionText}
  - Remaining ${remainingQuestions} question(s) can be of any enabled type
• This distribution is MANDATORY - DO NOT DEVIATE
• EVERY enabled question type MUST have at least one question

${enabledTypes.includes('image') ? `
STRICT IMAGE CONTEXT REQUIREMENTS:
• For any question with "question-type": "image", you MUST include an "image-context" field.
• The value of "image-context" MUST be one of:
${allowedImageContexts.map(context => `    - "${context}"`).join('\n')}
• Do NOT use any other value for "image-context".
• Do NOT generate image questions for any other context.
• All other question types are unaffected by this restriction.
` : ''}

MEDIA CONTENT REQUIREMENTS:
${enabledTypes.includes('image') ? `
• Image Questions Examples:
  - تعرف على هذا المعلم التاريخي (معالم وآثار)
  - حدد نوع هذا النبات (نباتات وأشجار)
  - تعرف على هذا الخط العربي (أنواع الخطوط)
  - اكتشف هذا البلد على الخريطة (جغرافيا)
` : ''}
${enabledTypes.includes('voice') ? `
• Voice Questions Examples:
  - تعرف على هذا المقام الموسيقي (مقامات عربية)
  - حدد نوع هذا الطائر من صوته (أصوات الطيور)
  - من هو هذا القارئ المشهور (تلاوات قرآنية)
  - تعرف على هذه اللهجة العربية (لهجات)
` : ''}
${enabledTypes.includes('video') ? `
• Video Questions Examples:
  - حدد اسم هذه المعركة التاريخية (معارك)
  - تعرف على هذه الرقصة التراثية (فنون شعبية)
  - حدد نوع هذه الظاهرة الطبيعية (ظواهر)
  - اكتشف هذا الفن الحركي (فنون)
` : ''}
  - اكتشف هذا الفن الحركي (فنون)

STRICT IMAGE CONTEXT REQUIREMENTS:
• For any question with "question-type": "image", you MUST include an "image-context" field.
• The value of "image-context" MUST be one of:
    - "arabic-calligraphy"
    - "plant"
    - "country"
• Do NOT use any other value for "image-context".
• Do NOT generate image questions for any other context.
• All other question types are unaffected by this restriction.

TARGET AUDIENCE:
• Questions are for native Arabic speakers with full language proficiency
• Language-related questions should be appropriately challenging:
  - Grammar questions should cover nuanced rules and exceptions
  - Vocabulary questions should include classical Arabic (فصحى) terms
  - Literary questions should reference sophisticated texts and poetry
  - Linguistic questions should cover etymology and morphology
  - Basic language questions (simple grammar, common words) should be avoided
  - Focus on rich aspects of Arabic language like:
    * Complex derivatives (اشتقاقات)
    * Subtle differences between similar words (فروق لغوية)
    * Classical poetry meters (بحور الشعر)
    * Rhetorical devices (بلاغة)
    * Root system complexities (جذور وأوزان)

CRITICAL OUTPUT REQUIREMENTS:
1. Return ONLY a complete, valid JSON array.
2. Each question object MUST have ALL required fields properly filled.
3. The "id" field for each question MUST be a random, unique string (e.g., a random alphanumeric string or UUID-like format). Do NOT use sequential numbers or fixed values.
4. NEVER leave any field empty or incomplete.
5. ALL string values MUST use double quotes (").
6. DO NOT use string concatenation or template literals.
7. DO NOT include any text before or after the JSON.

COMPLETION REQUIREMENTS:
• EVERY question MUST have ALL its required fields
• For multiple-choice: MUST have 4 complete choices and a valid correct-answer-index
• For image/voice: MUST have complete URLs and correct-answer
• For range: MUST have all numeric fields (min, max, correct, range)
• NEVER leave arrays with empty strings ["value", "", ""]
• NEVER include empty objects or partial data
• If you cannot complete a question fully, do not include it

CALENDAR REQUIREMENTS FOR HISTORY QUESTIONS:
• For Islamic history questions:
  - ALL dates MUST be in Hijri calendar (التقويم الهجري)
  - Examples: تاريخ معركة بدر، تاريخ فتح مكة، تأسيس الدولة الأموية
  - Format dates as: سنة ### هجرية
  - Include both the event and its Hijri year
  - For range questions about Islamic dates, use Hijri years

• For non-Islamic history questions:
  - ALL dates MUST be in Gregorian calendar (التقويم الميلادي)
  - Examples: اكتشاف أمريكا، الحرب العالمية، تأسيس جامعة الدول العربية
  - Format dates as: سنة ### ميلادية
  - Include both the event and its Gregorian year
  - For range questions about non-Islamic dates, use Gregorian years

• Calendar Context Requirements:
  - Question text MUST clearly indicate which calendar is being used
  - Use appropriate Arabic terms: هجري/هجرية for Hijri, ميلادي/ميلادية for Gregorian
  - For multiple choice questions with dates, all options must use the same calendar system
  - Range questions must specify which calendar system to use in the question text

Example of CORRECT multiple-choice question:
{
  "id": "q1",
  "categoryId": "cat1",
  "points": 300,
  "title": "السؤال هنا",
  "question-type": "multiple-choice",
  "choices": ["الخيار ١", "الخيار ٢", "الخيار ٣", "الخيار ٤"],
  "correct-answer-index": 0
}

Example of correct response format:
[
  {
    "id": "q1",
    "categoryId": "cat1",
    "points": 100,
    "title": "سؤال",
    "question-type": "multiple-choice",
    "choices": ["اختيار ١", "اختيار ٢"],
    "correct-answer-index": 0
  }
]

Base Requirements (required for all questions):
${requiredFields.base.required.map(field => `  • ${field}`).join('\n')}

Categories:
  • categoryId must be one of these exact values:
${categoryGuidance}
  • categoryId must match one of the available categories
  • the questions produced must be equally distributed across the categories

Category Distribution Requirements:
  • CRITICAL: Questions MUST be evenly distributed across ALL available categories
  • For ${NUM_Q} questions across ${CATEGORIES.length} categories:
    - Each category should have approximately ${Math.floor(NUM_Q / CATEGORIES.length)} questions
    - Maximum deviation: ±1 question per category
    - No category should be left empty
    - No category should have more than ${Math.ceil(NUM_Q / CATEGORIES.length) + 1} questions
  • Category Distribution Validation:
    - Track the count of questions per category
    - Ensure all categories are represented
    - Balance difficulty levels within each category
    - Distribute question types evenly within each category

Question Types Distribution:
  CRITICAL REQUIREMENTS FOR QUESTION TYPE DISTRIBUTION:
  • For ${NUM_Q} questions, you MUST distribute them as follows:
    ${Object.keys(questionTypeMapping).map(type =>
    `- ${type}: ${Math.floor(NUM_Q / Object.keys(questionTypeMapping).length)} questions`
  ).join('\n    ')}
  • Maximum allowed deviation: ±1 question per type
  • Multiple-choice questions MUST NOT exceed ${Math.ceil(NUM_Q / Object.keys(questionTypeMapping).length) + 1} questions
  • Every question type MUST be used at least once
  • For media questions (image, voice, video):
    - Use placeholder URLs in format "https://placeholder.com/[type]/[description]"
    - Example: "https://placeholder.com/image/pyramids-of-giza.jpg"
    - Always provide detailed description in the URL for later replacement

Media Content Guidelines:
  • Image Questions:
    - Historical landmarks and architecture
    - Famous artifacts and archaeological finds
    - Scientific diagrams and charts
    - Cultural symbols and traditional items
  
  • Voice Questions:
    - Traditional music and maqams
    - Quranic recitations
    - Famous speeches
    - Nature and animal sounds
  
  • Video Questions:
    - Historical events reenactments
    - Traditional dances
    - Scientific phenomena
    - Sports highlights

Points System:
  • points must be one of: [100, 300, 500] representing strictly defined difficulty levels:

    100 points (Easy):
    - Basic knowledge and simple recall questions
    - Common cultural facts known to most Arabic speakers
    - Simple multiple choice with clear, distinct options
    - Common but non-trivial language concepts (e.g., less common plural forms, معاني الحروف)
    - Well-known historical events
    - Examples: capital cities, basic religious facts, popular sports figures, تصريف الأفعال المشهورة

    300 points (Medium):
    - Questions requiring analysis or recognition
    - Moderate cultural or historical knowledge
    - Image or voice recognition of notable items/people
    - Mathematical concepts requiring calculation
    - Language questions involving complex grammar (إعراب الجمل المركبة, أحكام النحو)
    - Advanced vocabulary and morphology (اشتقاقات, أوزان غير شائعة)
    - Sports questions about specific tournaments or records
    - Examples: identifying architectural styles, scientific concepts, literary works, تحليل النصوص الأدبية

    500 points (Hard):
    - Complex analysis or deep subject knowledge required
    - Specific historical details or dates
    - Advanced scientific or mathematical concepts
    - Sophisticated language concepts:
      * Complex rhetorical analysis (تحليل بلاغي متقدم)
      * Classical poetry meters (بحور الشعر)
      * Rare linguistic phenomena (ظواهر لغوية نادرة)
      * Advanced etymology (أصول الكلمات وتطورها)
      * Classical Arabic texts analysis (تحليل نصوص التراث)
    - Detailed cultural or religious scholarship
    - Video analysis of complex events
    - Range questions requiring precise knowledge
    - Examples: تحليل قصائد الجاهلية, إعراب آيات متشابهة, مقارنة المذاهب النحوية

  • Each difficulty level must match its question type appropriately
  • Multiple choice questions can appear at any difficulty level, but hard ones must have sophisticated distractors
  • Media questions (image, voice, video) should focus on recognition at 300 points, analysis at 500 points

Question Type Specifications:
${fieldRequirements}

The question-type field should be one of: ${Object.keys(questionTypeMapping).join(', ')}

Remember:
- ALL text content must be in Arabic (questions, choices, answers, titles)
- Use proper Arabic numerals where appropriate
- Maintain cultural relevance to the Arab world
- Ensure questions are appropriate for the category

Do NOT include any extra fields, comments, or markdown—output pure JSON.
`.trim();
}

/**
 * Generate questions using OpenAI
 * @param {number} NUM_Q - Number of questions to generate
 * @returns {Promise<Object>} Generated questions and usage statistics
 */
async function generateQuestionsWithOpenAI(NUM_Q) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('⚠️  Please set OPENAI_API_KEY in your environment');
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const systemPrompt = buildSystemPrompt(NUM_Q);

  const resp = await openai.chat.completions.create({
    model: 'gpt-4',
    temperature: 0.3, // Lower temperature for more consistent output
    frequency_penalty: 0.2, // Slight penalty to avoid repetition
    presence_penalty: 0.1, // Light penalty to encourage diverse questions
    max_tokens: 4000, // Ensure enough tokens for complete output
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: 'Generate the questions according to the specifications. Return only the JSON array.'
      }
    ],
    tools: [
      {
        type: "function",
        function: {
          name: 'generate_questions',
          description: 'Generate Arabic trivia questions with precise difficulty levels',
          parameters: {
            type: 'object',
            required: ['questions'],
            properties: {
              questions: {
                type: 'array',
                description: 'Array of trivia questions in Arabic',
                minItems: NUM_Q,
                maxItems: NUM_Q,
                items: {
                  type: 'object',
                  required: ['id', 'categoryId', 'points', 'title', 'question-type'],
                  properties: {
                    id: {
                      type: 'string',
                      description: 'Unique identifier for the question'
                    },
                    categoryId: {
                      type: 'string',
                      enum: CATEGORIES.map(c => c.id),
                      description: 'Category ID from the predefined list'
                    },
                    points: {
                      type: 'integer',
                      enum: [100, 300, 500],
                      description: '100: Basic recall questions only. 300: Analysis or recognition required. 500: Complex analysis or deep knowledge required.'
                    },
                    title: {
                      type: 'string',
                      description: 'The question text in Arabic'
                    },
                    'question-type': {
                      type: 'string',
                      enum: Object.keys(questionTypeMapping),
                      description: 'The type of question'
                    },
                    choices: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'For multiple-choice questions, the array of possible answers in Arabic'
                    },
                    'correct-answer-index': {
                      type: 'integer',
                      description: 'For multiple-choice questions, the index of the correct answer'
                    },
                    'image-hint': {
                      type: 'string',
                      description: 'For image questions, the URL or description of the image'
                    },
                    'correct-answer': {
                      type: 'string',
                      description: 'For image/voice questions, the correct answer in Arabic'
                    },
                    'audio-url': {
                      type: 'string',
                      description: 'For voice questions, the URL of the audio file'
                    },
                    transcript: {
                      type: 'string',
                      description: 'For voice questions, optional transcript of the audio'
                    },
                    'video-url': {
                      type: 'string',
                      description: 'For video questions, the URL of the video file'
                    },
                    'min-value': {
                      type: 'number',
                      description: 'For range questions, the minimum acceptable value'
                    },
                    'max-value': {
                      type: 'number',
                      description: 'For range questions, the maximum acceptable value'
                    },
                    'range': {
                      type: 'number',
                      description: 'For range questions, number, must be declared as the acceptable range around the correct value considering min-value and max-value'
                    },
                    'correct-answer': {
                      type: 'number',
                      description: 'For range questions, the exact correct answer. Use this instead of correct-answer for range questions.'
                    },
                    'image-type': {
                      type: 'string',
                      enum: ['base64', 'placeholder'],
                      description: 'For image questions, specifies the type of image data'
                    },
                    unit: {
                      type: 'string',
                      description: 'For range questions, optional unit of measurement'
                    }
                  }
                }
              }
            }
          }
        }
      }
    ]
  });

  // Calculate token usage and cost
  const { prompt_tokens, completion_tokens, total_tokens } = resp.usage;
  // GPT-4 pricing: $0.03 per 1K prompt tokens, $0.06 per 1K completion tokens
  const promptCost = (prompt_tokens / 1000) * 0.03;
  const completionCost = (completion_tokens / 1000) * 0.06;
  const totalCost = promptCost + completionCost;

  console.log('\nToken Usage Report:');
  console.log('------------------');
  console.log(`Prompt tokens: ${prompt_tokens}`);
  console.log(`Completion tokens: ${completion_tokens}`);
  console.log(`Total tokens: ${total_tokens}`);
  console.log('\nCost Breakdown:');
  console.log('------------------');
  console.log(`Prompt cost: $${promptCost.toFixed(4)}`);
  console.log(`Completion cost: $${completionCost.toFixed(4)}`);
  console.log(`Total cost: $${totalCost.toFixed(4)}`);
  console.log('------------------\n');

  return {
    response: resp,
    usage: resp.usage,
    costs: {
      prompt: promptCost,
      completion: completionCost,
      total: totalCost
    }
  };
}

/**
 * Parse questions from OpenAI response
 * @param {Object} response - OpenAI response object
 * @returns {Array} Parsed questions array
 */
function parseQuestionsFromResponse(response) {
  let questions;

  try {
    const message = response.choices[0].message;
    let jsonContent = '';

    // Parse questions from tool calls or direct content
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      if (toolCall.function && toolCall.function.arguments) {
        const args = JSON.parse(toolCall.function.arguments);
        questions = args.questions;
      }
    } else if (message.content) {
      // Handle string template format
      if (message.content.includes("'[\\n' +")) {
        // Extract the actual JSON by joining the lines and evaluating the string template
        jsonContent = message.content
          .split('\n')
          .map(line => line.trim())
          .filter(line => line)
          .join('')
          .replace(/\\n/g, '\n')
          .replace(/'\s*\+\s*'/g, '')
          .replace(/^'|'$/g, '');
      } else {
        jsonContent = message.content;
      }

      try {
        questions = JSON.parse(jsonContent);
      } catch (parseError) {
        // If parsing fails, try to clean up the JSON string further
        jsonContent = jsonContent
          .replace(/,(\s*[\]}])/g, '$1') // Remove trailing commas
          .replace(/,\s*,/g, ',') // Remove empty entries
          .replace(/{\s*},/g, '') // Remove empty objects
          .replace(/,\s*}/g, '}') // Remove trailing commas in objects
          .replace(/"\s*,\s*"/g, '","') // Fix string arrays
          .replace(/\[\s*,/g, '[') // Clean array starts
          .replace(/,\s*\]/g, ']') // Clean array ends
          .replace(/"\s*:\s*"/g, '":"') // Clean key-value pairs
          .replace(/{\s*"?\s*"?\s*}/g, '{}') // Clean empty objects
          .replace(/\[\s*\]/g, '[]') // Clean empty arrays
          .replace(/,+/g, ',') // Remove multiple commas
          .replace(/,\s*$/, ''); // Remove trailing comma

        questions = JSON.parse(jsonContent);
      }
    }

    if (!questions || !Array.isArray(questions)) {
      throw new Error('No valid questions array in response');
    }

    // Assign a new UUID to each question
    questions = questions.map(q => ({
      ...q,
      id: uuidv4()
    }));

    console.log(`Successfully parsed ${questions.length} questions`);
    return questions;

  } catch (err) {
    console.error('❌ Failed to parse questions from GPT response:');
    console.error('Error:', err.message);
    console.error('Raw response:', response.choices[0].message);
    throw err;
  }
}

module.exports = {
  buildSystemPrompt,
  generateQuestionsWithOpenAI,
  parseQuestionsFromResponse
};
