/**
 * Validaciones de formularios (módulo puro, sin DOM).
 *
 * Replican la forma y los rangos que exige el backend: Bean Validation en Java
 * y los EVALUATE de cobol/banco.cbl. Sirven para responder al instante, pero la
 * autoridad sigue siendo COBOL. Por ejemplo, los fondos insuficientes siempre los
 * decide el servidor, porque el saldo en pantalla puede estar desactualizado.
 *
 * Todas devuelven { ok, errores: {campo: mensaje}, valor } donde `valor` es el
 * cuerpo JSON listo para enviar (solo si ok).
 */
import { centavosAJson, parsearMonto } from './formato.js';

export const LIMITES = Object.freeze({
    titularMax: 100,       // @Size(max = 100)
    conceptoMax: 100,      // @Size(max = 100)
    tasaAnualMax: 100,     // abonar_interes: 0 < tasa <= 100
    diasMax: 3650,         // abonar_interes: 0 < dias <= 3650
    tasaMensualMax: 20,    // simular_credito: 0 <= tasa <= 20
    plazoMax: 360,         // simular_credito: 0 < plazo <= 360
});

/** Los números de cuenta los genera el backend: "10" + 8 dígitos. */
export const RE_CUENTA = /^\d{10}$/;

function resultado(errores, valor) {
    const ok = Object.keys(errores).length === 0;
    return { ok, errores, valor: ok ? valor : null };
}

function texto(v) {
    return v === null || v === undefined ? '' : String(v).trim();
}

/** "12,5" / "12.5" → 12.5; NaN si no es un decimal positivo bien formado. */
export function parsearDecimal(entrada) {
    const t = texto(entrada).replace(',', '.');
    return /^\d+(\.\d{1,6})?$/.test(t) ? Number(t) : NaN;
}

/** "30" → 30; NaN si no es un entero sin signo (rechaza "30.5", "3e2", "-1"). */
export function parsearEntero(entrada) {
    const t = texto(entrada);
    return /^\d{1,9}$/.test(t) ? Number(t) : NaN;
}

function montoPositivo(entrada, errores, campo = 'monto') {
    const r = parsearMonto(entrada);
    if (!r.ok) {
        errores[campo] = r.error;
        return null;
    }
    if (r.centavos <= 0) {
        errores[campo] = 'El monto debe ser mayor que cero';
        return null;
    }
    return centavosAJson(r.centavos);
}

function cuenta(entrada, errores, campo) {
    const t = texto(entrada);
    if (t === '') {
        errores[campo] = 'Ingrese el número de cuenta';
    } else if (!RE_CUENTA.test(t)) {
        errores[campo] = 'El número de cuenta debe tener 10 dígitos';
    }
    return t;
}

export function validarAperturaCuenta({ titular, depositoInicial } = {}) {
    const errores = {};
    const nombre = texto(titular);
    if (nombre === '') {
        errores.titular = 'El titular es obligatorio';
    } else if (nombre.length > LIMITES.titularMax) {
        errores.titular = `Máximo ${LIMITES.titularMax} caracteres (tiene ${nombre.length})`;
    }
    let deposito = 0;
    if (texto(depositoInicial) !== '') {
        const r = parsearMonto(depositoInicial);
        if (r.ok) {
            deposito = centavosAJson(r.centavos);
        } else {
            errores.depositoInicial = r.error;
        }
    }
    return resultado(errores, { titular: nombre, depositoInicial: deposito });
}

/** Depósitos y retiros. */
export function validarMonto({ monto } = {}) {
    const errores = {};
    const valor = montoPositivo(monto, errores);
    return resultado(errores, { monto: valor });
}

export function validarInteres({ tasaAnual, dias } = {}) {
    const errores = {};
    const tasa = parsearDecimal(tasaAnual);
    if (Number.isNaN(tasa)) {
        errores.tasaAnual = 'Ingrese una tasa válida (ej. 12,5)';
    } else if (tasa <= 0 || tasa > LIMITES.tasaAnualMax) {
        errores.tasaAnual = `La tasa anual debe ser mayor que 0 y máximo ${LIMITES.tasaAnualMax} %`;
    }
    const d = parsearEntero(dias);
    if (Number.isNaN(d)) {
        errores.dias = 'Los días deben ser un número entero';
    } else if (d < 1 || d > LIMITES.diasMax) {
        errores.dias = `Entre 1 y ${LIMITES.diasMax} días`;
    }
    return resultado(errores, { tasaAnual: tasa, dias: d });
}

export function validarComision({ monto, concepto } = {}) {
    const errores = {};
    const valor = montoPositivo(monto, errores);
    const c = texto(concepto);
    if (c.length > LIMITES.conceptoMax) {
        errores.concepto = `Máximo ${LIMITES.conceptoMax} caracteres (tiene ${c.length})`;
    }
    const cuerpo = { monto: valor };
    if (c !== '') {
        cuerpo.concepto = c;
    }
    return resultado(errores, cuerpo);
}

export function validarTransferencia({ cuentaOrigen, cuentaDestino, monto } = {}) {
    const errores = {};
    const origen = cuenta(cuentaOrigen, errores, 'cuentaOrigen');
    const destino = cuenta(cuentaDestino, errores, 'cuentaDestino');
    if (!errores.cuentaOrigen && !errores.cuentaDestino && origen === destino) {
        errores.cuentaDestino = 'La cuenta destino debe ser distinta de la de origen';
    }
    const valor = montoPositivo(monto, errores);
    return resultado(errores, { cuentaOrigen: origen, cuentaDestino: destino, monto: valor });
}

export function validarCredito({ monto, tasaMensual, plazoMeses } = {}) {
    const errores = {};
    const valor = montoPositivo(monto, errores);
    const tasa = parsearDecimal(tasaMensual);
    if (Number.isNaN(tasa)) {
        errores.tasaMensual = 'Ingrese una tasa válida (ej. 1,5)';
    } else if (tasa < 0 || tasa > LIMITES.tasaMensualMax) {
        errores.tasaMensual = `La tasa mensual debe estar entre 0 y ${LIMITES.tasaMensualMax} %`;
    }
    const plazo = parsearEntero(plazoMeses);
    if (Number.isNaN(plazo)) {
        errores.plazoMeses = 'El plazo debe ser un número entero de meses';
    } else if (plazo < 1 || plazo > LIMITES.plazoMax) {
        errores.plazoMeses = `Entre 1 y ${LIMITES.plazoMax} meses`;
    }
    return resultado(errores, { monto: valor, tasaMensual: tasa, plazoMeses: plazo });
}

/** Demora simulada (header X-Demora-Ms). Vacío = sin demora. */
export function validarDemora(entrada, maximoMs) {
    const errores = {};
    if (texto(entrada) === '') {
        return resultado(errores, 0);
    }
    const ms = parsearEntero(entrada);
    if (Number.isNaN(ms)) {
        errores.demora = 'Debe ser un número entero de milisegundos';
    } else if (ms > maximoMs) {
        errores.demora = `Máximo ${maximoMs} ms`;
    }
    return resultado(errores, ms);
}
