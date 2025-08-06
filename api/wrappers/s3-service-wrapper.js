// api/wrappers/s3-service-wrapper.js - ES module wrapper for S3 service
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const S3Service = require('../../shared/s3-service.js');

export default S3Service;
