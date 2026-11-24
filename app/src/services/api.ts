import { ErrorApi } from './errores';
import { obtenerToken, olvidarSesion } from '@/composables/useAuth';
import router from '@/router';

const BASE_URL = import.meta.env.VITE_API_URL;
const TIEMPO_MAXIMO_MS = 10_000;

export interface OpcionesApi {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

/**
 * TODO [M1] Cliente HTTP único de la aplicación (8 pts).
 *
 * api<T>(ruta, { method, body, params }) debe:
 *  1. Construir la URL como BASE_URL + ruta y agregar como query string solo los params
 *     que tengan valor (ni undefined ni '').           ej. api('/equipos', { params: { page: 2, q: '' } })
 *  2. Enviar siempre "Accept: application/json".
 *  3. Si hay token (obtenerToken()), enviar "Authorization: Bearer <token>". Nunca en la URL.
 *  4. Si hay body, enviarlo como JSON ("Content-Type: application/json" + JSON.stringify).
 *  5. Cancelar la petición si tarda más de TIEMPO_MAXIMO_MS (AbortController).
 *     Si fetch falla sin respuesta (sin red, tiempo agotado, CORS), lanzar
 *     new ErrorApi(0, { mensaje: 'No fue posible conectar con la API.' }).
 *  6. Si la respuesta es 204, devolver null.
 *  7. Si response.ok es false, lanzar new ErrorApi(status, cuerpoJson).
 *     Si el estado es 401 (y la ruta no es /login): await olvidarSesion() y router.replace('/login').
 *  8. En cualquier otro caso, devolver el cuerpo JSON.
 */
export async function api<T = unknown>(ruta: string, opciones: OpcionesApi = {}): Promise<T> {
  const { method = 'GET', body, params = {} } = opciones;
  const url = new URL(BASE_URL.replace(/\/$/, '') + ruta);

  for (const [nombre, valor] of Object.entries(params)) {
    if (valor != null && valor !== '') {
      url.searchParams.set(nombre, String(valor));
    }
  }

  const headers = new Headers({ Accept: 'application/json' });
  const token = obtenerToken();

  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  const controller = new AbortController();
  const temporizador = setTimeout(() => controller.abort(), TIEMPO_MAXIMO_MS);
  let respuesta: Response;
  let cuerpo: unknown;

  try {
    respuesta = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    cuerpo = respuesta.status === 204
      ? null
      : await respuesta.json().catch((error: unknown) => {
          if (controller.signal.aborted) throw error;
          return null;
        });
  } catch {
    throw new ErrorApi(0, { mensaje: 'No fue posible conectar con la API.' });
  } finally {
    clearTimeout(temporizador);
  }

  if (respuesta.status === 401 && ruta !== '/login' && token === obtenerToken()) {
    try {
      await olvidarSesion();
    } catch (error) {
      console.warn('No fue posible borrar la sesión guardada.', error);
    }

    await router.replace('/login');
  }

  if (!respuesta.ok) throw new ErrorApi(respuesta.status, cuerpo);
  return cuerpo as T;
}