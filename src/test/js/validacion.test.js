import assert from 'node:assert/strict';
import test from 'node:test';
import {
    validarAperturaCuenta,
    validarCredito,
    validarInteres,
    validarTransferencia,
} from '../../main/resources/static/js/validacion.js';

test('validarInteres respeta los límites de COBOL (tasa 0..100, días entero 1..3650)', () => {
    assert.equal(validarInteres({ tasaAnual: '0', dias: '30' }).ok, false);
    assert.equal(validarInteres({ tasaAnual: '100', dias: '3650' }).ok, true);
    assert.equal(validarInteres({ tasaAnual: '100.01', dias: '30' }).ok, false);
    assert.equal(validarInteres({ tasaAnual: '12,5', dias: '0' }).ok, false);
    assert.equal(validarInteres({ tasaAnual: '12,5', dias: '3651' }).ok, false);
    assert.equal(validarInteres({ tasaAnual: '12,5', dias: '30.5' }).ok, false);

    const ok = validarInteres({ tasaAnual: '12,5', dias: '30' });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.valor, { tasaAnual: 12.5, dias: 30 });
});

test('validarCredito respeta los límites de COBOL (tasa 0..20, plazo entero 1..360)', () => {
    const sinInteres = validarCredito({ monto: '1000000', tasaMensual: '0', plazoMeses: '12' });
    assert.equal(sinInteres.ok, true);
    assert.deepEqual(sinInteres.valor, { monto: 1000000, tasaMensual: 0, plazoMeses: 12 });

    assert.equal(validarCredito({ monto: '1000', tasaMensual: '20', plazoMeses: '360' }).ok, true);
    assert.equal(validarCredito({ monto: '1000', tasaMensual: '20.01', plazoMeses: '12' }).ok, false);
    assert.equal(validarCredito({ monto: '1000', tasaMensual: '-1', plazoMeses: '12' }).ok, false);
    assert.equal(validarCredito({ monto: '1000', tasaMensual: '1', plazoMeses: '0' }).ok, false);
    assert.equal(validarCredito({ monto: '1000', tasaMensual: '1', plazoMeses: '361' }).ok, false);
    assert.equal(validarCredito({ monto: '1000', tasaMensual: '1', plazoMeses: '12.5' }).ok, false);
});

test('validarTransferencia y validarAperturaCuenta cubren misma cuenta, formato y titular', () => {
    const misma = validarTransferencia({
        cuentaOrigen: ' 1012345678 ',
        cuentaDestino: '1012345678',
        monto: '100',
    });
    assert.equal(misma.ok, false);
    assert.ok(misma.errores.cuentaDestino);

    const formatoInvalido = validarTransferencia({
        cuentaOrigen: '123',
        cuentaDestino: '1098765432',
        monto: '100',
    });
    assert.equal(formatoInvalido.ok, false);
    assert.ok(formatoInvalido.errores.cuentaOrigen);

    assert.equal(validarTransferencia({
        cuentaOrigen: '1012345678',
        cuentaDestino: '1098765432',
        monto: '120,50',
    }).ok, true);

    assert.equal(validarAperturaCuenta({ titular: '   ' }).ok, false);
    assert.equal(validarAperturaCuenta({ titular: 'A'.repeat(100), depositoInicial: '' }).ok, true);
    assert.equal(validarAperturaCuenta({ titular: 'A'.repeat(101), depositoInicial: '' }).ok, false);
});
