package com.banco.sistema.servicio;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.concurrent.TimeoutException;
import java.util.function.Function;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.reactive.TransactionalOperator;

import com.banco.sistema.api.dto.ComisionRequest;
import com.banco.sistema.api.dto.CrearCuentaRequest;
import com.banco.sistema.api.dto.CreditoRequest;
import com.banco.sistema.api.dto.CreditoResponse;
import com.banco.sistema.api.dto.CuentaResponse;
import com.banco.sistema.api.dto.Dinero;
import com.banco.sistema.api.dto.InteresRequest;
import com.banco.sistema.api.dto.MovimientoResponse;
import com.banco.sistema.api.dto.OperacionResponse;
import com.banco.sistema.api.dto.TransferenciaRequest;
import com.banco.sistema.cobol.CobolGateway;
import com.banco.sistema.config.BancoProperties;
import com.banco.sistema.dominio.Cuenta;
import com.banco.sistema.dominio.CuentaRepository;
import com.banco.sistema.dominio.Movimiento;
import com.banco.sistema.dominio.MovimientoRepository;
import com.banco.sistema.dominio.TipoMovimiento;
import com.banco.sistema.error.CodigoError;
import com.banco.sistema.error.NegocioException;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;

/**
 * Orquesta cada operación: lee la cuenta, delega el cálculo a COBOL,
 * persiste saldo + movimiento en una única transacción reactiva.
 */
@Service
public class BancoService {

    private final CuentaRepository cuentas;
    private final MovimientoRepository movimientos;
    private final CobolGateway cobol;
    private final TransactionalOperator tx;
    private final Duration timeoutOperacion;
    private final GeneradorNumeroCuenta generador;

    public BancoService(CuentaRepository cuentas, MovimientoRepository movimientos, CobolGateway cobol,
                        TransactionalOperator tx, BancoProperties props, GeneradorNumeroCuenta generador) {
        this.generador = generador;
        this.cuentas = cuentas;
        this.movimientos = movimientos;
        this.cobol = cobol;
        this.tx = tx;
        this.timeoutOperacion = props.timeout().operacion();
    }

    // ---------------------------------------------------------------- consultas

    public Flux<CuentaResponse> listarCuentas() {
        return cuentas.findAllByOrderByIdAsc().map(CuentaResponse::de);
    }

    public Mono<CuentaResponse> consultarCuenta(String numero) {
        return buscarCuenta(numero).map(CuentaResponse::de);
    }

    public Flux<MovimientoResponse> movimientos(String numero) {
        return buscarCuenta(numero)
                .flatMapMany(c -> movimientos.findByCuentaIdOrderByIdDesc(c.id()))
                .map(MovimientoResponse::de);
    }

    // ------------------------------------------------------------- operaciones

    public Mono<CuentaResponse> abrirCuenta(CrearCuentaRequest req) {
        long deposito = Dinero.aCentavos(req.depositoInicial());
        Mono<Long> saldoInicial = deposito == 0
                ? Mono.just(0L)
                : cobol.depositar(0, deposito).map(CobolGateway.Saldo::nuevoSaldo);
        Mono<CuentaResponse> op = saldoInicial
                .flatMap(saldo -> cuentas.save(Cuenta.nueva(generador.siguiente(), req.titular().trim(), saldo)))
                .flatMap(c -> movimientos.save(Movimiento.de(c.id(), TipoMovimiento.APERTURA, 0,
                                c.saldoCentavos(), null, "Apertura de cuenta", null))
                        .thenReturn(CuentaResponse.de(c)));
        // Si el número aleatorio ya existe (UNIQUE), se reintenta con otro número.
        return conPoliticas(op).retryWhen(Retry.max(5)
                .filter(DataIntegrityViolationException.class::isInstance)
                .onRetryExhaustedThrow((spec, signal) -> new NegocioException(CodigoError.ERROR_INTERNO,
                        "No fue posible asignar un número de cuenta único")));
    }

    public Mono<OperacionResponse> depositar(String numero, BigDecimal monto, String clave) {
        long m = Dinero.aCentavos(monto);
        return operarCuenta(numero, TipoMovimiento.DEPOSITO, clave, "Depósito",
                saldo -> cobol.depositar(saldo, m).map(CobolGateway.Saldo::nuevoSaldo));
    }

    public Mono<OperacionResponse> retirar(String numero, BigDecimal monto, String clave) {
        long m = Dinero.aCentavos(monto);
        return operarCuenta(numero, TipoMovimiento.RETIRO, clave, "Retiro",
                saldo -> cobol.retirar(saldo, m).map(CobolGateway.Saldo::nuevoSaldo));
    }

    public Mono<OperacionResponse> abonarInteres(String numero, InteresRequest req, String clave) {
        String desc = "Interés %.4f%% anual por %d días".formatted(req.tasaAnual(), req.dias());
        return operarCuenta(numero, TipoMovimiento.INTERES, clave, desc,
                saldo -> cobol.abonarInteres(saldo, req.tasaAnual(), req.dias())
                        .map(CobolGateway.Interes::nuevoSaldo));
    }

    public Mono<OperacionResponse> cobrarComision(String numero, ComisionRequest req, String clave) {
        long m = Dinero.aCentavos(req.monto());
        String desc = req.concepto() == null || req.concepto().isBlank() ? "Comisión" : req.concepto().trim();
        return operarCuenta(numero, TipoMovimiento.COMISION, clave, desc,
                saldo -> cobol.cobrarComision(saldo, m).map(CobolGateway.Saldo::nuevoSaldo));
    }

    public Mono<OperacionResponse> transferir(TransferenciaRequest req, String clave) {
        String origen = req.cuentaOrigen().trim();
        String destino = req.cuentaDestino().trim();
        if (origen.equals(destino)) {
            return Mono.error(new NegocioException(CodigoError.MISMA_CUENTA,
                    "La cuenta origen y destino deben ser distintas"));
        }
        long monto = Dinero.aCentavos(req.monto());

        // Las sentencias se encadenan en secuencia: una transacción R2DBC usa una sola conexión.
        Mono<OperacionResponse> op = buscarCuenta(origen).flatMap(o -> buscarCuenta(destino).flatMap(d ->
                cobol.transferir(o.saldoCentavos(), d.saldoCentavos(), monto).flatMap(r ->
                        cuentas.save(o.conSaldo(r.nuevoOrigen())).flatMap(oG ->
                        cuentas.save(d.conSaldo(r.nuevoDestino())).flatMap(dG ->
                        movimientos.save(Movimiento.de(o.id(), TipoMovimiento.TRANSFERENCIA_ENVIADA,
                                o.saldoCentavos(), r.nuevoOrigen(), destino, "Transferencia a " + destino, clave))
                        .flatMap(envio -> movimientos.save(Movimiento.de(d.id(),
                                        TipoMovimiento.TRANSFERENCIA_RECIBIDA, d.saldoCentavos(),
                                        r.nuevoDestino(), origen, "Transferencia de " + origen, null))
                                .thenReturn(OperacionResponse.de(oG, envio,
                                                "Transferencia procesada por el módulo COBOL")
                                        .conDestino(Dinero.aPesos(dG.saldoCentavos())))))))));
        return idempotente(clave, TipoMovimiento.TRANSFERENCIA_ENVIADA, conPoliticas(op));
    }

    public Mono<CreditoResponse> simularCredito(CreditoRequest req) {
        long monto = Dinero.aCentavos(req.monto());
        return cobol.simularCredito(monto, req.tasaMensual(), req.plazoMeses())
                .map(r -> new CreditoResponse(Dinero.aPesos(monto), req.tasaMensual(), req.plazoMeses(),
                        Dinero.aPesos(r.cuota()), Dinero.aPesos(r.total()), Dinero.aPesos(r.total() - monto)))
                .timeout(timeoutOperacion)
                .onErrorMap(TimeoutException.class, e -> timeoutOperacion());
    }

    // ---------------------------------------------------------------- internos

    /** Plantilla para operaciones sobre una sola cuenta (depósito, retiro, interés, comisión). */
    private Mono<OperacionResponse> operarCuenta(String numero, TipoMovimiento tipo, String clave, String descripcion,
                                                 Function<Long, Mono<Long>> calcularNuevoSaldo) {
        Mono<OperacionResponse> op = buscarCuenta(numero)
                .flatMap(c -> calcularNuevoSaldo.apply(c.saldoCentavos())
                        .flatMap(nuevo -> cuentas.save(c.conSaldo(nuevo))
                                .flatMap(guardada -> movimientos.save(Movimiento.de(guardada.id(), tipo,
                                                c.saldoCentavos(), nuevo, null, descripcion, clave))
                                        .map(m -> OperacionResponse.de(guardada, m,
                                                descripcion + " procesado por el módulo COBOL")))));
        return idempotente(clave, tipo, conPoliticas(op));
    }

    /**
     * Transacción + reintentos ante conflicto de versión (bloqueo optimista)
     * + timeout global de la operación. Si vence el timeout, la transacción
     * se cancela y hace rollback: nunca queda un saldo a medias.
     */
    private <T> Mono<T> conPoliticas(Mono<T> operacion) {
        return tx.transactional(operacion)
                .retryWhen(Retry.backoff(3, Duration.ofMillis(20))
                        .filter(OptimisticLockingFailureException.class::isInstance)
                        .onRetryExhaustedThrow((spec, signal) -> new NegocioException(
                                CodigoError.CONFLICTO_CONCURRENCIA,
                                "La cuenta fue modificada por otra operación, intente de nuevo")))
                .timeout(timeoutOperacion)
                .onErrorMap(TimeoutException.class, e -> timeoutOperacion());
    }

    /**
     * Si el cliente reintenta (p. ej. tras un timeout) con la misma clave
     * X-Idempotency-Key, se devuelve el resultado original sin volver a mover dinero.
     */
    private Mono<OperacionResponse> idempotente(String clave, TipoMovimiento tipo, Mono<OperacionResponse> op) {
        if (clave == null || clave.isBlank()) {
            return op;
        }
        return movimientos.findByClaveIdempotencia(clave)
                .flatMap(previo -> {
                    if (previo.tipo() != tipo) {
                        return Mono.<OperacionResponse>error(new NegocioException(
                                CodigoError.CLAVE_IDEMPOTENCIA_REUTILIZADA,
                                "La clave de idempotencia ya se usó en otra operación"));
                    }
                    return cuentas.findById(previo.cuentaId())
                            .map(c -> OperacionResponse.de(c, previo, previo.descripcion()).comoRepetida());
                })
                .switchIfEmpty(Mono.defer(() -> op));
    }

    private Mono<Cuenta> buscarCuenta(String numero) {
        return cuentas.findByNumero(numero)
                .switchIfEmpty(Mono.error(() -> new NegocioException(CodigoError.CUENTA_NO_ENCONTRADA,
                        "No existe la cuenta " + numero)));
    }

    private NegocioException timeoutOperacion() {
        return new NegocioException(CodigoError.TIMEOUT_OPERACION,
                "La operación superó el tiempo máximo de %d ms y fue revertida"
                        .formatted(timeoutOperacion.toMillis()));
    }

}
