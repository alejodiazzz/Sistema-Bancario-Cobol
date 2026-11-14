package com.banco.sistema.api;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.banco.sistema.api.dto.ComisionRequest;
import com.banco.sistema.api.dto.CrearCuentaRequest;
import com.banco.sistema.api.dto.CuentaResponse;
import com.banco.sistema.api.dto.InteresRequest;
import com.banco.sistema.api.dto.MontoRequest;
import com.banco.sistema.api.dto.MovimientoResponse;
import com.banco.sistema.api.dto.OperacionResponse;
import com.banco.sistema.servicio.BancoService;

import jakarta.validation.Valid;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/cuentas")
public class CuentaController {

    public static final String HEADER_IDEMPOTENCIA = "X-Idempotency-Key";

    private final BancoService banco;

    public CuentaController(BancoService banco) {
        this.banco = banco;
    }

    @GetMapping
    public Flux<CuentaResponse> listar() {
        return banco.listarCuentas();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<CuentaResponse> abrir(@Valid @RequestBody CrearCuentaRequest req) {
        return banco.abrirCuenta(req);
    }

    @GetMapping("/{numero}")
    public Mono<CuentaResponse> consultar(@PathVariable String numero) {
        return banco.consultarCuenta(numero);
    }

    @GetMapping("/{numero}/movimientos")
    public Flux<MovimientoResponse> movimientos(@PathVariable String numero) {
        return banco.movimientos(numero);
    }

    @PostMapping("/{numero}/depositos")
    public Mono<OperacionResponse> depositar(@PathVariable String numero, @Valid @RequestBody MontoRequest req,
            @RequestHeader(name = HEADER_IDEMPOTENCIA, required = false) String clave) {
        return banco.depositar(numero, req.monto(), clave);
    }

    @PostMapping("/{numero}/retiros")
    public Mono<OperacionResponse> retirar(@PathVariable String numero, @Valid @RequestBody MontoRequest req,
            @RequestHeader(name = HEADER_IDEMPOTENCIA, required = false) String clave) {
        return banco.retirar(numero, req.monto(), clave);
    }

    @PostMapping("/{numero}/intereses")
    public Mono<OperacionResponse> abonarInteres(@PathVariable String numero, @Valid @RequestBody InteresRequest req,
            @RequestHeader(name = HEADER_IDEMPOTENCIA, required = false) String clave) {
        return banco.abonarInteres(numero, req, clave);
    }

    @PostMapping("/{numero}/comisiones")
    public Mono<OperacionResponse> cobrarComision(@PathVariable String numero,
            @Valid @RequestBody ComisionRequest req,
            @RequestHeader(name = HEADER_IDEMPOTENCIA, required = false) String clave) {
        return banco.cobrarComision(numero, req, clave);
    }
}
