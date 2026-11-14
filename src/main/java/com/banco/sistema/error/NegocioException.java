package com.banco.sistema.error;

public class NegocioException extends RuntimeException {

    private final CodigoError codigo;
    private final Integer estadoCobol;

    public NegocioException(CodigoError codigo, String mensaje) {
        this(codigo, mensaje, null);
    }

    public NegocioException(CodigoError codigo, String mensaje, Integer estadoCobol) {
        super(mensaje);
        this.codigo = codigo;
        this.estadoCobol = estadoCobol;
    }

    public CodigoError codigo() {
        return codigo;
    }

    public Integer estadoCobol() {
        return estadoCobol;
    }
}
