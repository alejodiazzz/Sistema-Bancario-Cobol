package com.banco.sistema.cobol;

import com.banco.sistema.error.CodigoError;

/** Códigos devueltos por LK-ESTADO en banco.cbl. */
public enum EstadoCobol {
    EXITO(0, null, "Operación exitosa"),
    MONTO_INVALIDO(1, CodigoError.MONTO_INVALIDO, "El monto debe ser mayor que cero"),
    FONDOS_INSUFICIENTES(2, CodigoError.FONDOS_INSUFICIENTES, "Fondos insuficientes"),
    PARAMETRO_INVALIDO(3, CodigoError.PARAMETRO_INVALIDO, "Tasa, plazo o días fuera de rango");

    private final int codigo;
    private final CodigoError error;
    private final String mensaje;

    EstadoCobol(int codigo, CodigoError error, String mensaje) {
        this.codigo = codigo;
        this.error = error;
        this.mensaje = mensaje;
    }

    public static EstadoCobol desde(int codigo) {
        for (EstadoCobol e : values()) {
            if (e.codigo == codigo) {
                return e;
            }
        }
        throw new IllegalStateException("Estado COBOL desconocido: " + codigo);
    }

    public int codigo() { return codigo; }
    public CodigoError error() { return error; }
    public String mensaje() { return mensaje; }
}
