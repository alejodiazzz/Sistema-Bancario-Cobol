/**
 * Vista #/cuenta/:numero — Detalle de cuenta, 4 operaciones COBOL
 * (depósito, retiro, interés, comisión) e historial de movimientos.
 */
import { rutas } from '../api.js';
import { codigoRetorno, describirError } from '../errores.js';
import { formatoFecha, formatoPesos, pesosACentavos } from '../formato.js';
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
import { LIMITES, validarComision, validarInteres, validarMonto } from '../validacion.js';

const TIPOS_MOVIMIENTO = {
    APERTURA: { etiqueta: 'APERTURA', signo: '+', clase: 'mov-entrada' },
    DEPOSITO: { etiqueta: 'DEPÓSITO', signo: '+', clase: 'mov-entrada' },
    RETIRO: { etiqueta: 'RETIRO', signo: '−', clase: 'mov-salida' },
    TRANSFERENCIA_ENVIADA: { etiqueta: 'TRANSF. ENVIADA', signo: '−', clase: 'mov-salida' },
    TRANSFERENCIA_RECIBIDA: { etiqueta: 'TRANSF. RECIBIDA', signo: '+', clase: 'mov-entrada' },
    INTERES: { etiqueta: 'INTERÉS', signo: '+', clase: 'mov-entrada' },
    COMISION: { etiqueta: 'COMISIÓN', signo: '−', clase: 'mov-salida' },
};

const PESTANAS = [
    { id: 'deposito', etiqueta: '1. DEPÓSITO', programa: 'depositar' },
    { id: 'retiro', etiqueta: '2. RETIRO', programa: 'retirar' },
    { id: 'interes', etiqueta: '3. INTERÉS', programa: 'abonar_interes' },
    { id: 'comision', etiqueta: '4. COMISIÓN', programa: 'cobrar_comision' },
];

export function montarCuenta(contenedor, app, numero) {
    let seq = 0;
    let ctrlCarga = null;
    let destruido = false;
    let cuentaActual = null;
    let pestanaActiva = 'deposito';

    const zonaEstadoCuenta = el('div', { 'aria-live': 'polite' });
    const zonaContenido = el('div', { class: 'cuenta-contenido' });

    const btnRefrescar = el('button', {
        type: 'button',
        class: 'btn btn-secundario',
        onClick: () => cargarCuenta(true),
    }, 'REFRESCAR');

    const barraSuperior = el('div', { class: 'subbarra' },
        el('a', { href: '#/cuentas', class: 'enlace-terminal' }, '← VOLVER AL DIRECTORIO'),
        el('div', { class: 'panel-acciones' },
            el('a', {
                href: `#/transferir?origen=${encodeURIComponent(numero)}`,
                class: 'btn btn-secundario',
            }, 'TRANSFERIR DESDE AQUÍ'),
            btnRefrescar,
        ),
    );

    // Elementos de la cabecera de saldo (se actualizan al refrescar)
    const elNumero = el('span', { class: 'dato-valor' }, numero);
    const elTitular = el('span', { class: 'dato-valor' }, '—');
    const elCreada = el('span', { class: 'dato-valor txt-tenue' }, '—');
    const elSaldo = el('div', { class: 'saldo-grande' }, '—');

    const panelResumen = el('section', { class: 'panel panel-resumen', 'aria-label': 'Resumen de cuenta' },
        el('div', { class: 'resumen-datos' },
            el('div', {}, el('span', { class: 'dato-clave' }, 'CUENTA ....: '), elNumero),
            el('div', {}, el('span', { class: 'dato-clave' }, 'TITULAR ...: '), elTitular),
            el('div', {}, el('span', { class: 'dato-clave' }, 'APERTURA ..: '), elCreada),
        ),
        el('div', { class: 'resumen-saldo' },
            el('span', { class: 'dato-clave' }, 'SALDO DISPONIBLE'),
            elSaldo,
        ),
    );

    // Panel de operaciones COBOL (4 pestañas)
    const barraTabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Operaciones de cuenta' });
    const zonaForm = el('div', { class: 'tab-panel', role: 'tabpanel' });
    const zonaResultado = el('div', { class: 'zona-resultado', 'aria-live': 'polite' });
    const controlOp = crearControlOperacion(app, zonaResultado);

    const panelOperaciones = el('section', { class: 'panel', 'aria-labelledby': 'tit-ops' },
        el('div', { class: 'panel-cabecera' },
            el('h2', { id: 'tit-ops' }, 'OPERACIONES EN CUENTA'),
            el('span', { class: 'panel-meta' }, 'MÓDULO COBOL · IDEMPOTENTE'),
        ),
        barraTabs,
        zonaForm,
        zonaResultado,
    );

    // Panel de movimientos
    const contadorMovs = el('span', { class: 'panel-meta' }, '');
    const zonaMovimientos = el('div', { class: 'tabla-scroll', 'aria-live': 'polite' });
    const panelMovimientos = el('section', { class: 'panel', 'aria-labelledby': 'tit-movs' },
        el('div', { class: 'panel-cabecera' },
            el('h2', { id: 'tit-movs' }, 'EXTRACTO DE MOVIMIENTOS'),
            contadorMovs,
        ),
        zonaMovimientos,
    );

    zonaContenido.append(panelResumen, panelOperaciones, panelMovimientos);
    zonaContenido.hidden = true;

    vaciar(contenedor);
    contenedor.append(barraSuperior, zonaEstadoCuenta, zonaContenido);

    function renderPestanas() {
        vaciar(barraTabs);
        for (const p of PESTANAS) {
            const activa = p.id === pestanaActiva;
            barraTabs.appendChild(el('button', {
                type: 'button',
                role: 'tab',
                'aria-selected': activa ? 'true' : 'false',
                class: activa ? 'tab tab-activa' : 'tab',
                onClick: () => {
                    if (controlOp.enCurso || pestanaActiva === p.id) {
                        return;
                    }
                    pestanaActiva = p.id;
                    vaciar(zonaResultado);
                    renderPestanas();
                    renderFormularioActivo();
                },
            }, p.etiqueta));
        }
    }

    function renderFormularioActivo() {
        vaciar(zonaForm);
        const form = el('form', { class: 'formulario', novalidate: true });

        if (pestanaActiva === 'deposito' || pestanaActiva === 'retiro') {
            const esRetiro = pestanaActiva === 'retiro';
            const fMonto = campo({
                id: `op-monto-${pestanaActiva}`,
                name: 'monto',
                label: 'MONTO ..........:',
                placeholder: 'Ej. 250,50',
                inputmode: 'decimal',
                ayuda: esRetiro
                    ? 'Pesos (> 0, máx. 2 decimales). COBOL valida que no haya sobregiro.'
                    : 'Pesos (> 0, máx. 2 decimales).',
            });
            form.append(
                fMonto.fila,
                el('div', { class: 'form-acciones' },
                    el('button', { type: 'submit', class: 'btn btn-primario' },
                        esRetiro ? 'EJECUTAR RETIRO [ENTER]' : 'EJECUTAR DEPÓSITO [ENTER]'),
                ),
            );
            form.addEventListener('submit', (ev) => {
                ev.preventDefault();
                if (controlOp.enCurso) {
                    return;
                }
                const val = validarMonto({ monto: fMonto.input.value });
                if (!val.ok) {
                    mostrarErroresFormulario(form, val.errores);
                    app.setEstado('WARN', 'RC=0400 MONTO INVÁLIDO');
                    return;
                }
                limpiarErroresFormulario(form);
                const ruta = esRetiro ? rutas.retiros(numero) : rutas.depositos(numero);
                const op = app.cliente.operacion(ruta, val.valor);
                controlOp.ejecutar({
                    form,
                    operacion: op,
                    contexto: pestanaActiva,
                    titulo: esRetiro ? 'RETIRO COBOL' : 'DEPÓSITO COBOL',
                    onExito: (res, dest) => {
                        dest.appendChild(renderComprobanteOperacion(res));
                        fMonto.input.value = '';
                        cargarCuenta(false);
                    },
                });
            });
        } else if (pestanaActiva === 'interes') {
            const saldoCero = cuentaActual && pesosACentavos(cuentaActual.saldo) <= 0;
            const avisoSaldo = saldoCero
                ? el('div', { class: 'nota-ambar', role: 'note' },
                    '⚠ El saldo actual es $ 0,00. COBOL rechazará el abono de interés con RC=0001 (puede enviarlo para verificar la regla).')
                : null;
            const fTasa = campo({
                id: 'op-tasa-anual',
                name: 'tasaAnual',
                label: 'TASA ANUAL % ...:',
                placeholder: 'Ej. 10 o 12,5',
                inputmode: 'decimal',
                ayuda: `Interés simple base 365 · mayor que 0 y máximo ${LIMITES.tasaAnualMax} %`,
            });
            const fDias = campo({
                id: 'op-dias',
                name: 'dias',
                label: 'DÍAS ...........:',
                placeholder: 'Ej. 30',
                inputmode: 'numeric',
                ayuda: `Entero entre 1 y ${LIMITES.diasMax} días`,
            });
            form.append(
                avisoSaldo,
                fTasa.fila,
                fDias.fila,
                el('div', { class: 'form-acciones' },
                    el('button', { type: 'submit', class: 'btn btn-primario' }, 'ABONAR INTERÉS [ENTER]'),
                ),
            );
            form.addEventListener('submit', (ev) => {
                ev.preventDefault();
                if (controlOp.enCurso) {
                    return;
                }
                const val = validarInteres({ tasaAnual: fTasa.input.value, dias: fDias.input.value });
                if (!val.ok) {
                    mostrarErroresFormulario(form, val.errores);
                    app.setEstado('WARN', 'RC=0400 REVISE TASA Y DÍAS');
                    return;
                }
                limpiarErroresFormulario(form);
                const op = app.cliente.operacion(rutas.intereses(numero), val.valor);
                controlOp.ejecutar({
                    form,
                    operacion: op,
                    contexto: 'interes',
                    titulo: 'ABONO DE INTERÉS COBOL',
                    onExito: (res, dest) => {
                        dest.appendChild(renderComprobanteOperacion(res));
                        fTasa.input.value = '';
                        fDias.input.value = '';
                        cargarCuenta(false);
                    },
                });
            });
        } else if (pestanaActiva === 'comision') {
            const fMonto = campo({
                id: 'op-comision-monto',
                name: 'monto',
                label: 'COMISIÓN .......:',
                placeholder: 'Ej. 15000',
                inputmode: 'decimal',
                ayuda: 'Monto > 0 (máx. 2 decimales). COBOL no permite saldo negativo.',
            });
            const fConcepto = campo({
                id: 'op-comision-concepto',
                name: 'concepto',
                label: 'CONCEPTO .......:',
                placeholder: 'Cuota de manejo (opcional)',
                maxlength: LIMITES.conceptoMax,
                ayuda: `Opcional · máximo ${LIMITES.conceptoMax} caracteres`,
            });
            form.append(
                fMonto.fila,
                fConcepto.fila,
                el('div', { class: 'form-acciones' },
                    el('button', { type: 'submit', class: 'btn btn-primario' }, 'COBRAR COMISIÓN [ENTER]'),
                ),
            );
            form.addEventListener('submit', (ev) => {
                ev.preventDefault();
                if (controlOp.enCurso) {
                    return;
                }
                const val = validarComision({ monto: fMonto.input.value, concepto: fConcepto.input.value });
                if (!val.ok) {
                    mostrarErroresFormulario(form, val.errores);
                    app.setEstado('WARN', 'RC=0400 REVISE LA COMISIÓN');
                    return;
                }
                limpiarErroresFormulario(form);
                const op = app.cliente.operacion(rutas.comisiones(numero), val.valor);
                controlOp.ejecutar({
                    form,
                    operacion: op,
                    contexto: 'comision',
                    titulo: 'COBRO DE COMISIÓN COBOL',
                    onExito: (res, dest) => {
                        dest.appendChild(renderComprobanteOperacion(res));
                        fMonto.input.value = '';
                        fConcepto.input.value = '';
                        cargarCuenta(false);
                    },
                });
            });
        }

        zonaForm.appendChild(form);
    }

    function renderMovimientos(movs) {
        vaciar(zonaMovimientos);
        contadorMovs.textContent = `${movs.length} MOV.`;
        if (movs.length === 0) {
            zonaMovimientos.appendChild(el('div', { class: 'estado-vacio' }, '*** SIN MOVIMIENTOS REGISTRADOS ***'));
            return;
        }
        const tabla = el('table', { class: 'tabla-terminal' },
            el('thead', {},
                el('tr', {},
                    el('th', {}, 'ID'),
                    el('th', {}, 'FECHA'),
                    el('th', {}, 'TIPO'),
                    el('th', { class: 'num' }, 'MONTO'),
                    el('th', { class: 'num' }, 'SALDO ANT.'),
                    el('th', { class: 'num' }, 'SALDO NUEVO'),
                    el('th', {}, 'DETALLE'),
                ),
            ),
            el('tbody', {},
                movs.map((m) => {
                    const meta = TIPOS_MOVIMIENTO[m.tipo] ?? { etiqueta: m.tipo, signo: '', clase: '' };
                    const montoCero = m.tipo === 'APERTURA' && pesosACentavos(m.monto) === 0;
                    const textoMonto = montoCero ? formatoPesos(0) : `${meta.signo} ${formatoPesos(m.monto)}`;
                    const claseMonto = montoCero ? 'num txt-tenue' : `num ${meta.clase}`;

                    const detalle = [];
                    if (m.descripcion) {
                        detalle.push(m.descripcion);
                    }
                    if (m.contraparte) {
                        detalle.push(' · ', el('a', {
                            href: `#/cuenta/${encodeURIComponent(m.contraparte)}`,
                            class: 'enlace-terminal',
                        }, m.contraparte));
                    }

                    return el('tr', {},
                        el('td', { class: 'txt-tenue' }, `#${m.id}`),
                        el('td', { class: 'txt-tenue' }, formatoFecha(m.fecha)),
                        el('td', {}, el('span', { class: `badge-tipo ${meta.clase}` }, meta.etiqueta)),
                        el('td', { class: claseMonto }, textoMonto),
                        el('td', { class: 'num txt-tenue' }, formatoPesos(m.saldoAnterior)),
                        el('td', { class: 'num txt-ambar' }, formatoPesos(m.saldoNuevo)),
                        el('td', {}, detalle.length ? detalle : '—'),
                    );
                }),
            ),
        );
        zonaMovimientos.appendChild(tabla);
    }

    async function cargarCuenta(mostrarEstado) {
        ctrlCarga?.abort();
        ctrlCarga = new AbortController();
        const turno = ++seq;
        const { signal } = ctrlCarga;

        btnRefrescar.disabled = true;
        if (mostrarEstado && !cuentaActual) {
            vaciar(zonaEstadoCuenta);
            zonaEstadoCuenta.appendChild(el('p', { class: 'estado-carga' }, `CONSULTANDO CUENTA ${numero}...`));
            app.setEstado('WAIT', `WAIT CONSULTANDO CUENTA ${numero}`);
        }

        try {
            const [cuenta, movs] = await Promise.all([
                app.cliente.get(rutas.cuenta(numero), { signal }),
                app.cliente.get(rutas.movimientos(numero), { signal }),
            ]);
            if (destruido || turno !== seq) {
                return;
            }
            const saldoCambioCero = cuentaActual
                && (pesosACentavos(cuentaActual.saldo) <= 0) !== (pesosACentavos(cuenta.saldo) <= 0);
            cuentaActual = cuenta;

            vaciar(zonaEstadoCuenta);
            elNumero.textContent = cuenta.numero;
            elTitular.textContent = cuenta.titular;
            elCreada.textContent = formatoFecha(cuenta.creadaEn);
            elSaldo.textContent = formatoPesos(cuenta.saldo);

            const primeraCarga = zonaContenido.hidden;
            zonaContenido.hidden = false;
            if (primeraCarga) {
                renderPestanas();
                renderFormularioActivo();
            } else if (pestanaActiva === 'interes' && saldoCambioCero) {
                renderFormularioActivo();
            }

            renderMovimientos(Array.isArray(movs) ? movs : []);
            if (mostrarEstado) {
                app.setEstado('OK', `RC=0000 CUENTA ${cuenta.numero} ACTUALIZADA`);
            }
        } catch (err) {
            if (destruido || turno !== seq) {
                return;
            }
            const info = describirError(err);
            app.setEstado(info.incierto ? 'WARN' : 'ERR', `${codigoRetorno(err)} ${info.titulo}`);
            vaciar(zonaEstadoCuenta);
            zonaEstadoCuenta.appendChild(renderError(err, {
                onReintentar: () => cargarCuenta(true),
                accionExtra: err.codigo === 'CUENTA_NO_ENCONTRADA'
                    ? el('a', { href: '#/cuentas', class: 'btn btn-secundario' }, 'IR AL DIRECTORIO DE CUENTAS')
                    : null,
            }));
            if (!cuentaActual) {
                zonaContenido.hidden = true;
            }
        } finally {
            if (!destruido && turno === seq) {
                btnRefrescar.disabled = false;
            }
        }
    }

    cargarCuenta(true);

    return () => {
        destruido = true;
        ctrlCarga?.abort();
        controlOp.destruir();
    };
}
