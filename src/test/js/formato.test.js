import assert from 'node:assert/strict';
import test from 'node:test';
import {
    centavosAJson,
    formatoFecha,
    formatoPesos,
    MONTO_MAX_CENTAVOS,
    parsearMonto,
} from '../../main/resources/static/js/formato.js';

test('parsearMonto acepta montos válidos en centavos y rechaza casos borde', () => {
    assert.deepEqual(parsearMonto('250'), { ok: true, centavos: 25000 });
    assert.deepEqual(parsearMonto('250,5'), { ok: true, centavos: 25050 });
    assert.deepEqual(parsearMonto(' 0.30 '), { ok: true, centavos: 30 });
    assert.deepEqual(parsearMonto('0'), { ok: true, centavos: 0 });
    assert.deepEqual(parsearMonto('999999999999.99'), { ok: true, centavos: MONTO_MAX_CENTAVOS });

    const invalidos = [
        null,
        undefined,
        '',
        '   ',
        '-5',
        '+5',
        '1e3',
        '1.000,50',
        '10.999',
        'abc',
        'Infinity',
        'NaN',
        '1000000000000',
    ];
    for (const caso of invalidos) {
        assert.equal(parsearMonto(caso).ok, false, `debió rechazar: ${String(caso)}`);
    }
});

test('formatoPesos, centavosAJson y formatoFecha conservan precisión y sin corrimiento de zona', () => {
    assert.equal(centavosAJson(1999), 19.99);
    assert.equal(centavosAJson(30), 0.3);
    assert.equal(JSON.stringify({ monto: centavosAJson(1999) }), '{"monto":19.99}');

    assert.equal(formatoPesos(250.5), '$ 250,50');
    assert.equal(formatoPesos(0), '$ 0,00');
    assert.equal(formatoPesos(1234567.89), '$ 1.234.567,89');
    assert.equal(formatoPesos(null), '—');

    assert.equal(formatoFecha('2026-11-18T18:52:15.123'), '2026-11-18 18:52:15');
});
