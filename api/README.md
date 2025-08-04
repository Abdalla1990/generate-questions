# Questions API

A Node.js Express API that provides endpoints for questions generation, sets management, and question allocation functionality.

## Features

- **ES6 Modules**: Uses modern ES6 module syntax with SWC for transpilation
- **Rate Limiting**: Built-in rate limiting for API protection
- **Security**: Helmet and CORS middleware for security
- **Error Handling**: Comprehensive error handling and logging
- **Development & Production**: Separate workflows for dev and production

## Setup

### Prerequisites
- Node.js 20.0.0 (see `.nvmrc`)
- npm

### Installation

1. Navigate to the API directory:
   ```bash
   cd api
   ```

2. Use the correct Node.js version:
   ```bash
   nvm use
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

## Development

### Running in Development Mode
Development mode uses SWC with file watching and nodemon for live reload:

```bash
npm run dev
```

This will:
- Compile TypeScript/ES6+ code using SWC with `--watch`
- Start the server with nodemon for auto-restart on changes
- Load environment variables from `../.env.dev`

### Building for Production
To build the application:

```bash
npm run build
```

This creates a `dist/` directory with compiled JavaScript files.

### Running in Production Mode
To run the built application:

```bash
npm start
```

## API Endpoints

### Health Check
- **GET** `/health` - Returns API health status

### Questions Generation
- **POST** `/api/questions/generate` - Generate new questions using GPT
  - Rate limited: 10 requests per hour

### Question Sets
- **POST** `/api/sets/generate` - Generate question sets
  - Body: `{ numSetsPerCategory?: number, questionsPerSet?: number }`
  - Rate limited: 10 requests per hour

- **POST** `/api/sets/allocate` - Allocate sets to users
  - Body: `{ userId: string, categoryIds: string[] }`
  - Rate limited: 100 requests per 15 minutes

### Question Merging
- **POST** `/api/questions/merge` - Merge questions for users
  - Body: `{ userId: string, categoryIds: string[] }`
  - Rate limited: 100 requests per 15 minutes

## Architecture

### Module Structure
The API uses ES6 modules but integrates with existing CommonJS modules through wrapper files:

- `src/server.js` - Main Express server (ES6)
- `src/wrappers/` - ES6 wrappers for CommonJS modules
- `dist/` - Compiled output (created by SWC)

### SWC Configuration
Uses `.swcrc` for transpilation configuration:
- Target: ES2020
- Output: ES6 modules
- Features: Import meta, top-level await, dynamic imports

## Scripts

- `npm run dev` - Development mode with live reload
- `npm run build` - Build for production
- `npm start` - Run production build
- `npm run clean` - Clean build directory

## Environment Variables

The API loads environment variables from `../.env.dev` in development mode. Make sure to set up the required variables for database connections and API keys.

## Rate Limiting

- **General endpoints**: 100 requests per 15 minutes
- **Heavy operations** (generate): 10 requests per hour

## Error Handling

All endpoints include:
- Input validation
- Comprehensive error logging
- Structured JSON error responses
- Proper HTTP status codes
- Resource cleanup (database connections, etc.)
