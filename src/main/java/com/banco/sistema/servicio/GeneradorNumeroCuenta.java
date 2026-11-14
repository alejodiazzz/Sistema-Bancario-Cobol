package com.banco.sistema.servicio;

import java.security.SecureRandom;

import org.springframework.stereotype.Component;

/** Genera números de cuenta de 10 dígitos con prefijo "10". */
@Component
public class GeneradorNumeroCuenta {

    private static final SecureRandom RANDOM = new SecureRandom();

    public String siguiente() {
        return "10" + String.format("%08d", RANDOM.nextInt(100_000_000));
    }
}
