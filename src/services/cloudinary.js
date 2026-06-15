import { v2 as cloudinary } from 'cloudinary';
import config from '../config/index.js';

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true
});

export const TRANSFORMATIONS = {
  real: {},
  medium: { width: 800, crop: 'scale', quality: 'auto' },
  small: { width: 400, crop: 'scale', quality: 'auto' }
};

export const FOLDER = 'oferta-semanal';

export async function uploadImage(fileBuffer, publicId) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: FOLDER,
        public_id: publicId,
        resource_type: 'image',
        format: 'jpg'
      },
      (error, result) => {
        if (error) {
          console.error('[CloudinaryService] Error uploading:', error.message);
          return reject(error);
        }
        resolve(result);
      }
    ).end(fileBuffer);
  });
}

export function getUrl(publicId, size = 'real') {
  const transformation = TRANSFORMATIONS[size] || TRANSFORMATIONS.real;

  return cloudinary.url(publicId, {
    ...transformation,
    secure: true,
    format: 'jpg'
  });
}

export function getSignedUrl(publicId, size = 'real') {
  const transformation = TRANSFORMATIONS[size] || TRANSFORMATIONS.real;

  return cloudinary.url(publicId, {
    ...transformation,
    secure: true,
    sign_url: true,
    format: 'jpg'
  });
}

export async function deleteImage(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('[CloudinaryService] Error deleting:', error.message);
    throw error;
  }
}

export async function imageExists(publicId) {
  try {
    await cloudinary.api.resource(publicId);
    return true;
  } catch (error) {
    return false;
  }
}
