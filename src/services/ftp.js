import { createWriteStream } from 'fs';
import { Writable } from 'stream';
import { Client } from 'basic-ftp';

const client = new Client();

// Configuración FTP (debería ser cargada desde variables de entorno en producción)
const ftpConfig = {
  host: process.env.FTP_HOST || 'ftp.example.com',
  port: process.env.FTP_PORT || 21,
  user: process.env.FTP_USER || 'user',
  password: process.env.FTP_PASSWORD || 'password',
  path: process.env.FTP_PATH || '/public_html/',
};

/**
 * Conecta al servidor FTP.
 */
export async function connectFtp() {
  try {
    await client.access(ftpConfig);
    console.log('Conectado al servidor FTP.');
  } catch (error) {
    console.error('Error conectando al servidor FTP:', error);
    throw error; // Re-lanza el error para que sea manejado por quien llama
  }
}

/**
 * Descarga un archivo del servidor FTP y devuelve un buffer.
 * @param {string} remotePath La ruta del archivo en el servidor.
 * @returns {Promise<Buffer>} El buffer del archivo.
 */
export async function downloadFromFtp(remotePath) {
  if (!client.closed) {
    try {
      const chunks = [];
      const writable = new Writable({
        write(chunk, enc, cb) {
          chunks.push(chunk);
          cb();
        }
      });
      await client.downloadTo(writable, remotePath);
      return Buffer.concat(chunks);
    } catch (error) {
      console.error(`Error descargando archivo de ${remotePath}:`, error);
      throw error;
    }
  } else {
    throw new Error('Conexión FTP inactiva.');
  }
}

/**
 * Obtiene el subdirectorio correcto en el servidor FTP basado en el código del artículo.
 * @param {string} codigo El código del artículo.
 * @returns {string} La ruta del subdirectorio.
 */
export function getSubdir(codigo) {
  const num = parseInt(codigo, 10);
  if (num < 130000) return '0_130m';
  if (num < 170000) return '130m_170m';
  return '170m_300m';
}

/**
 * Cierra la conexión FTP.
 */
export async function closeFtp() {
  if (!client.closed) {
    await client.close();
    console.log('Conexión FTP cerrada.');
  }
}

/**
 * Cambia el directorio actual en el servidor FTP.
 * @param {string} path La ruta del directorio.
 */
export async function changeDir(path) {
  if (!client.closed) {
    return await client.cd(path);
  }
}

/**
 * Obtiene la fecha de última modificación de un archivo.
 * @param {string} filename El nombre del archivo.
 * @returns {Promise<Date>} La fecha de modificación.
 */
export async function lastMod(filename) {
  if (!client.closed) {
    return await client.lastMod(filename);
  }
}

// Conectar automáticamente al iniciar el servicio si es necesario, o manejar la conexión
// explícitamente donde se necesite.
// connectFtp().catch(err => console.error('Error inicial de conexión FTP:', err));
