       >>SOURCE FORMAT FREE
identification division.
program-id. TPAY-COMMISSION.
environment division.
data division.
working-storage section.
01 INPUT-LINE pic x(256).
01 OP-CODE pic x(8).
01 BASE-TEXT pic x(18).
01 RATE-TEXT pic x(5).
01 MIN-TEXT pic x(18).
01 MAX-TEXT pic x(18).
01 BASE-AMOUNT pic 9(18).
01 RATE-BPS pic 9(5).
01 MIN-AMOUNT pic 9(18).
01 MAX-AMOUNT pic 9(18).
01 PRODUCT-AMOUNT pic 9(23).
01 COMMISSION-AMOUNT pic 9(18).
01 OUTPUT-AMOUNT pic 9(18).
procedure division.
    accept INPUT-LINE
    unstring INPUT-LINE delimited by "|"
      into OP-CODE BASE-TEXT RATE-TEXT MIN-TEXT MAX-TEXT
    end-unstring

    if OP-CODE not = "CALC"
       display "ERROR:INVALID_OPERATION"
       move 1 to return-code
       stop run
    end-if

    if BASE-TEXT is not numeric or RATE-TEXT is not numeric
       or MIN-TEXT is not numeric or MAX-TEXT is not numeric
       display "ERROR:INVALID_NUMERIC_INPUT"
       move 1 to return-code
       stop run
    end-if

    move BASE-TEXT to BASE-AMOUNT
    move RATE-TEXT to RATE-BPS
    move MIN-TEXT to MIN-AMOUNT
    move MAX-TEXT to MAX-AMOUNT

    if RATE-BPS > 10000
       display "ERROR:INVALID_COMMISSION_RATE"
       move 1 to return-code
       stop run
    end-if

    if MAX-AMOUNT < MIN-AMOUNT
       display "ERROR:INVALID_COMMISSION_BOUNDS"
       move 1 to return-code
       stop run
    end-if

    compute PRODUCT-AMOUNT = BASE-AMOUNT * RATE-BPS
    compute COMMISSION-AMOUNT = PRODUCT-AMOUNT / 10000

    if COMMISSION-AMOUNT < MIN-AMOUNT
       move MIN-AMOUNT to COMMISSION-AMOUNT
    end-if
    if COMMISSION-AMOUNT > MAX-AMOUNT
       move MAX-AMOUNT to COMMISSION-AMOUNT
    end-if

    move COMMISSION-AMOUNT to OUTPUT-AMOUNT
    display OUTPUT-AMOUNT
    move 0 to return-code
    stop run.
