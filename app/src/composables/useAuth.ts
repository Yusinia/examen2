import { computed, ref } from 'vue';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Device } from '@capacitor/device';
import { api } from '@/services/api';
import { Capacitor } from '@capacitor/core';

export interface Usuario { id: number; nombre: string }

const CLAVE_TOKEN = 'token';
const CLAVE_USUARIO = 'usuario';

// Estado compartido por toda la app (fuera de la función = un solo valor) — YA IMPLEMENTADO
const token = ref<string | null>(null);
const usuario = ref<Usuario | null>(null);
let tokenCargado = false;
let cargaInicial: Promise<void> | undefined;

/** YA IMPLEMENTADO — lo usa services/api.ts para armar el encabezado Authorization. */
export const obtenerToken = () => token.value;

/**
 * TODO [M2] Sesión segura (10 pts en total para este archivo).
 *
 * El token y el usuario se guardan con SecureStorage (@aparajita/capacitor-secure-storage):
 * Keystore en Android, Keychain en iOS.  NO use localStorage ni @capacitor/preferences.
 *   await SecureStorage.set(clave, valor)   ·   await SecureStorage.get(clave)   ·   await SecureStorage.remove(clave)
 */

/** TODO [M2] Borrar token y usuario de la memoria (refs) y del almacenamiento cifrado. */
export async function olvidarSesion() {
  // TODO [M2]
  token.value = null;
  usuario.value = null;

  if (Capacitor.isNativePlatform()) {
    await Promise.all([
      SecureStorage.remove(CLAVE_TOKEN),
      SecureStorage.remove(CLAVE_USUARIO),
    ]);
  }
}

export function useAuth() {
  const estaAutenticado = computed(() => token.value !== null);

  /**
   * TODO [M2] login(email, password)
   *  1. device_name = `${plataforma} ${modelo}` usando Device.getInfo() (máx. 60 caracteres).
   *  2. POST /login con { email, password, device_name } usando api().
   *     Respuesta 200: { token: "1|abc...", usuario: { id, nombre } }   ·   Error: 422 con errors.email
   *  3. Guardar token y usuario en los refs y en SecureStorage.
   *  No atrape el error: LoginPage.vue ya muestra los 422.
   */
  async function login(email: string, password: string) {
    const info = await Device.getInfo();
    const device_name = `${info.platform} ${info.model}`.slice(0, 60);
    const sesion = await api<{ token: string; usuario: Usuario }>('/login', {
      method: 'POST',
      body: { email, password, device_name },
    });

    if (Capacitor.isNativePlatform()) {
      try {
        await SecureStorage.set(CLAVE_USUARIO, { ...sesion.usuario });
        await SecureStorage.set(CLAVE_TOKEN, sesion.token);
      } catch (error) {
        await olvidarSesion();
        throw error;
      }
    }

    token.value = sesion.token;
    usuario.value = sesion.usuario;
  }

  /**
   * TODO [M2] cargarToken()
   *  Al abrir la app, recupera token y usuario de SecureStorage y los pone en los refs.
   *  Debe ejecutarse una sola vez (use la bandera tokenCargado).
   */
  async function cargarToken() {
    if (tokenCargado) return cargaInicial;
    tokenCargado = true;

    cargaInicial = (async () => {
      if (!Capacitor.isNativePlatform()) return;

      try {
        const [tokenGuardado, usuarioGuardado] = await Promise.all([
          SecureStorage.get(CLAVE_TOKEN),
          SecureStorage.get(CLAVE_USUARIO),
        ]);

        if (
          typeof tokenGuardado === 'string' &&
          tokenGuardado &&
          usuarioGuardado &&
          typeof usuarioGuardado === 'object' &&
          'id' in usuarioGuardado &&
          typeof usuarioGuardado.id === 'number' &&
          'nombre' in usuarioGuardado &&
          typeof usuarioGuardado.nombre === 'string'
        ) {
          token.value = tokenGuardado;
          usuario.value = {
            id: usuarioGuardado.id,
            nombre: usuarioGuardado.nombre,
          };
        }
      } catch (error) {
        console.warn('No fue posible restaurar la sesión guardada.', error);
      }
    })();

    return cargaInicial;
  }

  /**
   * TODO [M2] cerrarSesion()
   *  POST /logout para revocar el token en el servidor y SIEMPRE borrar la sesión local,
   *  aunque la API falle (sin red o token vencido).
   */
  async function cerrarSesion() {
    // TODO [M2]
    try {
      await api('/logout', { method: 'POST' });
    } catch (error) {
      console.warn('No fue posible revocar el token.', error);
    } finally {
      try {
        await olvidarSesion();
      } catch (error) {
        console.warn('No fue posible borrar la sesión guardada.', error);
      }
    }
  }

  return { usuario, estaAutenticado, login, cargarToken, cerrarSesion };
}