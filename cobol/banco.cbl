      *> ===========================================================
      *> BANCO.CBL - Operaciones bancarias expuestas como DLL.
      *> Compilar:  cobc -m -o banco.dll banco.cbl
      *>
      *> Convenciones de la interfaz (ABI) con Java/JNA:
      *>   Dinero  -> PIC S9(18) COMP-5 (centavos, long de 8 bytes)
      *>   Tasas   -> COMP-2            (double de 8 bytes)
      *>   Enteros -> PIC S9(9) COMP-5  (int de 4 bytes)
      *>   Todos los parametros se pasan POR REFERENCIA.
      *>
      *> Codigos de estado (LK-ESTADO):
      *>   0 = Operacion exitosa
      *>   1 = Monto invalido (<= 0)
      *>   2 = Fondos insuficientes
      *>   3 = Parametro invalido (tasa / plazo / dias)
      *> En caso de rechazo los saldos de salida conservan el valor
      *> de entrada.
      *> ===========================================================

      *> -----------------------------------------------------------
      *> 1. DEPOSITAR: nuevo = saldo + monto
      *> -----------------------------------------------------------
       IDENTIFICATION DIVISION.
       PROGRAM-ID. depositar.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LK-SALDO       PIC S9(18) COMP-5.
       01 LK-MONTO       PIC S9(18) COMP-5.
       01 LK-NUEVO-SALDO PIC S9(18) COMP-5.
       01 LK-ESTADO      PIC S9(9)  COMP-5.
       PROCEDURE DIVISION USING LK-SALDO LK-MONTO
                                LK-NUEVO-SALDO LK-ESTADO.
           MOVE 0 TO LK-ESTADO
           MOVE LK-SALDO TO LK-NUEVO-SALDO
           IF LK-MONTO <= 0
              MOVE 1 TO LK-ESTADO
           ELSE
              COMPUTE LK-NUEVO-SALDO = LK-SALDO + LK-MONTO
           END-IF
           GOBACK.
       END PROGRAM depositar.

      *> -----------------------------------------------------------
      *> 2. RETIRAR: nuevo = saldo - monto (sin sobregiro)
      *> -----------------------------------------------------------
       IDENTIFICATION DIVISION.
       PROGRAM-ID. retirar.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LK-SALDO       PIC S9(18) COMP-5.
       01 LK-MONTO       PIC S9(18) COMP-5.
       01 LK-NUEVO-SALDO PIC S9(18) COMP-5.
       01 LK-ESTADO      PIC S9(9)  COMP-5.
       PROCEDURE DIVISION USING LK-SALDO LK-MONTO
                                LK-NUEVO-SALDO LK-ESTADO.
           MOVE 0 TO LK-ESTADO
           MOVE LK-SALDO TO LK-NUEVO-SALDO
           EVALUATE TRUE
              WHEN LK-MONTO <= 0
                 MOVE 1 TO LK-ESTADO
              WHEN LK-MONTO > LK-SALDO
                 MOVE 2 TO LK-ESTADO
              WHEN OTHER
                 COMPUTE LK-NUEVO-SALDO = LK-SALDO - LK-MONTO
           END-EVALUATE
           GOBACK.
       END PROGRAM retirar.

      *> -----------------------------------------------------------
      *> 3. TRANSFERIR: debita origen y acredita destino (atomico)
      *> -----------------------------------------------------------
       IDENTIFICATION DIVISION.
       PROGRAM-ID. transferir.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LK-SALDO-ORIGEN   PIC S9(18) COMP-5.
       01 LK-SALDO-DESTINO  PIC S9(18) COMP-5.
       01 LK-MONTO          PIC S9(18) COMP-5.
       01 LK-NUEVO-ORIGEN   PIC S9(18) COMP-5.
       01 LK-NUEVO-DESTINO  PIC S9(18) COMP-5.
       01 LK-ESTADO         PIC S9(9)  COMP-5.
       PROCEDURE DIVISION USING LK-SALDO-ORIGEN LK-SALDO-DESTINO
                                LK-MONTO LK-NUEVO-ORIGEN
                                LK-NUEVO-DESTINO LK-ESTADO.
           MOVE 0 TO LK-ESTADO
           MOVE LK-SALDO-ORIGEN  TO LK-NUEVO-ORIGEN
           MOVE LK-SALDO-DESTINO TO LK-NUEVO-DESTINO
           EVALUATE TRUE
              WHEN LK-MONTO <= 0
                 MOVE 1 TO LK-ESTADO
              WHEN LK-MONTO > LK-SALDO-ORIGEN
                 MOVE 2 TO LK-ESTADO
              WHEN OTHER
                 COMPUTE LK-NUEVO-ORIGEN  =
                         LK-SALDO-ORIGEN - LK-MONTO
                 COMPUTE LK-NUEVO-DESTINO =
                         LK-SALDO-DESTINO + LK-MONTO
           END-EVALUATE
           GOBACK.
       END PROGRAM transferir.

      *> -----------------------------------------------------------
      *> 4. ABONAR_INTERES: interes simple por dias (base 365)
      *>    interes = saldo * (tasaAnual / 100) * (dias / 365)
      *> -----------------------------------------------------------
       IDENTIFICATION DIVISION.
       PROGRAM-ID. abonar_interes.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LK-SALDO       PIC S9(18) COMP-5.
       01 LK-TASA-ANUAL  USAGE COMP-2.
       01 LK-DIAS        PIC S9(9)  COMP-5.
       01 LK-INTERES     PIC S9(18) COMP-5.
       01 LK-NUEVO-SALDO PIC S9(18) COMP-5.
       01 LK-ESTADO      PIC S9(9)  COMP-5.
       PROCEDURE DIVISION USING LK-SALDO LK-TASA-ANUAL LK-DIAS
                                LK-INTERES LK-NUEVO-SALDO LK-ESTADO.
           MOVE 0 TO LK-ESTADO
           MOVE 0 TO LK-INTERES
           MOVE LK-SALDO TO LK-NUEVO-SALDO
           EVALUATE TRUE
              WHEN LK-TASA-ANUAL <= 0 OR LK-TASA-ANUAL > 100
                 MOVE 3 TO LK-ESTADO
              WHEN LK-DIAS <= 0 OR LK-DIAS > 3650
                 MOVE 3 TO LK-ESTADO
              WHEN LK-SALDO <= 0
                 MOVE 1 TO LK-ESTADO
              WHEN OTHER
                 COMPUTE LK-INTERES ROUNDED =
                    LK-SALDO * (LK-TASA-ANUAL / 100) * (LK-DIAS / 365)
                 COMPUTE LK-NUEVO-SALDO = LK-SALDO + LK-INTERES
           END-EVALUATE
           GOBACK.
       END PROGRAM abonar_interes.

      *> -----------------------------------------------------------
      *> 5. SIMULAR_CREDITO: cuota fija (sistema frances)
      *>    cuota = P * i / (1 - (1 + i) ** -n)   ; si i = 0 -> P / n
      *> -----------------------------------------------------------
       IDENTIFICATION DIVISION.
       PROGRAM-ID. simular_credito.
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-I            USAGE COMP-2.
       01 WS-FACTOR       USAGE COMP-2.
       LINKAGE SECTION.
       01 LK-MONTO        PIC S9(18) COMP-5.
       01 LK-TASA-MENSUAL USAGE COMP-2.
       01 LK-PLAZO        PIC S9(9)  COMP-5.
       01 LK-CUOTA        PIC S9(18) COMP-5.
       01 LK-TOTAL        PIC S9(18) COMP-5.
       01 LK-ESTADO       PIC S9(9)  COMP-5.
       PROCEDURE DIVISION USING LK-MONTO LK-TASA-MENSUAL LK-PLAZO
                                LK-CUOTA LK-TOTAL LK-ESTADO.
           MOVE 0 TO LK-ESTADO
           MOVE 0 TO LK-CUOTA
           MOVE 0 TO LK-TOTAL
           EVALUATE TRUE
              WHEN LK-MONTO <= 0
                 MOVE 1 TO LK-ESTADO
              WHEN LK-TASA-MENSUAL < 0 OR LK-TASA-MENSUAL > 20
                 MOVE 3 TO LK-ESTADO
              WHEN LK-PLAZO <= 0 OR LK-PLAZO > 360
                 MOVE 3 TO LK-ESTADO
              WHEN LK-TASA-MENSUAL = 0
                 COMPUTE LK-CUOTA ROUNDED = LK-MONTO / LK-PLAZO
                 COMPUTE LK-TOTAL = LK-CUOTA * LK-PLAZO
              WHEN OTHER
                 COMPUTE WS-I = LK-TASA-MENSUAL / 100
                 COMPUTE WS-FACTOR = (1 + WS-I) ** (0 - LK-PLAZO)
                 COMPUTE LK-CUOTA ROUNDED =
                         LK-MONTO * WS-I / (1 - WS-FACTOR)
                 COMPUTE LK-TOTAL = LK-CUOTA * LK-PLAZO
           END-EVALUATE
           GOBACK.
       END PROGRAM simular_credito.

      *> -----------------------------------------------------------
      *> 6. COBRAR_COMISION: descuenta una comision fija del saldo
      *> -----------------------------------------------------------
       IDENTIFICATION DIVISION.
       PROGRAM-ID. cobrar_comision.
       DATA DIVISION.
       LINKAGE SECTION.
       01 LK-SALDO       PIC S9(18) COMP-5.
       01 LK-COMISION    PIC S9(18) COMP-5.
       01 LK-NUEVO-SALDO PIC S9(18) COMP-5.
       01 LK-ESTADO      PIC S9(9)  COMP-5.
       PROCEDURE DIVISION USING LK-SALDO LK-COMISION
                                LK-NUEVO-SALDO LK-ESTADO.
           MOVE 0 TO LK-ESTADO
           MOVE LK-SALDO TO LK-NUEVO-SALDO
           EVALUATE TRUE
              WHEN LK-COMISION <= 0
                 MOVE 1 TO LK-ESTADO
              WHEN LK-COMISION > LK-SALDO
                 MOVE 2 TO LK-ESTADO
              WHEN OTHER
                 COMPUTE LK-NUEVO-SALDO = LK-SALDO - LK-COMISION
           END-EVALUATE
           GOBACK.
       END PROGRAM cobrar_comision.
