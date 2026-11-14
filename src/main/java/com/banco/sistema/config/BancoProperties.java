package com.banco.sistema.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Propiedades "banco.*" de application.yml. */
@ConfigurationProperties(prefix = "banco")
public record BancoProperties(Cobol cobol, Timeout timeout, Simulacion simulacion, Cors cors) {

    public record Cobol(String directorio, String nombreLibreria, String gnucobolBin) {
    }

    public record Timeout(Duration cobol, Duration operacion) {
    }

    public record Simulacion(boolean habilitada, Duration demoraMaxima) {
    }

    public record Cors(String origenesPermitidos) {
    }
}
