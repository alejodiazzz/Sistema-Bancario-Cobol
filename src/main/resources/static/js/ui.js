/**
 * Helpers de DOM seguros y componente común de ejecución con espera,
 * cancelación (AbortController) y reintento con idempotencia.
 *
 * Seguridad: ningún texto del usuario o del servidor pasa por innerHTML;
 * todo se inserta mediante nodos de texto (textContent / createTextNode).
 */
import { codigoRetorno, describirError } from './errores.js';
import { formatoFecha, formatoPesos } from './formato.js';

/** Crea un elemento DOM de forma declarativa sin usar innerHTML. */
export function el(tag, attrs = {}, ...hijos) {
    const nodo = document.createElement(tag);
    if (attrs) {
        for (const [clave, valor] of Object.entries(attrs)) {
            if (valor === null || valor === undefined || valor === false) {
                continue;
            }
            if (clave === 'class' || clave === 'className') {
                nodo.className = String(valor);
            } else if (clave === 'dataset' && typeof valor === 'object') {
                for (const [dk, dv] of Object.entries(valor)) {
                    if (dv !== null && dv !== undefined) {
                        nodo.dataset[dk] = String(dv);
                    }
                }
            } else if (clave.startsWith('on') && typeof valor === 'function') {
                nodo.addEventListener(clave.slice(2).toLowerCase(), valor);
            } else if (clave === 'value') {
                nodo.value = String(valor);
            } else if (clave === 'checked' || clave === 'disabled' || clave === 'selected'
                || clave === 'readonly' || clave === 'required' || clave === 'hidden') {
                nodo[clave] = Boolean(valor);
                if (valor) {
                    nodo.setAttribute(clave, '');
                }
            } else {
                nodo.setAttribute(clave, String(valor));
            }
        }
    }
    agregarHijos(nodo, hijos);
    return nodo;
}

function agregarHijos(padre, hijos) {
    for (const h of hijos) {
        if (h === null || h === undefined || h === false) {
            continue;
        }
        if (Array.isArray(h)) {
            agregarHijos(padre, h);
        } else if (h instanceof Node) {
            padre.appendChild(h);
        } else {
            padre.appendChild(document.createTextNode(String(h)));
        }
    }
}

export function vaciar(nodo) {
    nodo.replaceChildren();
}

/**
 * Construye un campo de formulario estilo 3270 con etiqueta, input y hueco de error.
 * @returns {{fila: HTMLElement, input: HTMLInputElement, errorEl: HTMLElement}}
 */
export function campo({
    id,
    label,
    name,
    type = 'text',
    value = '',
    placeholder = '',
    ayuda = '',
    maxlength = null,
    inputmode = null,
    autocomplete = 'off',
    list = null,
    ariaDescribedby = null,
}) {
    const errId = `${id}-err`;
    const ayudaId = ayuda ? `${id}-ayuda` : null;
    const desc = [ariaDescribedby, ayudaId, errId].filter(Boolean).join(' ');

    const input = el('input', {
        id,
        name: name ?? id,
        type,
        value,
        placeholder,
        maxlength,
        inputmode,
        autocomplete,
        list,
        class: 'campo-input',
        'aria-describedby': desc,
    });
    const errorEl = el('div', {
        id: errId,
        class: 'campo-error',
        role: 'alert',
        dataset: { errorFor: name ?? id },
    });
    const fila = el('div', { class: 'campo-fila' },
        el('label', { for: id, class: 'campo-etiqueta' }, label),
        el('div', { class: 'campo-control' },
            input,
            ayuda ? el('div', { id: ayudaId, class: 'campo-ayuda' }, ayuda) : null,
            errorEl,
        ),
    );
    return { fila, input, errorEl };
}

/** Limpia todos los mensajes de error locales de un formulario. */
export function limpiarErroresFormulario(form) {
    for (const err of form.querySelectorAll('[data-error-for]')) {
        err.textContent = '';
    }
    for (const inp of form.querySelectorAll('.invalido')) {
        inp.classList.remove('invalido');
        inp.removeAttribute('aria-invalid');
    }
}

/** Muestra errores por campo y enfoca el primero inválido. */
export function mostrarErroresFormulario(form, errores) {
    limpiarErroresFormulario(form);
    let primerInvalido = null;
    for (const [nombre, mensaje] of Object.entries(errores)) {
        const err = form.querySelector(`[data-error-for="${CSS.escape(nombre)}"]`);
        if (err) {
            err.textContent = mensaje;
        }
        const inp = form.querySelector(`[name="${CSS.escape(nombre)}"]`);
        if (inp) {
            inp.classList.add('invalido');
            inp.setAttribute('aria-invalid', 'true');
            if (!primerInvalido) {
                primerInvalido = inp;
            }
        }
    }
    primerInvalido?.focus();
}

export function deshabilitarFormulario(form, deshabilitado) {
    if (!form) {
        return;
    }
    for (const ctrl of form.querySelectorAll('input, select, textarea, button')) {
        ctrl.disabled = deshabilitado;
    }
}

/** Barra ASCII de progreso: "██████░░░░░░░░░░". */
export function barraProgreso(transcurridoMs, totalMs, ancho = 16) {
    const proporcion = totalMs > 0 ? Math.min(1, Math.max(0, transcurridoMs / totalMs)) : 0;
    const llenos = Math.round(proporcion * ancho);
    return '█'.repeat(llenos) + '░'.repeat(ancho - llenos);
}

/** Dibuja un panel de error con botón opcional de reintento. */
export function renderError(err, { contexto, claveIdempotencia = null, onReintentar = null, accionExtra = null } = {}) {
    const info = describirError(err, contexto);
    const rc = codigoRetorno(err);
    const clase = info.incierto ? 'panel-aviso panel-incierto' : 'panel-aviso panel-error';

    const acciones = [];
    if (info.reintentable && onReintentar) {
        const etiqueta = info.nuevaClave ? 'REINTENTAR (NUEVA CLAVE)' : 'REINTENTAR';
        acciones.push(el('button', {
            type: 'button',
            class: 'btn btn-ambar',
            onClick: () => onReintentar(info),
        }, etiqueta));
    }
    if (accionExtra) {
        acciones.push(accionExtra);
    }

    return el('div', { class: clase, role: 'alert' },
        el('div', { class: 'aviso-cabecera' },
            el('span', { class: 'badge-rc' }, rc),
            el('strong', {}, info.titulo),
            info.estadoCobol !== null ? el('span', { class: 'aviso-meta' }, `COBOL=${info.estadoCobol}`) : null,
            info.status !== null ? el('span', { class: 'aviso-meta' }, `HTTP ${info.status}`) : null,
        ),
        el('p', { class: 'aviso-detalle' }, info.detalle),
        info.servidor ? el('p', { class: 'aviso-servidor' }, `Servidor: ${info.servidor}`) : null,
        info.incierto && claveIdempotencia ? el('p', { class: 'aviso-idemp' },
            `Reintentar usará la misma X-Idempotency-Key (${claveIdempotencia.slice(0, 8)}…) para evitar duplicados.`) : null,
        acciones.length ? el('div', { class: 'aviso-acciones' }, acciones) : null,
    );
}

/** Dibuja el comprobante de una OperacionResponse (depósito, retiro, interés, comisión, transferencia). */
export function renderComprobanteOperacion(res, { enlaceDestino = false } = {}) {
    const filas = [
        ['MOVIMIENTO ID', `#${res.movimientoId}`],
        ['OPERACIÓN', res.tipo],
        ['CUENTA', res.cuenta],
        ['MONTO', formatoPesos(res.monto)],
        ['SALDO ANTERIOR', formatoPesos(res.saldoAnterior)],
        ['SALDO NUEVO', formatoPesos(res.saldoNuevo)],
    ];
    if (res.cuentaDestino) {
        filas.push(['CUENTA DESTINO', res.cuentaDestino]);
    }
    if (res.saldoDestino !== null && res.saldoDestino !== undefined) {
        filas.push(['SALDO DESTINO', formatoPesos(res.saldoDestino)]);
    }
    filas.push(['FECHA', formatoFecha(res.fecha)]);
    if (res.mensaje) {
        filas.push(['MENSAJE', res.mensaje]);
    }

    return el('div', { class: 'panel-aviso panel-exito', role: 'status' },
        el('div', { class: 'aviso-cabecera' },
            el('span', { class: 'badge-rc badge-ok' }, 'RC=0000'),
            el('strong', {}, 'TRANSACCIÓN PROCESADA POR COBOL'),
        ),
        res.repetida ? el('div', { class: 'banner-repetida' },
            '⚠ OPERACIÓN YA APLICADA ANTERIORMENTE — SE DEVOLVIÓ EL RESULTADO ORIGINAL (NO SE DUPLICÓ)') : null,
        el('dl', { class: 'recibo-grid' },
            filas.map(([k, v]) => [
                el('dt', {}, k),
                el('dd', { class: k === 'SALDO NUEVO' || k === 'SALDO DESTINO' ? 'txt-ambar' : '' },
                    enlaceDestino && k === 'CUENTA DESTINO'
                        ? el('a', { href: `#/cuenta/${encodeURIComponent(v)}`, class: 'enlace-terminal' }, v)
                        : v),
            ]),
        ),
    );
}

/**
 * Controlador de ejecución de operaciones para una vista.
 * Gestiona el estado de espera, el contador en vivo, el botón PF3 CANCELAR,
 * el bloqueo contra doble envío y los reintentos conservando X-Idempotency-Key.
 */
export function crearControlOperacion(app, contenedor) {
    let enCurso = false;
    let ctrlActual = null;
    let timerActual = null;
    let destruido = false;

    function limpiarEspera() {
        if (timerActual !== null) {
            clearInterval(timerActual);
            timerActual = null;
        }
        ctrlActual = null;
        enCurso = false;
    }

    async function ejecutar({ form = null, operacion, contexto = null, titulo = 'PROCESANDO', onExito = null, usarDemora = true }) {
        if (enCurso || destruido) {
            return;
        }
        enCurso = true;
        deshabilitarFormulario(form, true);

        const ctrl = new AbortController();
        ctrlActual = ctrl;

        const sim = usarDemora ? app.obtenerSimulacion() : { demoraMs: 0, timeoutClienteMs: 0 };
        const limiteMs = sim.timeoutClienteMs > 0 ? sim.timeoutClienteMs : app.cliente.timeoutMs;
        const inicio = Date.now();

        const textoTiempo = el('span', { class: 'espera-tiempo' }, `0.0s / ${(limiteMs / 1000).toFixed(1)}s`);
        const textoBarra = el('span', { class: 'espera-barra' }, barraProgreso(0, limiteMs));
        const btnCancelar = el('button', {
            type: 'button',
            class: 'btn btn-rojo',
            onClick: () => ctrl.abort(),
        }, 'PF3 CANCELAR');

        const panelEspera = el('div', { class: 'panel-aviso panel-espera', role: 'status' },
            el('div', { class: 'espera-fila' },
                el('strong', {}, `WAIT · ${titulo}`),
                textoBarra,
                textoTiempo,
                btnCancelar,
            ),
            el('div', { class: 'espera-meta' },
                operacion.clave ? `X-Idempotency-Key: ${operacion.clave.slice(0, 8)}…` : 'Sin clave de idempotencia',
                sim.demoraMs > 0 ? ` · X-Demora-Ms: ${sim.demoraMs} ms` : '',
                sim.timeoutClienteMs > 0 ? ` · Timeout cliente prueba: ${sim.timeoutClienteMs} ms` : '',
            ),
        );

        vaciar(contenedor);
        contenedor.appendChild(panelEspera);
        app.setEstado('WAIT', `WAIT ${titulo} ... 0.0s`);

        const alTecla = (ev) => {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                ctrl.abort();
            }
        };
        window.addEventListener('keydown', alTecla);

        timerActual = setInterval(() => {
            const trans = Date.now() - inicio;
            const seg = (trans / 1000).toFixed(1);
            textoBarra.textContent = barraProgreso(trans, limiteMs);
            textoTiempo.textContent = `${seg}s / ${(limiteMs / 1000).toFixed(1)}s`;
            app.setEstado('WAIT', `WAIT ${titulo} ... ${seg}s`);
        }, 100);

        try {
            const res = await operacion.ejecutar({
                demoraMs: sim.demoraMs,
                timeoutMs: sim.timeoutClienteMs || undefined,
                signal: ctrl.signal,
            });
            if (destruido) {
                return;
            }
            app.setEstado('OK', res?.repetida ? 'RC=0000 OPERACIÓN YA APLICADA' : 'RC=0000 TRANSACCIÓN COMPLETADA');
            vaciar(contenedor);
            if (onExito) {
                onExito(res, contenedor);
            }
        } catch (err) {
            if (destruido) {
                return;
            }
            const info = describirError(err, contexto);
            app.setEstado(info.incierto ? 'WARN' : 'ERR', `${codigoRetorno(err)} ${info.titulo}`);
            vaciar(contenedor);
            contenedor.appendChild(renderError(err, {
                contexto,
                claveIdempotencia: operacion.clave,
                onReintentar: (det) => {
                    if (det.nuevaClave) {
                        operacion.renovarClave();
                    }
                    ejecutar({ form, operacion, contexto, titulo, onExito, usarDemora });
                },
            }));
        } finally {
            window.removeEventListener('keydown', alTecla);
            limpiarEspera();
            deshabilitarFormulario(form, false);
        }
    }

    return {
        ejecutar,
        get enCurso() {
            return enCurso;
        },
        destruir() {
            destruido = true;
            ctrlActual?.abort();
            limpiarEspera();
        },
    };
}
