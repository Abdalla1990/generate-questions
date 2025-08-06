// shared/s3-service.js - S3 service for uploading game data
const AWS = require('aws-sdk');
const path = require('path');
const fs = require('fs');

// Load environment variables
const envPath = path.join(__dirname, '../', '.env.dev');
const fallbackEnvPath = path.join(__dirname, '../', '.env');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else if (fs.existsSync(fallbackEnvPath)) {
  require('dotenv').config({ path: fallbackEnvPath });
}

class S3Service {
  constructor() {
    // Save current AWS config to restore later
    const originalConfig = { ...AWS.config };

    // Temporarily clear AWS global config to prevent interference
    AWS.config = new AWS.Config();

    // Create S3 instance with explicit configuration using dedicated S3 credentials
    const s3Config = {
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
      s3ForcePathStyle: false,
      signatureVersion: 'v4'
    };

    console.log({ s3Config })
    this.s3 = new AWS.S3(s3Config);
    this.bucketName = process.env.AWS_S3_BUCKET || 'questions-game-storage';

    // Restore original AWS config for other services
    AWS.config = originalConfig;

    console.log(`🔧 S3Service initialized with bucket: ${this.bucketName}, region: ${s3Config.region}`);
    console.log(`🔧 S3Service using access key: ${s3Config.accessKeyId ? s3Config.accessKeyId.substring(0, 8) + '...' : 'undefined'}`);
    console.log(`🔧 S3Service endpoint:`, this.s3.endpoint?.href || 'default AWS S3 endpoint');
  }

  /**
   * Save questions to S3
   * @param {Array} questions - Array of questions to save
   * @param {string} userId - User ID for folder structure
   * @param {string} roundId - Round ID for file name
   * @returns {Promise<Object>} S3 upload result
   */
  async saveQuestions(questions, userId, roundId) {
    const key = `${userId}/${roundId}.json`;

    const params = {
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(questions, null, 2),
      ContentType: 'application/json',
      // Make file publicly readable
      ACL: 'public-read',
      CacheControl: 'max-age=3600', // Cache for 1 hour
      Metadata: {
        'user-id': userId,
        'round-id': roundId,
        'created-at': new Date().toISOString(),
        'questions-count': questions.length.toString()
      }
      // Remove server-side encryption as it can complicate public access
    };

    try {
      const result = await this.s3.upload(params).promise();

      // Generate public HTTPS URL for the uploaded file
      const publicUrl = `https://${this.bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;

      console.log(`✅ Successfully uploaded questions to S3: ${publicUrl}`);
      return {
        success: true,
        location: result.Location,
        publicUrl: publicUrl,
        bucket: this.bucketName,
        key: key,
        questionsCount: questions.length
      };
    } catch (error) {
      console.error(`❌ Failed to upload questions to S3:`, error);
      throw error;
    }
  }

  /**
   * Get questions from S3
   * @param {string} userId - User ID
   * @param {string} roundId - Round ID
   * @returns {Promise<Array>} Array of questions
   */
  async getQuestions(userId, roundId) {
    const key = `${userId}/${roundId}.json`;

    const params = {
      Bucket: this.bucketName,
      Key: key
    };

    try {
      const result = await this.s3.getObject(params).promise();
      const questions = JSON.parse(result.Body.toString());
      console.log(`✅ Successfully retrieved questions from S3: ${questions.length} questions`);
      return questions;
    } catch (error) {
      if (error.code === 'NoSuchKey') {
        console.log(`📂 No questions found for user ${userId}, round ${roundId}`);
        return null;
      }
      console.error(`❌ Failed to retrieve questions from S3:`, error);
      throw error;
    }
  }

  /**
   * List all rounds for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of round IDs
   */
  async listUserRounds(userId) {
    const params = {
      Bucket: this.bucketName,
      Prefix: `${userId}/`,
      Delimiter: '/'
    };

    try {
      const result = await this.s3.listObjectsV2(params).promise();
      const rounds = result.Contents.map(obj => {
        const filename = obj.Key.split('/')[1];
        return filename.replace('.json', '');
      });

      console.log(`✅ Found ${rounds.length} rounds for user ${userId}`);
      return rounds;
    } catch (error) {
      console.error(`❌ Failed to list rounds for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Delete questions for a specific round
   * @param {string} userId - User ID
   * @param {string} roundId - Round ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteQuestions(userId, roundId) {
    const key = `${userId}/${roundId}.json`;

    const params = {
      Bucket: this.bucketName,
      Key: key
    };

    try {
      await this.s3.deleteObject(params).promise();
      console.log(`✅ Successfully deleted questions for user ${userId}, round ${roundId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to delete questions from S3:`, error);
      throw error;
    }
  }

  /**
   * Check if S3 bucket is accessible
   * @returns {Promise<boolean>} Accessibility status
   */
  async healthCheck() {
    try {
      await this.s3.headBucket({ Bucket: this.bucketName }).promise();
      console.log(`✅ S3 bucket ${this.bucketName} is accessible`);
      return true;
    } catch (error) {
      console.error(`❌ S3 bucket ${this.bucketName} is not accessible:`, error);
      return false;
    }
  }

  /**
   * Get the S3 location URL for a specific round
   * @param {string} userId - User ID
   * @param {string} roundId - Round ID
   * @returns {string} S3 location URL
   */
  getS3Location(userId, roundId) {
    return `s3://${this.bucketName}/${userId}/${roundId}.json`;
  }
}

module.exports = S3Service;
