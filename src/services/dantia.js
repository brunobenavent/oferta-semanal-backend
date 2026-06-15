import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import config from '../config/index.js';

const cookieJar = new CookieJar();

const dantiaClient = axios.create({
  baseURL: config.dantia.baseURL,
  withCredentials: true
});

wrapper(dantiaClient);
dantiaClient.defaults.jar = cookieJar;

let sessionCache = {
  accessToken: null,
  expiresAt: 0,
  isLoggingIn: false
};

export async function login() {
  console.log('[DantiaService] Intentando login...');
  console.log('[DantiaService] URL:', config.dantia.baseURL);
  console.log('[DantiaService] Username:', config.dantia.username ? 'configurado' : 'FALTANTE');

  if (sessionCache.isLoggingIn) {
    while (sessionCache.isLoggingIn) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return sessionCache.accessToken;
  }

  sessionCache.isLoggingIn = true;

  try {
    console.log('[DantiaService] Realizando login...');

    const loginParams = {
      name: config.dantia.username,
      password: config.dantia.password
    };

    const response = await dantiaClient.get('/autentificar', {
      params: loginParams,
      headers: { 'x-bypass-token': 'true' }
    });
    const { token, expiresIn } = response.data;

    if (!token) {
      console.error('[DantiaService] Respuesta de login inválida (token faltante)');
      return null;
    }

    const effectiveExpiresIn = expiresIn || 3600;
    const marginSeconds = 30;
    sessionCache.expiresAt = Date.now() + (effectiveExpiresIn - marginSeconds) * 1000;
    sessionCache.accessToken = token;

    console.log('[DantiaService] Login exitoso. Token válido por', effectiveExpiresIn, 'segundos');
    return token;

  } catch (error) {
    console.error('[DantiaService] Error en login:', error.message);
    return null;
  } finally {
    sessionCache.isLoggingIn = false;
  }
}

export async function ensureValidSession() {
  const now = Date.now();
  const isValid = !!sessionCache.accessToken && sessionCache.expiresAt > now;

  if (isValid) {
    return sessionCache.accessToken;
  }

  console.log('[DantiaService] Token no válido o expirado. Refrescando sesión...');
  const token = await login();
  if (!token) {
    console.error('[DantiaService] No se pudo obtener token de sesión');
    return null;
  }
  return token;
}

dantiaClient.interceptors.request.use(
  async (config) => {
    if (config.headers['x-bypass-token']) {
      return config;
    }
    const accessToken = await ensureValidSession();
    if (!accessToken) {
      console.warn('[DantiaService] No hay token válido - la request puede fallar');
    }
    config.headers['x-access-token'] = accessToken || '';
    return config;
  },
  (error) => Promise.reject(error)
);

export async function queryArticles(options = {}) {
  const { page = 1, count = 50, where = 'CodigoEmpresa=1' } = options;

  try {
    console.log(`[DantiaService] Consultando artículos. WHERE: ${where}`);

    const response = await dantiaClient.get('/adArticulosCatalogo/query', {
      params: { count, page, where },
      timeout: 30000,
      validateStatus: (status) => status < 500
    });

    console.log(`[DantiaService] Response status: ${response.status}`);
    return { data: response.data, error: null };

  } catch (error) {
    console.error('[DantiaService] Error consultando artículos:', error.message);
    console.error('[DantiaService] Error code:', error.code);
    console.error('[DantiaService] Error response:', error.response?.status);
    return { data: { $resources: [] }, error: error.message };
  }
}

export async function getFilterOptions() {
  try {
    console.log('[DantiaService] Obteniendo opciones de filtro de Dantia...');

    const familiasSet = new Set();
    const macetasSet = new Set();
    const alturasSet = new Set();
    const centrosSet = new Set();

    let page = 1;
    const maxPages = 50;

    for (page = 1; page <= maxPages; page++) {
      const result = await queryArticles({ page, count: 500 });
      const resources = result.data.$resources || [];

      if (resources.length === 0) {
        break;
      }

      for (const article of resources) {
        if (article.Descripcion) familiasSet.add(article.Descripcion);
        if (article._Maceta) macetasSet.add(article._Maceta);
        if (article._Altura) alturasSet.add(article._Altura);
        if (article._Centro) centrosSet.add(article._Centro);
      }

      console.log('[DantiaService] Page', page, '- got', resources.length, 'articles');

      if (resources.length < 500) {
        break;
      }
    }

    const result = {
      familias: Array.from(familiasSet).sort(),
      macetas: Array.from(macetasSet).sort(),
      alturas: Array.from(alturasSet).sort(),
      centros: Array.from(centrosSet).sort()
    };

    console.log('[DantiaService] Total - Familias:', result.familias.length, 'Macetas:', result.macetas.length, 'Alturas:', result.alturas.length, 'Centros:', result.centros.length);

    return result;

  } catch (error) {
    console.error('[DantiaService] Error:', error.message);
    throw error;
  }
}
