package com.banco.sistema.cobol;

import com.sun.jna.Library;
import com.sun.jna.ptr.DoubleByReference;
import com.sun.jna.ptr.IntByReference;
import com.sun.jna.ptr.LongByReference;

/**
 * Firmas C equivalentes a cada PROCEDURE DIVISION USING de cobol/banco.cbl.
 * Dinero: PIC S9(18) COMP-5 -> long (centavos). Tasas: COMP-2 -> double.
 * Estado: PIC S9(9) COMP-5 -> int. Todo por referencia.
 */
public interface BancoCobolLib extends Library {

    void depositar(LongByReference saldo, LongByReference monto,
                   LongByReference nuevoSaldo, IntByReference estado);

    void retirar(LongByReference saldo, LongByReference monto,
                 LongByReference nuevoSaldo, IntByReference estado);

    void transferir(LongByReference saldoOrigen, LongByReference saldoDestino,
                    LongByReference monto, LongByReference nuevoOrigen,
                    LongByReference nuevoDestino, IntByReference estado);

    void abonar_interes(LongByReference saldo, DoubleByReference tasaAnual,
                        IntByReference dias, LongByReference interes,
                        LongByReference nuevoSaldo, IntByReference estado);

    void simular_credito(LongByReference monto, DoubleByReference tasaMensual,
                         IntByReference plazo, LongByReference cuota,
                         LongByReference total, IntByReference estado);

    void cobrar_comision(LongByReference saldo, LongByReference comision,
                         LongByReference nuevoSaldo, IntByReference estado);
}
