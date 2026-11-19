/**
 * Vista #/transferir — Transferencia atómica entre cuentas (programa COBOL transferir).
 * Permite elegir cuentas de la lista o escribirlas a mano, muestra resumen antes de
 * confirmar y presenta ambos saldos en el comprobante.
 */
import { rutas } from '../api.js';
import { formatoPesos } from '../formato.js';
import {
    campo,
    crearControlOperacion,
    el,
    limpiarErroresFormulario,
    mostrarErroresFormulario,
    renderComprobanteOperacion,
    renderError,
    vaciar,
} from '../ui.js';
import { validarTransferencia } from '../validacion.js';

export function montarTransferencia(contenedor, app, { origenInicial = '' } = {}) {
    let seq = 0;
    let ctrlCarga = null;
    let destruido = false;
    let cuentasMap = new Map();
    let pendiente = null; // payload validado esperando confirmación

    const datalist = el('datalist', { id: 'datalist-cuentas' });

    const fOrigen = campo({
        id: 'tr-origen',
        name: 'cuentaOrigen',
        label: 'CUENTA ORIGEN ..:',
        value: origenInicial,
        placeholder: '10 dígitos (ej. 1012345678)',
        inputmode: 'numeric',
        maxlength: 10,
        list: 'datalist-cuentas',
    });
    const infoOrigen = el('div', { class: 'cuenta-vista-previa' });

    const fDestino = campo({
        id: 'tr-destino',
        name: 'cuentaDestino',
        label: 'CUENTA DESTINO .:',
        placeholder: '10 dígitos distinta de origen',
        inputmode: 'numeric',
        maxlength: 10,
        list: 'datalist-cuentas',
    });
    const infoDestino = el('div', { class: 'cuenta-vista-previa' });

    const fMonto = campo({
        id: 'tr-monto',
        name: 'monto',
        label: 'MONTO ..........:',
        placeholder: 'Ej. 120 o 120,50',
        inputmode: 'decimal',
        ayuda: 'Pesos (> 0, máx. 2 decimales). Débito y crédito atómicos en COBOL.',
    });

    const zonaConfirmacion = el('div', { class: 'zona-confirmacion', 'aria-live': 'polite' });
    const zonaResultado = el('div', { class: 'zona-resultado', 'aria-live': 'polite' });
    const controlOp = crearControlOperacion(app, zonaResultado);

    const form = el('form', { class: 'formulario', novalidate: true },
        datalist,
        fOrigen.fila,
        infoOrigen,
        fDestino.fila,
        infoDestino,
        fMonto.fila,
        el('div', { class: 'form-acciones' },
            el('button', { type: 'submit', class: 'btn btn-primario' }, 'VERIFICAR TRANSFERENCIA [ENTER]'),
        ),
    );

    function actualizarVistaPrevia() {
        const cOri = cuentasMap.get(fOrigen.input.value.trim());
        const cDes = cuentasMap.get(fDestino.input.value.trim());
        infoOrigen.textContent = cOri ? `↳ ${cOri.titular} · Saldo actual: ${formatoPesos(cOri.saldo)}` : '';
        infoDestino.textContent = cDes ? `↳ ${cDes.titular} · Saldo actual: ${formatoPesos(cDes.saldo)}` : '';
    }

    function cancelarConfirmacion() {
        pendiente = null;
        vaciar(zonaConfirmacion);
    }

    form.addEventListener('input', () => {
        actualizarVistaPrevia();
        if (pendiente) {
            cancelarConfirmacion();
        }
    });

    function mostrarConfirmacion(datos) {
        pendiente = datos;
        const cOri = cuentasMap.get(datos.cuentaOrigen);
        const cDes = cuentasMap.get(datos.cuentaDestino);

        const btnConfirmar = el('button', {
            type: 'button',
            class: 'btn btn-ambar',
            onClick: () => ejecutarTransferencia(datos),
        }, 'CONFIRMAR Y TRANSFERIR');

        const btnModificar = el('button', {
            type: 'button',
            class: 'btn btn-secundario',
            onClick: () => {
                cancelarConfirmacion();
                fMonto.input.focus();
            },
        }, 'MODIFICAR');

        vaciar(zonaConfirmacion);
        zonaConfirmacion.appendChild(el('div', { class: 'panel-aviso panel-incierto', role: 'region', 'aria-label': 'Confirmación de transferencia' },
            el('div', { class: 'aviso-cabecera' },
                el('span', { class: 'badge-rc' }, 'CONFIRMAR'),
                el('strong', {}, 'VERIFIQUE LOS DATOS ANTES DE ENVIAR A COBOL'),
            ),
            el('dl', { class: 'recibo-grid' },
                el('dt', {}, 'ORIGEN'),
                el('dd', {}, cOri ? `${datos.cuentaOrigen} — ${cOri.titular}` : datos.cuentaOrigen),
                el('dt', {}, 'DESTINO'),
                el('dd', {}, cDes ? `${datos.cuentaDestino} — ${cDes.titular}` : datos.cuentaDestino),
                el('dt', {}, 'MONTO'),
                el('dd', { class: 'txt-ambar' }, formatoPesos(datos.monto)),
            ),
            el('div', { class: 'aviso-acciones' }, btnConfirmar, btnModificar),
        ));
        btnConfirmar.focus();
    }

    function ejecutarTransferencia(datos) {
        if (controlOp.enCurso) {
            return;
        }
        cancelarConfirmacion();
        const op = app.cliente.operacion(rutas.transferencias, datos);
        controlOp.ejecutar({
            form,
            operacion: op,
            contexto: 'transferencia',
            titulo: 'TRANSFERENCIA COBOL',
            onExito: (res, dest) => {
                dest.appendChild(renderComprobanteOperacion(res, { enlaceDestino: true }));
                dest.appendChild(el('div', { class: 'aviso-acciones' },
                    el('a', { href: `#/cuenta/${encodeURIComponent(res.cuenta)}`, class: 'btn btn-secundario' },
                        `VER ORIGEN (${res.cuenta})`),
                    res.cuentaDestino ? el('a', {
                        href: `#/cuenta/${encodeURIComponent(res.cuentaDestino)}`,
                        class: 'btn btn-secundario',
                    }, `VER DESTINO (${res.cuentaDestino})`) : null,
                ));
                fMonto.input.value = '';
                cargarCuentas(false);
            },
        });
    }

    form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (controlOp.enCurso) {
            return;
        }
        const val = validarTransferencia({
            cuentaOrigen: fOrigen.input.value,
            cuentaDestino: fDestino.input.value,
            monto: fMonto.input.value,
        });
        if (!val.ok) {
            cancelarConfirmacion();
            mostrarErroresFormulario(form, val.errores);
            app.setEstado('WARN', 'RC=0400 REVISE LOS DATOS DE LA TRANSFERENCIA');
            return;
        }
        limpiarErroresFormulario(form);
        vaciar(zonaResultado);
        mostrarConfirmacion(val.valor);
        app.setEstado('OK', 'RC=0000 VERIFIQUE EL RESUMEN Y CONFIRME');
    });

    const panelForm = el('section', { class: 'panel', 'aria-labelledby': 'tit-tr' },
        el('div', { class: 'panel-cabecera' },
            el('h2', { id: 'tit-tr' }, 'ORDEN DE TRANSFERENCIA'),
            el('span', { class: 'panel-meta' }, 'POST /api/transferencias'),
        ),
        form,
        zonaConfirmacion,
        zonaResultado,
    );

    // Panel auxiliar de cuentas disponibles para selección rápida
    const zonaRefCuentas = el('div', { class: 'tabla-scroll', 'aria-live': 'polite' });
    const btnRefrescar = el('button', {
        type: 'button',
        class: 'btn btn-secundario',
        onClick: () => cargarCuentas(true),
    }, 'REFRESCAR');

    const panelRef = el('section', { class: 'panel', 'aria-labelledby': 'tit-ref' },
        el('div', { class: 'panel-cabecera' },
            el('h2', { id: 'tit-ref' }, 'CUENTAS DISPONIBLES'),
            btnRefrescar,
        ),
        zonaRefCuentas,
    );

    vaciar(contenedor);
    contenedor.appendChild(el('div', { class: 'grid-principal' }, panelForm, panelRef));

    async function cargarCuentas(mostrarEstado) {
        ctrlCarga?.abort();
        ctrlCarga = new AbortController();
        const turno = ++seq;
        btnRefrescar.disabled = true;

        if (mostrarEstado) {
            vaciar(zonaRefCuentas);
            zonaRefCuentas.appendChild(el('p', { class: 'estado-carga' }, 'CARGANDO CUENTAS...'));
        }
        try {
            const lista = await app.cliente.get(rutas.cuentas, { signal: ctrlCarga.signal });
            if (destruido || turno !== seq) {
                return;
            }
            cuentasMap = new Map(lista.map((c) => [c.numero, c]));
            vaciar(datalist);
            for (const c of lista) {
                datalist.appendChild(el('option', { value: c.numero }, `${c.titular} — ${formatoPesos(c.saldo)}`));
            }
            renderReferencia(lista);
            actualizarVistaPrevia();
            if (mostrarEstado) {
                app.setEstado('OK', 'RC=0000 READY · INGRESE ORIGEN, DESTINO Y MONTO');
            }
        } catch (err) {
            if (destruido || turno !== seq) {
                return;
            }
            vaciar(zonaRefCuentas);
            zonaRefCuentas.appendChild(renderError(err, { onReintentar: () => cargarCuentas(true) }));
        } finally {
            if (!destruido && turno === seq) {
                btnRefrescar.disabled = false;
            }
        }
    }

    function renderReferencia(lista) {
        vaciar(zonaRefCuentas);
        if (lista.length === 0) {
            zonaRefCuentas.appendChild(el('div', { class: 'estado-vacio' },
                '*** NO HAY CUENTAS REGISTRADAS ***',
                el('p', { class: 'estado-vacio-sub' }, 'Abra al menos dos cuentas en PF1 CUENTAS.'),
            ));
            return;
        }
        zonaRefCuentas.appendChild(el('table', { class: 'tabla-terminal' },
            el('thead', {},
                el('tr', {},
                    el('th', {}, 'CUENTA'),
                    el('th', {}, 'TITULAR'),
                    el('th', { class: 'num' }, 'SALDO'),
                    el('th', { class: 'col-accion' }, 'USAR'),
                ),
            ),
            el('tbody', {},
                lista.map((c) => el('tr', {},
                    el('td', {}, c.numero),
                    el('td', {}, c.titular),
                    el('td', { class: 'num txt-ambar' }, formatoPesos(c.saldo)),
                    el('td', { class: 'col-accion' },
                        el('div', { class: 'botones-linea' },
                            el('button', {
                                type: 'button',
                                class: 'btn btn-chico',
                                onClick: () => {
                                    fOrigen.input.value = c.numero;
                                    cancelarConfirmacion();
                                    actualizarVistaPrevia();
                                },
                            }, 'ORIG'),
                            el('button', {
                                type: 'button',
                                class: 'btn btn-chico',
                                onClick: () => {
                                    fDestino.input.value = c.numero;
                                    cancelarConfirmacion();
                                    actualizarVistaPrevia();
                                },
                            }, 'DEST'),
                        ),
                    ),
                )),
            ),
        ));
    }

    cargarCuentas(true);

    return () => {
        destruido = true;
        ctrlCarga?.abort();
        controlOp.destruir();
    };
}
