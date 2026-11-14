# Arquitectura y tecnologías

## 1. Objetivo

Sistema de transacciones bancarias con persistencia en el que **toda la lógica de negocio de las operaciones está escrita en COBOL**, compilada como biblioteca dinámica (`banco.dll`) e invocada desde Java. Java se encarga de exponer el API, persistir los datos y aplicar las políticas transversales (transacciones, concurrencia, timeouts, idempotencia).

## 2. Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Lógica de negocio | **GnuCOBOL 3.x** → `banco.dll` (`cobc -m`) | Requisito: operaciones COBOL almacenadas en DLL |
| Interoperabilidad | **JNA 5.16** | Llama funciones de la DLL sin escribir código C/JNI |
| API | **Spring Boot 3.3 + WebFlux (Netty)** | Modelo reactivo no bloqueante; `timeout()` nativo en cada flujo |
| Persistencia | **Spring Data R2DBC + H2 en archivo** | Driver reactivo (no bloquea el event-loop); los datos sobreviven a reinicios |
| Validación | Jakarta Bean Validation | Forma del JSON (campos obligatorios); las reglas de negocio las valida COBOL |
| Documentación | springdoc-openapi (Swagger UI) | Contrato navegable en `/swagger-ui.html` |
| Pruebas | JUnit 5 + WebTestClient | Pruebas de extremo a extremo contra la DLL real |

## 3. Vista de componentes

```
                 ┌──────────────────────── JVM ──────────────────────────┐
 Front (Persona B)│                                                       │
  HTTP/JSON ─────►│ WebFlux Controllers ──► BancoService ──► CobolGateway │──JNA──► banco.dll ──► libcob-4.dll
                  │  (CuentaController,       │  TransactionalOperator    │         (6 programas COBOL)
                  │   OperacionController)    │  Retry (bloqueo optimista)│
                  │ DemoraSimuladaFilter      │  timeout(operación)       │ hilo "cobol" + timeout(llamada)
                  │ GlobalErrorHandler        ▼                           │
                  │                    R2DBC Repositories ──► H2 (data/banco.mv.db)
                  └───────────────────────────────────────────────────────┘
```

| Paquete | Responsabilidad |
|---|---|
| `cobol` | Interfaz JNA (`BancoCobolLib`), inicialización del runtime (`CobolConfig`), puente reactivo (`CobolGateway`), estados COBOL, filtro de demora simulada |
| `servicio` | Orquestación de cada operación: leer cuenta → calcular en COBOL → guardar saldo + movimiento |
| `dominio` | Entidades `Cuenta` y `Movimiento` y sus repositorios reactivos |
| `api` / `api.dto` | Controladores REST y contratos de entrada/salida; conversión pesos ↔ centavos |
| `error` | Catálogo de códigos de error y mapeo a HTTP |
| `config` | Propiedades `banco.*`, CORS, OpenAPI |

## 4. Interfaz Java ↔ COBOL

Cada programa COBOL es un *entry point* exportado por la DLL (un archivo fuente con varios `PROGRAM-ID ... END PROGRAM`). Todos los parámetros van **por referencia** (`PROCEDURE DIVISION USING`), por eso en Java se usan `*ByReference`:

| COBOL | Bytes | Java (JNA) | Uso |
|---|---|---|---|
| `PIC S9(18) COMP-5` | 8 | `LongByReference` | dinero en **centavos** |
| `COMP-2` | 8 | `DoubleByReference` | tasas (%) |
| `PIC S9(9) COMP-5` | 4 | `IntByReference` | días, plazo, estado |

Se usan centavos enteros (y no `double` como en el ejemplo de clase) para que no haya errores de redondeo en saldos. Solo las tasas son de punto flotante, y el resultado se redondea a centavos con `COMPUTE ... ROUNDED`.

| Programa | Entradas | Salidas |
|---|---|---|
| `depositar` | saldo, monto | nuevoSaldo, estado |
| `retirar` | saldo, monto | nuevoSaldo, estado |
| `transferir` | saldoOrigen, saldoDestino, monto | nuevoOrigen, nuevoDestino, estado |
| `abonar_interes` | saldo, tasaAnual, dias | interes, nuevoSaldo, estado |
| `simular_credito` | monto, tasaMensual, plazo | cuota, total, estado |
| `cobrar_comision` | saldo, comision | nuevoSaldo, estado |

Estados: `0` éxito · `1` monto inválido · `2` fondos insuficientes · `3` parámetro inválido. Ante un rechazo, COBOL devuelve los saldos sin cambios y Java responde HTTP 422 con `estadoCobol`.

Fórmulas:
- Interés simple: `interes = saldo × (tasaAnual/100) × (dias/365)`
- Cuota fija (sistema francés): `cuota = P·i / (1 − (1+i)^−n)`; si `i = 0`, `cuota = P/n`

## 5. Flujo de una operación (retiro)

1. `POST /api/cuentas/{n}/retiros` llega a Netty; `DemoraSimuladaFilter` lee `X-Demora-Ms` (solo pruebas).
2. `BancoService` revisa `X-Idempotency-Key`: si ya existe un movimiento con esa clave, devuelve el resultado original (`repetida: true`) sin mover dinero.
3. Abre una transacción R2DBC y lee la cuenta.
4. `CobolGateway.retirar()` publica la llamada JNA en el hilo dedicado `cobol` con un timeout propio.
5. Si COBOL devuelve estado ≠ 0, se lanza `NegocioException` y la transacción se revierte.
6. Se guarda la cuenta con el nuevo saldo (la columna `version` detecta escrituras concurrentes) y el `Movimiento`.
7. Commit → `200 OperacionResponse`.

## 6. Decisiones de diseño

**Hilo dedicado para COBOL.** La llamada JNA bloquea el hilo y el runtime de GnuCOBOL no es thread-safe. Por eso todas las llamadas pasan por `Schedulers.newSingle("cobol")`: se serializan y nunca bloquean el event-loop de Netty.

**Dos niveles de timeout.**

| Propiedad | Por defecto | Alcance | Error |
|---|---|---|---|
| `banco.timeout.cobol` | 3 s | una llamada a la DLL | `504 TIMEOUT_COBOL` |
| `banco.timeout.operacion` | 5 s | toda la operación (COBOL + BD) | `504 TIMEOUT_OPERACION` |

Cuando vence un timeout, Reactor cancela el flujo, la transacción hace **rollback** y no queda ningún saldo a medias. Limitación conocida: una llamada nativa que ya empezó no se puede interrumpir; termina en su hilo, pero su resultado se descarta.

**Idempotencia.** Un timeout en el cliente no dice si la operación se aplicó o no. Si el front reintenta con la misma `X-Idempotency-Key`, el servidor reconoce la operación (columna `UNIQUE` en `movimiento`) y no la repite.

**Bloqueo optimista.** `@Version` en `Cuenta`. Si dos operaciones modifican la misma cuenta a la vez, la segunda falla al guardar y se reintenta hasta 3 veces con backoff. Si sigue fallando, responde `409 CONFLICTO_CONCURRENCIA`. Así nunca se pierde una actualización (está probado con 20 depósitos concurrentes).

**COBOL como única fuente de reglas.** Java solo valida la forma del JSON. Montos negativos, fondos insuficientes y rangos de tasa o plazo los decide COBOL.

## 7. Modelo de datos

```
cuenta (id PK, numero UNIQUE, titular, saldo_centavos, version, creada_en)
   1 ──── * movimiento (id PK, cuenta_id FK, tipo, monto_centavos,
                        saldo_anterior_centavos, saldo_nuevo_centavos,
                        contraparte, descripcion, clave_idempotencia UNIQUE, fecha)
```

`tipo` ∈ `APERTURA, DEPOSITO, RETIRO, TRANSFERENCIA_ENVIADA, TRANSFERENCIA_RECIBIDA, INTERES, COMISION`.
Una transferencia genera dos movimientos dentro de la misma transacción.

## 8. Pruebas

`mvn test` ejecuta 12 pruebas de extremo a extremo (HTTP → WebFlux → JNA → `banco.dll` → H2 en memoria):

- `BancoApiTest`: depósito/retiro, fondos insuficientes, monto inválido, transferencia y misma cuenta, interés y comisión, simulación de crédito (valor exacto de la cuota), timeout de COBOL sin cambio de saldo, idempotencia, cuenta inexistente.
- `BancoPoliticasTest`: 20 depósitos concurrentes sin pérdida, timeout de operación con rollback, colisión de número de cuenta con reintento.
