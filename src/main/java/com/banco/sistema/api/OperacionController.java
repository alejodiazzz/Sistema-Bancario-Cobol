package com.banco.sistema.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.banco.sistema.api.dto.ConfigResponse;
import com.banco.sistema.api.dto.CreditoRequest;
import com.banco.sistema.api.dto.CreditoResponse;
import com.banco.sistema.api.dto.OperacionResponse;
import com.banco.sistema.api.dto.TransferenciaRequest;
import com.banco.sistema.cobol.DemoraSimuladaFilter;
import com.banco.sistema.config.BancoProperties;
import com.banco.sistema.servicio.BancoService;

import jakarta.validation.Valid;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api")
public class OperacionController {

    private final BancoService banco;
    private final BancoProperties props;

    public OperacionController(BancoService banco, BancoProperties props) {
        this.banco = banco;
        this.props = props;
    }

    @PostMapping("/transferencias")
    public Mono<OperacionResponse> transferir(@Valid @RequestBody TransferenciaRequest req,
            @RequestHeader(name = CuentaController.HEADER_IDEMPOTENCIA, required = false) String clave) {
        return banco.transferir(req, clave);
    }

    @PostMapping("/creditos/simulacion")
    public Mono<CreditoResponse> simularCredito(@Valid @RequestBody CreditoRequest req) {
        return banco.simularCredito(req);
    }

    @GetMapping("/config")
    public ConfigResponse config() {
        return new ConfigResponse(
                props.timeout().cobol().toMillis(),
                props.timeout().operacion().toMillis(),
                props.simulacion().habilitada(),
                props.simulacion().demoraMaxima().toMillis(),
                DemoraSimuladaFilter.HEADER,
                CuentaController.HEADER_IDEMPOTENCIA);
    }
}
