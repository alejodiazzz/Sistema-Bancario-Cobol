# Sistema Bancario COBOL + Java (WebFlux)

Transacciones bancarias con persistencia. Las reglas de negocio están en **COBOL** (`cobol/banco.cbl`), compiladas a **`banco.dll`**, y se invocan desde **Spring WebFlux** usando **JNA**.

- Documentación del API en vivo: `http://localhost:8080/swagger-ui.html`
- Detalle técnico: [ARQUITECTURA.md](ARQUITECTURA.md)

## Reparto del Entregable A

| | Persona A — Backend / COBOL | Persona B — Frontend |
|---|---|---|
| Alcance | Programas COBOL en DLL (6 operaciones), puente JNA, API REST reactiva (WebFlux), persistencia (R2DBC + H2), timeouts del servidor, idempotencia, pruebas | Interfaz gráfica que consume el API, **gestión de timeouts en el cliente** (AbortController, indicador de carga, cancelar, reintentar), mensajes de error |
| Carpetas | `cobol/`, `src/main/java/`, `src/main/resources/*.yml / schema.sql`, `src/test/` | `src/main/resources/static/` (se sirve en `http://localhost:8080/`) o un proyecto aparte (CORS abierto) |
| Entrega | API documentado abajo y en Swagger + 12 pruebas pasando + ARQUITECTURA.md | Pantallas para las 6 operaciones + consulta de saldo/movimientos |

Punto de integración: el **contrato del API** de esta página. Persona B puede probar timeouts sin tocar el backend usando el header `X-Demora-Ms`.

## Operaciones COBOL (`banco.dll`)

| # | Programa COBOL | Endpoint | Regla |
|---|---|---|---|
| 1 | `depositar` | `POST /api/cuentas/{n}/depositos` | monto > 0 |
| 2 | `retirar` | `POST /api/cuentas/{n}/retiros` | monto > 0, sin sobregiro |
| 3 | `transferir` | `POST /api/transferencias` | débito y crédito atómicos |
| 4 | `abonar_interes` | `POST /api/cuentas/{n}/intereses` | interés simple, base 365 |
| 5 | `simular_credito` | `POST /api/creditos/simulacion` | cuota fija (sistema francés) |
| 6 | `cobrar_comision` | `POST /api/cuentas/{n}/comisiones` | no deja saldo negativo |

Interfaz entre lenguajes (todo por referencia): dinero `PIC S9(18) COMP-5` → `long` en **centavos** (no hay errores de redondeo de `double`), tasas `COMP-2` → `double`, estado `PIC S9(9) COMP-5` → `int`.
Estados: `0` éxito, `1` monto inválido, `2` fondos insuficientes, `3` parámetro inválido.

## Arquitectura

```
HTTP ─► WebFlux (Netty) ─► BancoService ──► CobolGateway ──JNA──► banco.dll (GnuCOBOL)
                              │  transacción R2DBC            hilo dedicado "cobol"
                              │  + bloqueo optimista          + timeout por llamada
                              ▼  + timeout de operación
                         H2 en archivo (data/banco.mv.db)
```

- La llamada JNA es bloqueante → se ejecuta en un `Scheduler` de un solo hilo (el runtime COBOL no es thread-safe), nunca en el event-loop.
- **Timeouts del servidor:** `banco.timeout.cobol` (3 s por llamada nativa) y `banco.timeout.operacion` (5 s para toda la operación). Si vence, la transacción hace **rollback** y se responde `504`.
- **Idempotencia:** si el cliente envía `X-Idempotency-Key` y reintenta tras un timeout, no se mueve dinero dos veces; se devuelve el resultado original con `"repetida": true`.
- **Concurrencia:** columna `version` (bloqueo optimista) con 3 reintentos automáticos → si persiste, `409`.

## Requisitos y ejecución

- Windows x64, JDK 17, Maven, GnuCOBOL (con su carpeta `bin` en el `PATH`).

```powershell
# 1. Compilar COBOL a DLL (solo si cambió banco.cbl)
cobc -m -o cobol\banco.dll cobol\banco.cbl

# 2. Pruebas (usan la DLL real) y empaquetado
mvn clean package

# 3. Ejecutar (desde la raíz del proyecto)
java -jar target\sistema-bancario-cobol-1.0.0.jar
```

Si GnuCOBOL está en otra ruta: `$env:GNUCOBOL_BIN="C:\ruta\GnuCOBOL\bin"`.

## Contrato del API 

Base: `http://localhost:8080`. Montos en pesos con máximo 2 decimales. JSON en todas las respuestas.

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/config` | — | timeouts del servidor y nombres de headers |
| GET | `/api/cuentas` | — | `[CuentaResponse]` |
| POST | `/api/cuentas` | `{"titular":"Ana","depositoInicial":1000}` | `201 CuentaResponse` |
| GET | `/api/cuentas/{n}` | — | `CuentaResponse` |
| GET | `/api/cuentas/{n}/movimientos` | — | `[MovimientoResponse]` (más reciente primero) |
| POST | `/api/cuentas/{n}/depositos` | `{"monto":250.50}` | `OperacionResponse` |
| POST | `/api/cuentas/{n}/retiros` | `{"monto":100}` | `OperacionResponse` |
| POST | `/api/cuentas/{n}/intereses` | `{"tasaAnual":10,"dias":30}` | `OperacionResponse` |
| POST | `/api/cuentas/{n}/comisiones` | `{"monto":15000,"concepto":"Cuota de manejo"}` | `OperacionResponse` |
| POST | `/api/transferencias` | `{"cuentaOrigen":"10..","cuentaDestino":"10..","monto":120}` | `OperacionResponse` (+ `cuentaDestino`, `saldoDestino`) |
| POST | `/api/creditos/simulacion` | `{"monto":1000000,"tasaMensual":1,"plazoMeses":12}` | `{cuotaMensual,totalPagar,totalIntereses,...}` |

`CuentaResponse`: `{numero, titular, saldo, creadaEn}`
`OperacionResponse`: `{movimientoId, tipo, cuenta, monto, saldoAnterior, saldoNuevo, mensaje, fecha, repetida}`

Headers opcionales en operaciones que mueven dinero:
- `X-Idempotency-Key: <uuid>` — generar uno por intento de operación y **reusarlo al reintentar**.
- `X-Demora-Ms: 4000` — (solo pruebas) retrasa la llamada COBOL para provocar un timeout.

### Errores

```json
{ "codigo": "FONDOS_INSUFICIENTES", "mensaje": "COBOL rechazó la operación: Fondos insuficientes",
  "estadoCobol": 2, "ruta": "/api/cuentas/10.../retiros", "timestamp": "..." }
```

| HTTP | `codigo` |
|---|---|
| 400 | `VALIDACION`, `MISMA_CUENTA` |
| 404 | `CUENTA_NO_ENCONTRADA` |
| 409 | `CONFLICTO_CONCURRENCIA`, `CLAVE_IDEMPOTENCIA_REUTILIZADA` |
| 422 | `MONTO_INVALIDO`, `FONDOS_INSUFICIENTES`, `PARAMETRO_INVALIDO` (rechazos de COBOL) |
| 504 | `TIMEOUT_COBOL`, `TIMEOUT_OPERACION` |
| 500 | `ERROR_INTERNO` |

### Recomendación de timeouts para el front

Leer `GET /api/config` y usar un timeout de cliente **un poco mayor** que `timeoutOperacionMs` (p. ej. +1 s). Así:
- si el servidor corta primero → llega un `504` con mensaje claro;
- si corta el cliente (red caída) → reintentar con la **misma** `X-Idempotency-Key`.
