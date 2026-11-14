CREATE TABLE IF NOT EXISTS cuenta (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    numero          VARCHAR(20)  NOT NULL UNIQUE,
    titular         VARCHAR(100) NOT NULL,
    saldo_centavos  BIGINT       NOT NULL,
    version         BIGINT       NOT NULL DEFAULT 0,
    creada_en       TIMESTAMP    NOT NULL
);

CREATE TABLE IF NOT EXISTS movimiento (
    id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
    cuenta_id                BIGINT       NOT NULL REFERENCES cuenta(id),
    tipo                     VARCHAR(30)  NOT NULL,
    monto_centavos           BIGINT       NOT NULL,
    saldo_anterior_centavos  BIGINT       NOT NULL,
    saldo_nuevo_centavos     BIGINT       NOT NULL,
    contraparte              VARCHAR(20),
    descripcion              VARCHAR(200),
    clave_idempotencia       VARCHAR(64)  UNIQUE,
    fecha                    TIMESTAMP    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movimiento_cuenta ON movimiento(cuenta_id, fecha);
