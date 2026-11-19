/**
 * Catálogo de errores: codigo del backend (o del cliente) → mensaje para la UI.
 * Módulo puro (sin DOM).
 *
 *  - reintentable: se ofrece el botón REINTENTAR.
 *  - nuevaClave:   antes de reintentar hay que generar otra X-Idempotency-Key.
 *  - incierto:     no se sabe si la operación se aplicó; solo es seguro
 *                  reintentar con la MISMA clave de idempotencia.
 */

export const ERRORES = Object.freeze({
    VALIDACION: {
        titulo: 'DATOS INVÁLIDOS',
        detalle: 'El servidor rechazó el formato de los datos.',
    },
    MISMA_CUENTA: {
        titulo: 'MISMA CUENTA',
        detalle: 'La cuenta origen y la cuenta destino deben ser distintas.',
    },
    CUENTA_NO_ENCONTRADA: {
        titulo: 'CUENTA NO ENCONTRADA',
        detalle: 'La cuenta indicada no existe.',
    },
    MONTO_INVALIDO: {
        titulo: 'MONTO INVÁLIDO',
        detalle: 'COBOL rechazó el monto.',
    },
    FONDOS_INSUFICIENTES: {
        titulo: 'FONDOS INSUFICIENTES',
        detalle: 'El saldo de la cuenta no alcanza para esta operación.',
    },
    PARAMETRO_INVALIDO: {
        titulo: 'PARÁMETRO FUERA DE RANGO',
        detalle: 'La tasa, los días o el plazo están fuera del rango permitido.',
    },
    CONFLICTO_CONCURRENCIA: {
        titulo: 'CONFLICTO DE CONCURRENCIA',
        detalle: 'Otra operación modificó la cuenta al mismo tiempo. Puede reintentar.',
        reintentable: true,
    },
    CLAVE_IDEMPOTENCIA_REUTILIZADA: {
        titulo: 'CLAVE DE OPERACIÓN REUTILIZADA',
        detalle: 'La clave de idempotencia ya se usó en otra operación. Al reintentar se generará una nueva.',
        reintentable: true,
        nuevaClave: true,
    },
    TIMEOUT_COBOL: {
        titulo: 'TIMEOUT EN COBOL',
        detalle: 'El módulo COBOL no respondió a tiempo. La operación fue revertida: no se movió dinero.',
        reintentable: true,
    },
    TIMEOUT_OPERACION: {
        titulo: 'TIMEOUT DE OPERACIÓN',
        detalle: 'La operación superó el tiempo máximo del servidor y fue revertida: no se movió dinero.',
        reintentable: true,
    },
    ERROR_INTERNO: {
        titulo: 'ERROR INTERNO',
        detalle: 'Ocurrió un error en el servidor.',
        reintentable: true,
    },
    // ---- Errores que solo existen en el cliente ----
    TIMEOUT_CLIENTE: {
        titulo: 'SIN RESPUESTA DEL SERVIDOR',
        detalle: 'Se agotó el tiempo de espera del cliente. No se sabe si la operación se aplicó.',
        reintentable: true,
        incierto: true,
    },
    CANCELADA: {
        titulo: 'OPERACIÓN CANCELADA',
        detalle: 'Usted canceló la espera. Si la petición alcanzó al servidor, pudo haberse aplicado.',
        reintentable: true,
        incierto: true,
    },
    SIN_CONEXION: {
        titulo: 'SIN CONEXIÓN CON EL MAINFRAME',
        detalle: 'No se pudo contactar al servidor. Verifique que el backend esté en ejecución.',
        reintentable: true,
        incierto: true,
    },
});

const DESCONOCIDO = {
    titulo: 'ERROR INESPERADO',
    detalle: 'El servidor respondió con un error no reconocido.',
    reintentable: true,
};

/** Mensajes según el contexto, para que el rechazo de COBOL se entienda. */
const POR_CONTEXTO = {
    interes: {
        MONTO_INVALIDO: 'La cuenta no tiene saldo para causar intereses (el saldo debe ser mayor que cero).',
    },
    comision: {
        FONDOS_INSUFICIENTES: 'La comisión es mayor que el saldo: COBOL no permite dejar la cuenta en negativo.',
    },
    transferencia: {
        CUENTA_NO_ENCONTRADA: 'La cuenta origen o la cuenta destino no existe.',
        FONDOS_INSUFICIENTES: 'La cuenta origen no tiene saldo suficiente para transferir ese monto.',
    },
};

/**
 * Convierte un ErrorApi (u otro error) en la información que muestra la UI.
 * @param {{codigo?: string, mensaje?: string, status?: number, estadoCobol?: number}} error
 * @param {string} [contexto] 'interes' | 'comision' | 'transferencia' | ...
 */
export function describirError(error, contexto) {
    const codigo = error?.codigo ?? 'ERROR_INTERNO';
    let base = ERRORES[codigo];
    if (!base && /^HTTP_\d{3}$/.test(codigo)) {
        base = { titulo: `ERROR HTTP ${codigo.slice(5)}`, detalle: 'Respuesta inesperada del servidor.', reintentable: true };
    }
    base = base ?? DESCONOCIDO;
    const especial = POR_CONTEXTO[contexto]?.[codigo];
    const delServidor = error?.status && error?.mensaje ? error.mensaje : null;
    return {
        codigo,
        titulo: base.titulo,
        detalle: especial ?? delServidor ?? base.detalle,
        servidor: especial && delServidor ? delServidor : null,
        estadoCobol: error?.estadoCobol ?? null,
        status: error?.status ?? null,
        reintentable: Boolean(base.reintentable),
        nuevaClave: Boolean(base.nuevaClave),
        incierto: Boolean(base.incierto),
    };
}

/** Código de retorno para la línea de estado: RC=0002 (COBOL) o RC=0504 (HTTP). */
export function codigoRetorno(error) {
    const n = error?.estadoCobol ?? error?.status ?? 9999;
    return `RC=${String(n).padStart(4, '0')}`;
}
