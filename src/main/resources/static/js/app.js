/**
 * Punto de entrada del frontend (terminal mainframe 3270).
 * Gestiona el router por hash, reloj en vivo, carga de /api/config,
 * panel PF12 de ayuda/pruebas de timeout, atajos de teclado y línea de estado.
 */
import { crearCliente, TIMEOUT_POR_DEFECTO_MS } from './api.js';
import {
    campo,
    el,
    limpiarErroresFormulario,
    mostrarErroresFormulario,
    vaciar,
} from './ui.js';
import { parsearEntero, validarDemora } from './validacion.js';
import { montarCuenta } from './vistas/cuenta.js';
import { montarCuentas } from './vistas/cuentas.js';
import { montarCredito } from './vistas/credito.js';
import { montarTransferencia } from './vistas/transferencia.js';

const cliente = crearCliente();

const elReloj = document.getElementById('reloj');
const elBannerOffline = document.getElementById('banner-offline');
const elBadgeSim = document.getElementById('badge-sim');
const elVista = document.getElementById('vista');
const elEstadoTexto = document.getElementById('estado-texto');
const elEstadoCaja = document.getElementById('barra-estado');
const elPanelAyuda = document.getElementById('panel-ayuda');
const elBtnAyuda = document.getElementById('pf-ayuda');
const navLinks = [...document.querySelectorAll('[data-nav]')];

let configServidor = null;
let desmontarVista = null;
let ayudaAbierta = false;

const simulacion = {
    demoraMs: 0,
    timeoutClienteMs: 0,
};

const app = {
    cliente,
    setEstado(nivel, texto) {
        elEstadoTexto.textContent = texto;
        elEstadoCaja.dataset.nivel = nivel;
    },
    irA(hash) {
        window.location.hash = hash;
    },
    obtenerSimulacion() {
        if (!configServidor?.simulacionDemoraHabilitada) {
            return { demoraMs: 0, timeoutClienteMs: 0 };
        }
        return { ...simulacion };
    },
};

// ---------------------------------------------------------------- Reloj 3270

function actualizarReloj() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    elReloj.textContent = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
        + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
actualizarReloj();
setInterval(actualizarReloj, 1000);

// ----------------------------------------------------------- Banner offline

function renderBannerOffline(mostrar, detalle = '') {
    vaciar(elBannerOffline);
    elBannerOffline.hidden = !mostrar;
    if (!mostrar) {
        return;
    }
    elBannerOffline.appendChild(el('div', { class: 'banner-offline-interno', role: 'alert' },
        el('div', {},
            el('strong', {}, '*** MAINFRAME NO DISPONIBLE *** '),
            el('span', {}, detalle || `No se pudo leer /api/config. Usando timeout por defecto (${TIMEOUT_POR_DEFECTO_MS} ms).`),
        ),
        el('button', {
            type: 'button',
            class: 'btn btn-ambar btn-chico',
            onClick: () => cargarConfig(true),
        }, 'REINTENTAR CONEXIÓN'),
    ));
}

// --------------------------------------------------------- Badge simulación

function actualizarBadgeSimulacion() {
    vaciar(elBadgeSim);
    const activa = configServidor?.simulacionDemoraHabilitada
        && (simulacion.demoraMs > 0 || simulacion.timeoutClienteMs > 0);
    elBadgeSim.hidden = !activa;
    if (!activa) {
        return;
    }
    const partes = [];
    if (simulacion.demoraMs > 0) {
        partes.push(`DEMORA ${simulacion.demoraMs}ms`);
    }
    if (simulacion.timeoutClienteMs > 0) {
        partes.push(`TIMEOUT CLI ${simulacion.timeoutClienteMs}ms`);
    }
    elBadgeSim.append(
        el('span', { class: 'badge-sim-texto' }, `SIM: ${partes.join(' · ')}`),
        el('button', {
            type: 'button',
            class: 'btn-texto',
            title: 'Desactivar simulación de demora/timeout',
            onClick: () => {
                simulacion.demoraMs = 0;
                simulacion.timeoutClienteMs = 0;
                actualizarBadgeSimulacion();
                if (ayudaAbierta) {
                    renderPanelAyuda();
                }
                app.setEstado('OK', 'RC=0000 SIMULACIÓN DESACTIVADA');
            },
        }, '[RESET]'),
    );
}

// ------------------------------------------------------- Panel PF12 / Ayuda

function alternarAyuda(forzarEstado) {
    ayudaAbierta = typeof forzarEstado === 'boolean' ? forzarEstado : !ayudaAbierta;
    elPanelAyuda.hidden = !ayudaAbierta;
    elBtnAyuda.setAttribute('aria-expanded', String(ayudaAbierta));
    elBtnAyuda.classList.toggle('pf-activo', ayudaAbierta);
    if (ayudaAbierta) {
        renderPanelAyuda();
    }
}

function renderPanelAyuda() {
    vaciar(elPanelAyuda);

    const cfg = configServidor;
    const infoConfig = el('dl', { class: 'recibo-grid' },
        el('dt', {}, 'TIMEOUT COBOL'),
        el('dd', {}, cfg ? `${cfg.timeoutCobolMs} ms` : 'Desconocido (offline)'),
        el('dt', {}, 'TIMEOUT OPERACIÓN'),
        el('dd', {}, cfg ? `${cfg.timeoutOperacionMs} ms` : 'Desconocido (offline)'),
        el('dt', {}, 'TIMEOUT CLIENTE'),
        el('dd', { class: 'txt-ambar' }, `${cliente.timeoutMs} ms` + (cfg ? ' (operación + 1000 ms)' : ' (por defecto)')),
        el('dt', {}, 'IDEMPOTENCIA'),
        el('dd', {}, cfg?.headerIdempotencia ?? 'X-Idempotency-Key'),
        el('dt', {}, 'SIMULACIÓN DEMORA'),
        el('dd', {}, cfg
            ? (cfg.simulacionDemoraHabilitada ? `HABILITADA (máx. ${cfg.demoraMaximaMs} ms)` : 'DESHABILITADA')
            : 'No disponible'),
    );

    let bloqueSim = null;
    if (cfg?.simulacionDemoraHabilitada) {
        const fDemora = campo({
            id: 'sim-demora',
            name: 'demora',
            label: `${cfg.headerDemora} (ms):`,
            value: simulacion.demoraMs > 0 ? String(simulacion.demoraMs) : '',
            placeholder: `0 .. ${cfg.demoraMaximaMs}`,
            inputmode: 'numeric',
            ayuda: `Retrasa la llamada COBOL en el servidor (vacío o 0 = normal). Timeout COBOL: ${cfg.timeoutCobolMs} ms.`,
        });
        const fTimeoutCli = campo({
            id: 'sim-timeout-cli',
            name: 'timeoutCliente',
            label: 'TIMEOUT CLI (ms):',
            value: simulacion.timeoutClienteMs > 0 ? String(simulacion.timeoutClienteMs) : '',
            placeholder: `Normal (${cliente.timeoutMs} ms)`,
            inputmode: 'numeric',
            ayuda: 'Opcional: recorta el timeout del navegador para probar TIMEOUT_CLIENTE e idempotencia (mín. 100 ms).',
        });

        const aplicar = (demora, timeoutCli, mensaje) => {
            simulacion.demoraMs = demora;
            simulacion.timeoutClienteMs = timeoutCli;
            actualizarBadgeSimulacion();
            renderPanelAyuda();
            app.setEstado('OK', mensaje);
        };

        const formSim = el('form', { class: 'formulario', novalidate: true },
            fDemora.fila,
            fTimeoutCli.fila,
            el('div', { class: 'form-acciones' },
                el('button', { type: 'submit', class: 'btn btn-ambar' }, 'APLICAR PRUEBA'),
                el('button', {
                    type: 'button',
                    class: 'btn btn-secundario',
                    onClick: () => aplicar(0, 0, 'RC=0000 MODO NORMAL RESTAURADO'),
                }, 'NORMAL (0 ms)'),
                el('button', {
                    type: 'button',
                    class: 'btn btn-secundario',
                    onClick: () => aplicar(Math.min(2000, cfg.demoraMaximaMs), 0, 'RC=0000 DEMORA 2000 ms (PROBAR CANCELAR)'),
                }, 'LENTO 2000ms'),
                el('button', {
                    type: 'button',
                    class: 'btn btn-secundario',
                    onClick: () => aplicar(Math.min(cfg.timeoutCobolMs + 1000, cfg.demoraMaximaMs), 0,
                        'RC=0000 DEMORA PARA PROVOCAR 504 TIMEOUT_COBOL'),
                }, 'FORZAR 504 COBOL'),
                el('button', {
                    type: 'button',
                    class: 'btn btn-secundario',
                    onClick: () => aplicar(Math.min(2000, cfg.demoraMaximaMs), 800,
                        'RC=0000 PRUEBA TIMEOUT CLIENTE + REINTENTO IDEMPOTENTE'),
                }, 'TIMEOUT CLIENTE + IDEMP.'),
            ),
        );

        formSim.addEventListener('submit', (ev) => {
            ev.preventDefault();
            const valDem = validarDemora(fDemora.input.value, cfg.demoraMaximaMs);
            const errores = { ...valDem.errores };
            let tCli = 0;
            const rawCli = fTimeoutCli.input.value.trim();
            if (rawCli !== '') {
                const parsed = parsearEntero(rawCli);
                if (Number.isNaN(parsed) || parsed < 100 || parsed > 60000) {
                    errores.timeoutCliente = 'Ingrese un entero entre 100 y 60000 ms (o deje vacío)';
                } else {
                    tCli = parsed;
                }
            }
            if (Object.keys(errores).length > 0) {
                mostrarErroresFormulario(formSim, errores);
                return;
            }
            limpiarErroresFormulario(formSim);
            aplicar(valDem.valor, tCli, 'RC=0000 PARÁMETROS DE PRUEBA ACTUALIZADOS');
        });

        bloqueSim = el('div', { class: 'ayuda-bloque' },
            el('h3', {}, 'MODO PRUEBAS DE TIMEOUTS'),
            formSim,
        );
    }

    const bloqueLeyenda = el('div', { class: 'ayuda-bloque' },
        el('h3', {}, 'ATAJOS Y CÓDIGOS COBOL'),
        el('dl', { class: 'recibo-grid' },
            el('dt', {}, 'ALT+1 / PF1'), el('dd', {}, 'Directorio y apertura de cuentas'),
            el('dt', {}, 'ALT+2 / PF2'), el('dd', {}, 'Transferencia entre cuentas'),
            el('dt', {}, 'ALT+3 / PF3'), el('dd', {}, 'Simulador de crédito (sistema francés)'),
            el('dt', {}, 'ALT+4 / PF12'), el('dd', {}, 'Abrir / cerrar este panel de ayuda y pruebas'),
            el('dt', {}, 'ESC'), el('dd', {}, 'Cancelar petición en curso o cerrar este panel'),
            el('dt', {}, 'RC=0000'), el('dd', {}, 'Operación exitosa'),
            el('dt', {}, 'RC=0001'), el('dd', {}, 'Monto inválido (o saldo 0 en abono de interés)'),
            el('dt', {}, 'RC=0002'), el('dd', {}, 'Fondos insuficientes (COBOL impide sobregiro)'),
            el('dt', {}, 'RC=0003'), el('dd', {}, 'Parámetro fuera de rango (tasa, días o plazo)'),
        ),
    );

    elPanelAyuda.appendChild(el('div', { class: 'panel panel-ayuda-contenido' },
        el('div', { class: 'panel-cabecera' },
            el('h2', {}, 'PF12 · CONFIGURACIÓN DEL MAINFRAME Y PRUEBAS DE TIMEOUT'),
            el('button', {
                type: 'button',
                class: 'btn btn-secundario btn-chico',
                onClick: () => alternarAyuda(false),
            }, 'CERRAR [ESC]'),
        ),
        el('div', { class: 'grid-ayuda' },
            el('div', { class: 'ayuda-bloque' }, el('h3', {}, 'PARÁMETROS DEL SERVIDOR'), infoConfig),
            bloqueSim,
            bloqueLeyenda,
        ),
    ));
}

elBtnAyuda.addEventListener('click', () => alternarAyuda());

// ------------------------------------------------------------------- Router

function decodificarSeguro(texto) {
    try {
        return decodeURIComponent(texto);
    } catch {
        return texto;
    }
}

function marcarNavegacion(clave) {
    for (const a of navLinks) {
        const activo = a.dataset.nav === clave;
        a.classList.toggle('pf-activo', activo);
        if (activo) {
            a.setAttribute('aria-current', 'page');
        } else {
            a.removeAttribute('aria-current');
        }
    }
}

function navegar() {
    if (desmontarVista) {
        desmontarVista();
        desmontarVista = null;
    }

    const bruto = (window.location.hash || '').replace(/^#/, '');
    const [ruta, consulta = ''] = bruto.split('?');
    const params = new URLSearchParams(consulta);

    if (ruta === '/cuentas') {
        marcarNavegacion('cuentas');
        desmontarVista = montarCuentas(elVista, app);
        return;
    }
    const mCuenta = /^\/cuenta\/([^/]+)$/.exec(ruta);
    if (mCuenta) {
        marcarNavegacion('cuentas');
        desmontarVista = montarCuenta(elVista, app, decodificarSeguro(mCuenta[1]));
        return;
    }
    if (ruta === '/transferir') {
        marcarNavegacion('transferir');
        desmontarVista = montarTransferencia(elVista, app, { origenInicial: params.get('origen') ?? '' });
        return;
    }
    if (ruta === '/credito') {
        marcarNavegacion('credito');
        desmontarVista = montarCredito(elVista, app);
        return;
    }

    // Ruta vacía o desconocida → #/cuentas
    window.location.replace('#/cuentas');
}

// -------------------------------------------------------- Atajos de teclado

window.addEventListener('keydown', (ev) => {
    if (ev.altKey && !ev.ctrlKey && !ev.metaKey) {
        if (ev.key === '1') {
            ev.preventDefault();
            app.irA('#/cuentas');
        } else if (ev.key === '2') {
            ev.preventDefault();
            app.irA('#/transferir');
        } else if (ev.key === '3') {
            ev.preventDefault();
            app.irA('#/credito');
        } else if (ev.key === '4' || ev.key.toLowerCase() === 'h') {
            ev.preventDefault();
            alternarAyuda();
        }
    } else if (ev.key === 'Escape' && ayudaAbierta) {
        alternarAyuda(false);
    }
});

// ----------------------------------------------------------------- Arranque

async function cargarConfig(refrescarVista = false) {
    try {
        configServidor = await cliente.cargarConfig();
        renderBannerOffline(false);
        actualizarBadgeSimulacion();
        if (ayudaAbierta) {
            renderPanelAyuda();
        }
        if (refrescarVista) {
            navegar();
        }
    } catch {
        configServidor = null;
        renderBannerOffline(true);
        actualizarBadgeSimulacion();
        if (ayudaAbierta) {
            renderPanelAyuda();
        }
    }
}

window.addEventListener('hashchange', navegar);

// Cargar /api/config y montar la vista inicial.
cargarConfig(false).finally(() => {
    navegar();
});
