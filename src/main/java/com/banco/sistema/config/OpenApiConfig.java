package com.banco.sistema.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;

/** Swagger UI en http://localhost:8080/swagger-ui.html */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI bancoOpenApi() {
        return new OpenAPI().info(new Info()
                .title("Sistema Bancario COBOL + WebFlux")
                .version("1.0.0")
                .description("""
                        Operaciones bancarias cuya lógica vive en banco.dll (GnuCOBOL), invocada vía JNA.
                        Headers opcionales: X-Idempotency-Key (reintentos seguros) y
                        X-Demora-Ms (solo pruebas: simula lentitud del módulo COBOL)."""));
    }
}
