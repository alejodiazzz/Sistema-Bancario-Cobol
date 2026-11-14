package com.banco.sistema.api.dto;

/** Configuración que el front necesita para calibrar sus propios timeouts. */
public record ConfigResponse(long timeoutCobolMs, long timeoutOperacionMs, boolean simulacionDemoraHabilitada,
                             long demoraMaximaMs, String headerDemora, String headerIdempotencia) {
}
