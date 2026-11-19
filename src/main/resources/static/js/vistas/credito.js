/**
 * Vista #/credito — Simulador de crédito de cuota fija (sistema francés, COBOL simular_credito).
 * No mueve dinero ni persiste datos, por lo que no requiere X-Idempotency-Key.
 */
import { rutas } from '../api.js';
import { formatoPesos, formatoPorcentaje } from '../formato.js';
import {
    campo,
    crearControlOperacion,
    el,
    limpiarErroresFormulario,
    mostrarErroresFormulario,
    vaciar,
} from '../ui.js';
import { LIMITES, validarCredito } from '../validacion.js';

export function montarCredito(contenedor, app) {
    const fMonto = campo({
        id: 'cr-monto',
        name: 'monto',
        label: 'MONTO ..........:',
        placeholder: 'Ej. 1000000',
        inputmode: 'decimal',
        ayuda: 'Pesos (> 0, máx. 2 decimales).',
    });
    const fTasa = campo({
        id: 'cr-tasa',
        name: 'tasaMensual',
        label: 'TASA MENSUAL % .:',
        placeholder: 'Ej. 1,5 (0 es válido)',
        inputmode: 'decimal',
        ayuda: `Entre 0 y ${LIMITES.tasaMensualMax} % mensual. Con 0 % la cuota es monto / plazo.`,
    });
    const fPlazo = campo({
        id: 'cr-plazo',
        name: 'plazoMeses',
        label: 'PLAZO (MESES) ..:',
        placeholder: 'Ej. 12',
        inputmode: 'numeric',
        ayuda: `Entero entre 1 y ${LIMITES.plazoMax} meses.`,
    });

    const zonaResultado = el('div', { class: 'zona-resultado', 'aria-live': 'polite' });
    const controlOp = crearControlOperacion(app, zonaResultado);

    const form = el('form', { class: 'formulario', novalidate: true },
        fMonto.fila,
        fTasa.fila,
        fPlazo.fila,
        el('div', { class: 'form-acciones' },
            el('button', { type: 'submit', class: 'btn btn-primario' }, 'SIMULAR CRÉDITO [ENTER]'),
        ),
    );

    form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (controlOp.enCurso) {
            return;
        }
        const val = validarCredito({
            monto: fMonto.input.value,
            tasaMensual: fTasa.input.value,
            plazoMeses: fPlazo.input.value,
        });
        if (!val.ok) {
            mostrarErroresFormulario(form, val.errores);
            app.setEstado('WARN', 'RC=0400 REVISE LOS PARÁMETROS DEL CRÉDITO');
            return;
        }
        limpiarErroresFormulario(form);
        const op = app.cliente.operacion(rutas.simulacionCredito, val.valor, { conClave: false });
        controlOp.ejecutar({
            form,
            operacion: op,
            contexto: 'credito',
            titulo: 'SIMULACIÓN DE CRÉDITO COBOL',
            onExito: (res, dest) => {
                dest.appendChild(renderResultadoCredito(res));
            },
        });
    });

    const panel = el('section', { class: 'panel panel-estrecho', 'aria-labelledby': 'tit-credito' },
        el('div', { class: 'panel-cabecera' },
            el('h2', { id: 'tit-credito' }, 'SIMULADOR DE CRÉDITO (SISTEMA FRANCÉS)'),
            el('span', { class: 'panel-meta' }, 'POST /api/creditos/simulacion'),
        ),
        form,
        zonaResultado,
    );

    vaciar(contenedor);
    contenedor.appendChild(panel);
    app.setEstado('OK', 'RC=0000 READY · SIMULADOR DE CRÉDITO');

    return () => {
        controlOp.destruir();
    };
}

function renderResultadoCredito(res) {
    const tasaTxt = res.tasaMensual === 0
        ? '0 % (SIN INTERÉS)'
        : `${formatoPorcentaje(res.tasaMensual)} mensual`;

    return el('div', { class: 'panel-aviso panel-exito', role: 'status' },
        el('div', { class: 'aviso-cabecera' },
            el('span', { class: 'badge-rc badge-ok' }, 'RC=0000'),
            el('strong', {}, 'PROYECCIÓN CALCULADA POR COBOL'),
        ),
        el('div', { class: 'credito-destacado' },
            el('span', { class: 'dato-clave' }, 'CUOTA MENSUAL FIJA'),
            el('div', { class: 'saldo-grande' }, formatoPesos(res.cuotaMensual)),
        ),
        el('dl', { class: 'recibo-grid' },
            el('dt', {}, 'MONTO SOLICITADO'),
            el('dd', {}, formatoPesos(res.monto)),
            el('dt', {}, 'TASA MENSUAL'),
            el('dd', {}, tasaTxt),
            el('dt', {}, 'PLAZO'),
            el('dd', {}, `${res.plazoMeses} ${res.plazoMeses === 1 ? 'MES' : 'MESES'}`),
            el('dt', {}, 'TOTAL INTERESES'),
            el('dd', { class: 'txt-cian' }, formatoPesos(res.totalIntereses)),
            el('dt', {}, 'TOTAL A PAGAR'),
            el('dd', { class: 'txt-ambar' }, formatoPesos(res.totalPagar)),
        ),
    );
}
