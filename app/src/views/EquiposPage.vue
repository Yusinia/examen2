<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Equipos</ion-title>
        <ion-buttons slot="end">
          <ion-button router-link="/tabs/equipos/nuevo" aria-label="Nuevo equipo">
            <ion-icon slot="icon-only" :icon="add" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar v-model="q" :debounce="400" placeholder="Buscar por código o nombre" @ion-input="buscar" />
      </ion-toolbar>
      <!-- YA IMPLEMENTADO: depende de useConexion() [M7] -->
      <ion-toolbar v-if="!conectado" color="warning">
        <ion-title size="small">Sin conexión: los datos pueden estar desactualizados</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!--
        TODO [M4] Listado (10 pts)
          - ion-refresher (slot="fixed") que vuelve a la página 1.
          - Mientras carga la primera página: ion-skeleton-text (no un spinner a pantalla completa).
          - Si falla la carga: mensaje + botón "Reintentar".
          - Si no hay resultados: estado vacío (use la clase .estado-vacio de theme/variables.css).
          - ion-list con un ion-item por equipo: nombre, "código · categoría", ion-badge con el estado
            (colorEstado) y router-link a /tabs/equipos/{id}/editar.
          - ion-infinite-scroll que pide la siguiente página; se deshabilita cuando no hay más
            (meta.current_page / meta.last_page).

        TODO [M6] Eliminación (8 pts)
          - Envuelva cada ion-item en ion-item-sliding con un ion-item-option "Eliminar" (color danger).
      -->
      <ion-refresher slot="fixed" @ion-refresh="refrescar">
        <ion-refresher-content />
      </ion-refresher>

      <ion-list v-if="cargando && pagina === 0" aria-label="Cargando equipos">
        <ion-item v-for="fila in 5" :key="fila">
          <ion-label>
            <ion-skeleton-text animated style="width: 65%" />
            <ion-skeleton-text animated style="width: 40%" />
          </ion-label>
        </ion-item>
      </ion-list>

      <div v-else-if="!error && equipos.length === 0" class="estado-vacio">
        <ion-icon :icon="searchOutline" aria-hidden="true" />
        <p>{{ q ? 'No se encontraron equipos para esta búsqueda.' : 'No hay equipos registrados.' }}</p>
      </div>

      <ion-list v-if="equipos.length">
        <ion-item-sliding v-for="equipo in equipos" :key="equipo.id">
          <ion-item :router-link="`/tabs/equipos/${equipo.id}/editar`">
            <ion-label>
              <h2>{{ equipo.nombre }}</h2>
              <p>{{ equipo.codigo }} · {{ equipo.categoria.nombre }}</p>
            </ion-label>
            <ion-badge slot="end" :color="colorEstado[equipo.estado]">
              {{ equipo.estado }}
            </ion-badge>
          </ion-item>
          <ion-item-options side="end">
            <ion-item-option color="danger" @click="confirmarEliminacion(equipo, $event)">
              <ion-icon slot="start" :icon="trashOutline" />
              Eliminar
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </ion-list>

      <div v-if="error" class="estado-vacio" role="alert">
        <ion-icon :icon="cloudOfflineOutline" aria-hidden="true" />
        <p>{{ error }}</p>
        <ion-button fill="outline" @click="cargar(pagina === 0)">Reintentar</ion-button>
      </div>

      <ion-infinite-scroll :disabled="!hayMas || pagina === 0 || !!error" @ion-infinite="cargarMas">
        <ion-infinite-scroll-content loading-text="Cargando más equipos…" />
      </ion-infinite-scroll>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonSearchbar, IonContent,
  IonRefresher, IonRefresherContent, IonList, IonItem, IonLabel, IonSkeletonText, IonBadge,
  IonItemSliding, IonItemOptions, IonItemOption, IonInfiniteScroll, IonInfiniteScrollContent,
  alertController, onIonViewWillEnter,
} from '@ionic/vue';
import type { InfiniteScrollCustomEvent, RefresherCustomEvent, SearchbarCustomEvent } from '@ionic/vue';
import { add, cloudOfflineOutline, searchOutline, trashOutline } from 'ionicons/icons';
import { eliminar, listar, type Equipo, type Estado } from '@/services/equipos';
import { ErrorApi } from '@/services/errores';
import { mostrarToast } from '@/services/avisos';
import { useConexion, vibrar } from '@/composables/useConexion';

// Importaciones disponibles para su template (evita advertencias mientras no las use)
void [IonRefresher, IonRefresherContent, IonList, IonItem, IonLabel, IonSkeletonText, IonBadge,
  IonItemSliding, IonItemOptions, IonItemOption, IonInfiniteScroll, IonInfiniteScrollContent,
  cloudOfflineOutline, searchOutline, trashOutline];

const colorEstado: Record<Estado, string> = { disponible: 'success', prestado: 'warning', mantenimiento: 'medium' };

const { conectado } = useConexion();

const equipos = ref<Equipo[]>([]);
const pagina = ref(0);
const ultimaPagina = ref(1);
const q = ref('');
const cargando = ref(false);
const error = ref('');
const hayMas = computed(() => pagina.value < ultimaPagina.value);
let solicitudActual = 0;
let eliminacionEnCurso = false;
let revisarPaginaActual = false;
const equiposRetirados = new Set<number>();

/**
 * TODO [M4] cargar(reiniciar)
 *  - reiniciar = true  → pide la página 1 y REEMPLAZA la lista.
 *  - reiniciar = false → pide la página siguiente y la AGREGA al final.
 *  - Use listar(pagina, q) de services/equipos.ts y actualice pagina/ultimaPagina con meta.
 *  - Maneje cargando y error (un 401 ya lo resuelve api.ts).
 */
async function cargar(reiniciar = false) {
  if (!reiniciar && (cargando.value || !hayMas.value || pagina.value === 0)) return;

  const solicitud = ++solicitudActual;
  const paginaPedida = reiniciar ? 1 : pagina.value + 1;
  const filtro = (q.value ?? '').trim();

  if (reiniciar) {
    equipos.value = [];
    pagina.value = 0;
    ultimaPagina.value = 1;
    revisarPaginaActual = false;
    equiposRetirados.clear();
  }

  cargando.value = true;
  error.value = '';

  try {
    const paginaAnterior = !reiniciar && revisarPaginaActual
      ? listar(pagina.value, filtro)
      : undefined;
    revisarPaginaActual = false;

    const [resultado, anterior] = await Promise.all([
      listar(paginaPedida, filtro),
      paginaAnterior,
    ]);

    if (solicitud !== solicitudActual) return;

    const porId = new Map(equipos.value.map((equipo) => [equipo.id, equipo]));

    for (const equipo of [...(anterior?.data ?? []), ...resultado.data]) {
      if (!equiposRetirados.has(equipo.id)) porId.set(equipo.id, equipo);
    }

    equipos.value = [...porId.values()];
    pagina.value = resultado.meta.current_page;
    ultimaPagina.value = resultado.meta.last_page;
  } catch (fallo) {
    if (solicitud !== solicitudActual) return;
    if (!reiniciar) revisarPaginaActual = true;
    if (fallo instanceof ErrorApi && fallo.status === 401) return;

    error.value = fallo instanceof ErrorApi
      ? fallo.message
      : 'No fue posible cargar los equipos.';
  } finally {
    if (solicitud === solicitudActual) cargando.value = false;
  }
}

/**
 * TODO [M4] La lista debe recargarse CADA VEZ que la persona vuelve a esta página
 *           (por ejemplo, al regresar del formulario). Elija el hook de ciclo de vida correcto.
 */
onIonViewWillEnter(() => cargar(true));

const buscar = (evento: SearchbarCustomEvent) => {
  q.value = evento.detail.value ?? '';
  return cargar(true);
};

/** TODO [M4] Recargar desde la página 1 y cerrar el refresher (evento.target.complete()). */
async function refrescar(evento: RefresherCustomEvent) {
  try {
    await cargar(true);
  } finally {
    await evento.target.complete();
  }
}

/** TODO [M4] Cargar la página siguiente y cerrar el infinite scroll (evento.target.complete()). */
async function cargarMas(evento: InfiniteScrollCustomEvent) {
  try {
    await cargar();
  } finally {
    await evento.target.complete();
  }
}

function quitarDeLista(id: number) {
  equiposRetirados.add(id);
  equipos.value = equipos.value.filter((equipo) => equipo.id !== id);
  revisarPaginaActual = true;
}

/**
 * TODO [M6] confirmarEliminacion(equipo, evento)
 *  1. Cierre el ion-item-sliding.
 *  2. alertController con dos botones: role 'cancel' y role 'destructive'.
 *     Lea el role con onDidDismiss(); si no es 'destructive', no haga nada.
 *  3. eliminar(equipo.id):
 *       204 → quitar el equipo de la lista (sin recargar todo), vibrar() y toast de éxito.
 *       409 → toast con el mensaje que envía la API (regla R1: equipo prestado). El equipo sigue en la lista.
 *       404 → quitarlo de la lista y avisar que ya no existe.
 */
async function confirmarEliminacion(equipo: Equipo, evento: Event) {
  if (eliminacionEnCurso) return;
  eliminacionEnCurso = true;

  const opcion = evento.currentTarget as HTMLElement;
  const fila = opcion.closest<HTMLIonItemSlidingElement>('ion-item-sliding');

  try {
    await fila?.close();
    const alerta = await alertController.create({
      header: 'Eliminar equipo',
      message: `¿Desea eliminar el equipo ${equipo.codigo}?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive' },
      ],
    });

    await alerta.present();
    const { role } = await alerta.onDidDismiss();
    if (role !== 'destructive') return;

    await eliminar(equipo.id);
    quitarDeLista(equipo.id);
    await vibrar();
    await mostrarToast('Equipo eliminado.', 'success');
  } catch (fallo) {
    if (fallo instanceof ErrorApi && fallo.status === 404) {
      quitarDeLista(equipo.id);
      await mostrarToast('El equipo ya no existe.', 'warning');
    } else if (fallo instanceof ErrorApi && fallo.status === 409) {
      await mostrarToast(fallo.message, 'warning');
    } else if (!(fallo instanceof ErrorApi && fallo.status === 401)) {
      await mostrarToast('No fue posible eliminar el equipo.', 'danger');
    }
  } finally {
    eliminacionEnCurso = false;
  }
}

void [refrescar, cargarMas, confirmarEliminacion, colorEstado, hayMas];
</script>