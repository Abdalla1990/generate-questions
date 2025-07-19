# Questions Scripts - Environment Setup

This project uses environment variables to manage API keys securely. You can use different environment files for different purposes.

## Quick Setup

### For Development (Recommended)
1. **Set up development environment:**
   ```bash
   npm run dev:setup
   ```

2. **Edit the `.env.dev` file** and add your actual API keys:
   ```env
   OPENAI_API_KEY=your_actual_openai_api_key_here
   STABILITY_API_KEY=your_actual_stability_api_key_here
   ```

### For Production
1. **Set up production environment:**
   ```bash
   npm run setup
   ```

2. **Edit the `.env` file** and add your actual API keys:
   ```env
   OPENAI_API_KEY=your_actual_openai_api_key_here
   STABILITY_API_KEY=your_actual_stability_api_key_here
   ```

### Manual Setup
If you prefer to set up manually:

#### Development
```bash
cp .env.dev.example .env.dev
# Then edit .env.dev with your API keys
```

#### Production
```bash
cp .env.example .env
# Then edit .env with your API keys
```

## Getting API Keys

### OpenAI API Key
- Visit: https://platform.openai.com/api-keys
- Sign in to your OpenAI account
- Create a new API key
- Copy the key and paste it in your `.env` file

### Stability AI API Key (Optional)
- Visit: https://platform.stability.ai/account/keys
- Sign in to your Stability AI account
- Create a new API key
- Copy the key and paste it in your `.env` file

## Important Notes

- **Never commit your `.env` file** to version control - it's already included in `.gitignore`
- The `.env.example` file is safe to commit and shows the required environment variables
- If you're missing an API key, the application will show a clear error message
- The OpenAI API key is required for question generation
- The Stability AI API key is only needed if you're using Stability AI image generation features

## Usage

Once your environment files are set up, you can run the scripts:

### Development Mode
```bash
npm run dev
# This will use .env.dev and show development-specific output
```

### Production Mode
```bash
npm start
# This will use .env for production settings
```

### Manual Environment Selection
You can also run with a specific environment file:
```bash
# Using .env.dev
node -r dotenv/config generate-questions/index.js dotenv_config_path=.env.dev

# Using .env
node generate-questions/index.js
```

## Environment File Priority

The application will look for environment files in this order:
1. `.env.dev` (development environment - takes priority)
2. `.env` (production/fallback environment)

## Important Notes

- **Never commit your `.env` or `.env.dev` files** to version control - they're included in `.gitignore`
- The `.env.example` file is safe to commit and shows the required environment variables
- If you're missing an API key, the application will show a clear error message
- The OpenAI API key is required for question generation
- The Stability AI API key is only needed if you're using Stability AI image generation features
- Development mode (`.env.dev`) includes additional debugging and development-specific settings

The application will automatically load your environment variables from the appropriate `.env` file.
