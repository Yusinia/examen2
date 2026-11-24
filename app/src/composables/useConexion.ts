import { ref } from 'vue';
import { onUnmounted } from 'vue';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Network, type ConnectionStatus } from '@capacitor/network';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * TODO [M7] Capacidades nativas (6 pts en total: este archivo, PerfilPage.vue y AndroidManifest.xml).
 *
 * useConexion() devuelve { conectado, tipo }:
 *   - Valor inicial con Network.getStatus()                       (@capacitor/network)
 *   - Se actualiza solo con Network.addListener('networkStatusChange', ...)
 *   - El oyente se libera (handle.remove()) cuando se destruye la página que lo usa (onUnmounted).
 *   Las páginas Equipos y Formulario ya muestran el aviso "Sin conexión" y deshabilitan Guardar con `conectado`.
 */
export function useConexion() {
  const conectado = ref(true);
  const tipo = ref('unknown');
  // TODO [M7]
  let handle: PluginListenerHandle | undefined;
  let desmontado = false;
  let huboCambio = false;

  function actualizar(estado: ConnectionStatus) {
    conectado.value = estado.connected;
    tipo.value = estado.connectionType;
  }

  async function iniciar() {
    handle = await Network.addListener('networkStatusChange', (estado) => {
      huboCambio = true;
      if (!desmontado) actualizar(estado);
    });

    if (desmontado) {
      await handle.remove();
      return;
    }

    const estadoInicial = await Network.getStatus();
    if (!desmontado && !huboCambio) actualizar(estadoInicial);
  }

  onUnmounted(() => {
    desmontado = true;
    void handle?.remove().catch((error) => {
      console.warn('No fue posible liberar el listener de red.', error);
    });
  });

  void iniciar().catch((error) => {
    console.warn('No fue posible consultar el estado de red.', error);
  });

  return { conectado, tipo };
}

/**
 * TODO [M7] vibrar(): vibración breve de confirmación con Haptics.impact({ style: ImpactStyle.Light })
 *   (@capacitor/haptics). En el navegador NO debe hacer nada: use Capacitor.isNativePlatform().
 *   Se llama después de guardar y de eliminar con éxito.
 */
export async function vibrar() {
  // TODO [M7]
  if (!Capacitor.isNativePlatform()) return;

  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (error) {
    console.warn('No fue posible activar la vibración.', error);
  }
}