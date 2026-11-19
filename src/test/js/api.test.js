import assert from 'node:assert/strict';
import test from 'node:test';
import { crearCliente, ErrorApi } from '../../main/resources/static/js/api.js';

function respuestaFalsa(status, cuerpo) {
    const texto = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => texto,
    };
}

function fetchColgado() {
    const claves = [];
    const fn = (_url, init) => {
        claves.push(init.headers['X-Idempotency-Key']);
        return new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
    };
    return { fn, claves };
}

test('timeout del cliente dispara TIMEOUT_CLIENTE y reintentar conserva la misma X-Idempotency-Key', async () => {
    const { fn, claves } = fetchColgado();
    let contador = 0;
    const cliente = crearCliente({
        fetchFn: fn,
        timeoutMs: 30,
        uuid: () => `uuid-${++contador}`,
    });

    const op = cliente.operacion('/api/cuentas/1012345678/depositos', { monto: 100 });
    await assert.rejects(() => op.ejecutar(), (e) => e instanceof ErrorApi && e.codigo === 'TIMEOUT_CLIENTE');
    await assert.rejects(() => op.ejecutar(), (e) => e instanceof ErrorApi && e.codigo === 'TIMEOUT_CLIENTE');

    assert.deepEqual(claves, ['uuid-1', 'uuid-1']);

    op.renovarClave();
    await assert.rejects(() => op.ejecutar(), (e) => e instanceof ErrorApi && e.codigo === 'TIMEOUT_CLIENTE');
    assert.equal(claves[2], 'uuid-2');
});

test('errores HTTP JSON (422 COBOL), HTML (502), red caída y calibración de /api/config', async () => {
    const cliente422 = crearCliente({
        fetchFn: async () => respuestaFalsa(422, {
            codigo: 'FONDOS_INSUFICIENTES',
            mensaje: 'COBOL rechazó la operación: Fondos insuficientes',
            estadoCobol: 2,
        }),
    });
    await assert.rejects(
        () => cliente422.operacion('/api/cuentas/1012345678/retiros', { monto: 999 }).ejecutar(),
        (e) => e instanceof ErrorApi && e.codigo === 'FONDOS_INSUFICIENTES' && e.estadoCobol === 2 && e.status === 422,
    );

    const cliente502 = crearCliente({
        fetchFn: async () => respuestaFalsa(502, '<html><body>Bad Gateway</body></html>'),
    });
    await assert.rejects(
        () => cliente502.get('/api/cuentas'),
        (e) => e instanceof ErrorApi && e.codigo === 'HTTP_502' && e.status === 502,
    );

    const clienteRed = crearCliente({
        fetchFn: async () => { throw new TypeError('fetch failed'); },
    });
    await assert.rejects(
        () => clienteRed.get('/api/cuentas'),
        (e) => e instanceof ErrorApi && e.codigo === 'SIN_CONEXION',
    );

    const clienteCfg = crearCliente({
        fetchFn: async () => respuestaFalsa(200, {
            timeoutCobolMs: 3000,
            timeoutOperacionMs: 5000,
            simulacionDemoraHabilitada: true,
            demoraMaximaMs: 30000,
            headerDemora: 'X-Demora-Ms',
            headerIdempotencia: 'X-Idempotency-Key',
        }),
    });
    await clienteCfg.cargarConfig();
    assert.equal(clienteCfg.timeoutMs, 6000);
});

test('cancelar con AbortSignal externo produce CANCELADA y no TIMEOUT_CLIENTE', async () => {
    const { fn } = fetchColgado();
    const cliente = crearCliente({ fetchFn: fn, timeoutMs: 5000 });
    const ctrlExterno = new AbortController();
    setTimeout(() => ctrlExterno.abort(), 15);

    const op = cliente.operacion('/api/cuentas/1012345678/depositos', { monto: 50 });
    await assert.rejects(
        () => op.ejecutar({ signal: ctrlExterno.signal }),
        (e) => e instanceof ErrorApi && e.codigo === 'CANCELADA',
    );
});
