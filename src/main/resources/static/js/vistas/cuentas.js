/**
 * Vista #/cuentas — Listado de cuentas registradas y apertura de cuenta nueva.
 */
import { rutas } from '../api.js';
import { codigoRetorno, describirError } from '../errores.js';
import { formatoFecha, formatoPesos } from '../formato.js';
import {
    campo,
    crearControlOperacion,
    el,
    limpiarErroresFormulario,
    mostrarErroresFormulario,
    renderError,
    vaciar,
} from '../ui.js';
import { LIMITES, validarAperturaCuenta } from '../validacion.js';

export function montarCuentas(contenedor, app) {
    let seq = 0;
    let ctrlCarga = null;
    let destruido = false;

    const zonaLista = el('div', { class: 'tabla-scroll', 'aria-live': 'polite' });
    const contadorCuentas = el('span', { class: 'panel-meta' }, '');
    const btnRefrescar = el('button', {
        type: 'button',
        class: 'btn btn-secundario',
        onClick: () => cargarListado(),
    }, 'REFRESCAR');

    const panelListado = el('section', { class: 'panel', 'aria-labelledby': 'tit-cuentas' },
        el('div', { class: 'panel-cabecera' },
            el('h2', { id: 'tit-cuentas' }, 'DIRECTORIO DE CUENTAS'),
            el('div', { class: 'panel-acciones' }, contadorCuentas, btnRefrescar),
        ),
        zonaLista,
    );

    const campoTitular = campo({
        id: 'apertura-titular',
        name: 'titular',
        label: 'TITULAR ........:',
        placeholder: 'Nombre completo del titular',
        maxlength: LIMITES.titularMax,
        ayuda: `Obligatorio · máximo ${LIMITES.titularMax} caracteres`,
    });
    const campoDeposito = campo({
        id: 'apertura-deposito',
        name: 'depositoInicial',
        label: 'DEPÓSITO INIC. .:',
        placeholder: '0,00 (opcional)',
        inputmode: 'decimal',
        ayuda: 'Opcional · pesos con máximo 2 decimales (ej. 1000 o 250,50)',
    });

    const zonaResultado = el('div', { class: 'zona-resultado', 'aria-live': 'polite' });
    const controlOp = crearControlOperacion(app, zonaResultado);

    const form = el('form', { class: 'formulario', novalidate: true },
        campoTitular.fila,
        campoDeposito.fila,
        el('div', { class: 'form-acciones' },
            el('button', { type: 'submit', class: 'btn btn-primario' }, 'ABRIR CUENTA [ENTER]'),
        ),
    );

    form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (controlOp.enCurso) {
            return;
        }
        const val = validarAperturaCuenta({
            titular: campoTitular.input.value,
            depositoInicial: campoDeposito.input.value,
        });
        if (!val.ok) {
            mostrarErroresFormulario(form, val.errores);
            app.setEstado('WARN', 'RC=0400 REVISE LOS CAMPOS DEL FORMULARIO');
            return;
        }
        limpiarErroresFormulario(form);
        const op = app.cliente.operacion(rutas.cuentas, val.valor, { conClave: false });
        controlOp.ejecutar({
            form,
            operacion: op,
            contexto: 'apertura',
            titulo: 'APERTURA DE CUENTA',
            onExito: (cuenta) => {
                app.setEstado('OK', `RC=0000 CUENTA ${cuenta.numero} ABIERTA`);
                app.irA(`#/cuenta/${encodeURIComponent(cuenta.numero)}`);
            },
        });
    });

    const panelApertura = el('section', { class: 'panel', 'aria-labelledby': 'tit-apertura' },
        el('div', { class: 'panel-cabecera' },
            el('h2', { id: 'tit-apertura' }, 'APERTURA DE CUENTA'),
            el('span', { class: 'panel-meta' }, 'POST /api/cuentas'),
        ),
        form,
        zonaResultado,
    );

    vaciar(contenedor);
    contenedor.appendChild(el('div', { class: 'grid-principal' }, panelListado, panelApertura));

    async function cargarListado() {
        ctrlCarga?.abort();
        ctrlCarga = new AbortController();
        const turno = ++seq;

        btnRefrescar.disabled = true;
        vaciar(zonaLista);
        zonaLista.appendChild(el('p', { class: 'estado-carga' }, 'CONSULTANDO CUENTAS EN MAINFRAME...'));
        app.setEstado('WAIT', 'WAIT CONSULTANDO DIRECTORIO DE CUENTAS');

        try {
            const cuentas = await app.cliente.get(rutas.cuentas, { signal: ctrlCarga.signal });
            if (destruido || turno !== seq) {
                return;
            }
            renderTabla(Array.isArray(cuentas) ? cuentas : []);
            app.setEstado('OK', `RC=0000 ${cuentas.length} CUENTA(S) ENCONTRADA(S)`);
        } catch (err) {
            if (destruido || turno !== seq) {
                return;
            }
            const info = describirError(err);
            app.setEstado(info.incierto ? 'WARN' : 'ERR', `${codigoRetorno(err)} ${info.titulo}`);
            vaciar(zonaLista);
            zonaLista.appendChild(renderError(err, { onReintentar: () => cargarListado() }));
        } finally {
            if (!destruido && turno === seq) {
                btnRefrescar.disabled = false;
            }
        }
    }

    function renderTabla(cuentas) {
        vaciar(zonaLista);
        contadorCuentas.textContent = `${cuentas.length} REG.`;
        if (cuentas.length === 0) {
            zonaLista.appendChild(el('div', { class: 'estado-vacio' },
                '*** NO HAY CUENTAS REGISTRADAS ***',
                el('p', { class: 'estado-vacio-sub' }, 'Cree la primera cuenta en el panel de APERTURA DE CUENTA.'),
            ));
            return;
        }
        const tabla = el('table', { class: 'tabla-terminal' },
            el('thead', {},
                el('tr', {},
                    el('th', {}, 'CUENTA'),
                    el('th', {}, 'TITULAR'),
                    el('th', { class: 'num' }, 'SALDO'),
                    el('th', {}, 'CREADA'),
                    el('th', { class: 'col-accion' }, 'ACCIÓN'),
                ),
            ),
            el('tbody', {},
                cuentas.map((c) => el('tr', {},
                    el('td', {}, el('a', {
                        href: `#/cuenta/${encodeURIComponent(c.numero)}`,
                        class: 'enlace-terminal',
                    }, c.numero)),
                    el('td', {}, c.titular),
                    el('td', { class: 'num txt-ambar' }, formatoPesos(c.saldo)),
                    el('td', { class: 'txt-tenue' }, formatoFecha(c.creadaEn)),
                    el('td', { class: 'col-accion' }, el('a', {
                        href: `#/cuenta/${encodeURIComponent(c.numero)}`,
                        class: 'btn btn-chico',
                    }, 'OPERAR')),
                )),
            ),
        );
        zonaLista.appendChild(tabla);
    }

    cargarListado();

    return () => {
        destruido = true;
        ctrlCarga?.abort();
        controlOp.destruir();
    };
}
