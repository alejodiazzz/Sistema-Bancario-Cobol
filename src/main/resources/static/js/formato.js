/**
 * Conversión y formato de dinero y fechas.
 * Módulo puro (sin DOM): lo usan el navegador y las pruebas de Node.
 *
 * El backend trabaja en centavos (PIC S9(18) COMP-5 en COBOL). Aquí los montos
 * escritos por el usuario se convierten a centavos enteros manipulando el texto,
 * nunca con parseFloat, para no arrastrar errores de punto flotante.
 */

/** 999.999.999.999,99 pesos: cabe en Number.MAX_SAFE_INTEGER y en el long de COBOL. */
export const MONTO_MAX_CENTAVOS = 99_999_999_999_999;

const RE_MONTO = /^(\d+)(?:[.,](\d{1,2}))?$/;

/**
 * Convierte un monto escrito por el usuario a centavos.
 * Acepta "250", "250.5", "250,50". Rechaza signos, notación científica,
 * separadores de miles, más de 2 decimales y textos no numéricos.
 * @returns {{ok: true, centavos: number} | {ok: false, error: string}}
 */
export function parsearMonto(entrada) {
    if (entrada === null || entrada === undefined) {
        return { ok: false, error: 'Ingrese un monto' };
    }
    const texto = String(entrada).trim();
    if (texto === '') {
        return { ok: false, error: 'Ingrese un monto' };
    }
    const m = RE_MONTO.exec(texto);
    if (!m) {
        if (/^[+-]/.test(texto)) {
            return { ok: false, error: 'Escriba el monto sin signo (solo valores positivos)' };
        }
        if (/^\d+[.,]\d{3,}$/.test(texto)) {
            return { ok: false, error: 'Máximo 2 decimales (no use separador de miles)' };
        }
        if (/^\d{1,3}([.,]\d{3})+([.,]\d{1,2})?$/.test(texto)) {
            return { ok: false, error: 'No use separador de miles (ej. 1500000,50)' };
        }
        return { ok: false, error: 'Formato inválido: use dígitos y hasta 2 decimales (ej. 1500,50)' };
    }
    const entero = m[1].replace(/^0+(?=\d)/, '');
    if (entero.length > 12) {
        return { ok: false, error: 'El monto excede el máximo permitido' };
    }
    const decimales = (m[2] ?? '').padEnd(2, '0');
    const centavos = Number(entero) * 100 + Number(decimales);
    if (centavos > MONTO_MAX_CENTAVOS) {
        return { ok: false, error: 'El monto excede el máximo permitido' };
    }
    return { ok: true, centavos };
}

/**
 * Centavos → número en pesos para el JSON del API (1999 → 19.99).
 * La división en coma flotante está correctamente redondeada, así que el número
 * resultante se serializa con su representación decimal exacta.
 */
export function centavosAJson(centavos) {
    return centavos / 100;
}

/** Pesos (número o texto del backend, ej. 250.5) → centavos enteros, solo para mostrar. */
export function pesosACentavos(pesos) {
    const n = Number(pesos);
    return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** 1234567.89 → "$ 1.234.567,89" (siempre 2 decimales, formato colombiano). */
export function formatoPesos(pesos) {
    const centavos = pesosACentavos(pesos);
    if (pesos === null || pesos === undefined || pesos === '' || !Number.isFinite(centavos)) {
        return '—';
    }
    const signo = centavos < 0 ? '-' : '';
    const abs = Math.abs(centavos);
    const entero = String(Math.trunc(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const dec = String(abs % 100).padStart(2, '0');
    return `${signo}$ ${entero},${dec}`;
}

/** "2026-11-18T18:52:15.123" (LocalDateTime sin zona) → "2026-11-18 18:52:15", sin convertir zona. */
export function formatoFecha(valor) {
    if (!valor) {
        return '—';
    }
    const texto = String(valor);
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/.exec(texto);
    return m ? `${m[1]} ${m[2]}` : texto;
}

/** Porcentaje con coma decimal: 12.5 → "12,5 %". */
export function formatoPorcentaje(valor) {
    const n = Number(valor);
    if (!Number.isFinite(n)) {
        return '—';
    }
    return `${String(Math.round(n * 10000) / 10000).replace('.', ',')} %`;
}
