/**
 * Cliente HTTP del API bancario (módulo puro, sin DOM).
 *
 * Política de timeouts en el cliente (recomendada en el README del backend):
 *  - Timeout de cliente = timeoutOperacionMs del servidor + 1 s. Si el servidor
 *    corta primero llega un 504 claro; si corta el cliente, la red falló.
 *  - Cada petición usa un AbortController; el usuario también puede cancelar.
 *  - Las operaciones que mueven dinero llevan X-Idempotency-Key. La clave se
 *    conserva entre reintentos, así el reintento nunca mueve dinero dos veces.
 */

export const TIMEOUT_POR_DEFECTO_MS = 6000;
export const MARGEN_TIMEOUT_MS = 1000;

export class ErrorApi extends Error {
    constructor(codigo, mensaje, status = null, estadoCobol = null) {
        super(mensaje || codigo);
        this.name = 'ErrorApi';
        this.codigo = codigo;
        this.mensaje = mensaje || null;
        this.status = status;
        this.estadoCobol = estadoCobol;
    }
}

/**
 * UUID v4. crypto.randomUUID() solo existe en contextos seguros (HTTPS o
 * localhost); si se entra por la IP de la LAN se arma con getRandomValues().
 */
export function generarUuid() {
    const c = globalThis.crypto;
    if (c?.randomUUID) {
        return c.randomUUID();
    }
    const b = new Uint8Array(16);
    if (c?.getRandomValues) {
        c.getRandomValues(b);
    } else {
        for (let i = 0; i < 16; i++) {
            b[i] = Math.floor(Math.random() * 256);
        }
    }
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function leerJsonSeguro(resp) {
    const texto = await resp.text();
    if (!texto) {
        return null;
    }
    try {
        return JSON.parse(texto);
    } catch {
        return null; // p. ej. una página HTML de un proxy
    }
}

/**
 * @param {object} [opciones]
 * @param {typeof fetch} [opciones.fetchFn]
 * @param {string} [opciones.base]       prefijo de URL ('' = mismo origen)
 * @param {number} [opciones.timeoutMs]  timeout inicial (antes de leer /api/config)
 * @param {() => string} [opciones.uuid]
 */
export function crearCliente({
    fetchFn = (...a) => globalThis.fetch(...a),
    base = '',
    timeoutMs = TIMEOUT_POR_DEFECTO_MS,
    uuid = generarUuid,
} = {}) {
    let timeout = timeoutMs;
    let headerIdempotencia = 'X-Idempotency-Key';
    let headerDemora = 'X-Demora-Ms';

    async function solicitar(metodo, ruta, cuerpo, { clave, demoraMs, signal, timeoutMs: limite } = {}) {
        const ctrl = new AbortController();
        const ms = Number.isFinite(limite) && limite > 0 ? limite : timeout;
        const timer = setTimeout(() => ctrl.abort('TIMEOUT_CLIENTE'), ms);
        const alCancelar = () => ctrl.abort('CANCELADA');
        if (signal?.aborted) {
            alCancelar();
        } else {
            signal?.addEventListener('abort', alCancelar, { once: true });
        }

        const headers = { Accept: 'application/json' };
        if (cuerpo !== null && cuerpo !== undefined) {
            headers['Content-Type'] = 'application/json';
        }
        if (clave) {
            headers[headerIdempotencia] = clave;
        }
        if (demoraMs > 0) {
            headers[headerDemora] = String(demoraMs);
        }

        try {
            if (ctrl.signal.aborted) {
                throw new ErrorApi(ctrl.signal.reason);
            }
            const resp = await fetchFn(base + ruta, {
                method: metodo,
                headers,
                body: cuerpo === null || cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
                signal: ctrl.signal,
            });
            const datos = await leerJsonSeguro(resp);
            if (!resp.ok) {
                throw new ErrorApi(datos?.codigo ?? `HTTP_${resp.status}`, datos?.mensaje ?? null,
                    resp.status, datos?.estadoCobol ?? null);
            }
            return datos;
        } catch (e) {
            if (e instanceof ErrorApi) {
                throw e;
            }
            if (ctrl.signal.aborted) {
                throw new ErrorApi(ctrl.signal.reason === 'CANCELADA' ? 'CANCELADA' : 'TIMEOUT_CLIENTE');
            }
            throw new ErrorApi('SIN_CONEXION', e?.message ?? null);
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', alCancelar);
        }
    }

    return {
        /** Timeout actual del cliente en ms. */
        get timeoutMs() {
            return timeout;
        },

        /** Lee /api/config y calibra el timeout y los nombres de headers. */
        async cargarConfig(opts) {
            const cfg = await solicitar('GET', '/api/config', null, opts);
            if (Number.isFinite(cfg?.timeoutOperacionMs) && cfg.timeoutOperacionMs > 0) {
                timeout = cfg.timeoutOperacionMs + MARGEN_TIMEOUT_MS;
            }
            headerIdempotencia = cfg?.headerIdempotencia || headerIdempotencia;
            headerDemora = cfg?.headerDemora || headerDemora;
            return cfg;
        },

        get(ruta, opts) {
            return solicitar('GET', ruta, null, opts);
        },

        /**
         * Crea una operación POST reintentable.
         * @param {boolean} [conClave=true] enviar X-Idempotency-Key
         */
        operacion(ruta, cuerpo, { conClave = true } = {}) {
            let clave = conClave ? uuid() : null;
            return {
                get clave() {
                    return clave;
                },
                ejecutar(opts = {}) {
                    return solicitar('POST', ruta, cuerpo, { ...opts, clave });
                },
                /** Solo tras CLAVE_IDEMPOTENCIA_REUTILIZADA. */
                renovarClave() {
                    if (conClave) {
                        clave = uuid();
                    }
                },
            };
        },
    };
}

/** Rutas del API (los números de cuenta van codificados en la URL). */
export const rutas = {
    config: '/api/config',
    cuentas: '/api/cuentas',
    cuenta: (n) => `/api/cuentas/${encodeURIComponent(n)}`,
    movimientos: (n) => `/api/cuentas/${encodeURIComponent(n)}/movimientos`,
    depositos: (n) => `/api/cuentas/${encodeURIComponent(n)}/depositos`,
    retiros: (n) => `/api/cuentas/${encodeURIComponent(n)}/retiros`,
    intereses: (n) => `/api/cuentas/${encodeURIComponent(n)}/intereses`,
    comisiones: (n) => `/api/cuentas/${encodeURIComponent(n)}/comisiones`,
    transferencias: '/api/transferencias',
    simulacionCredito: '/api/creditos/simulacion',
};
