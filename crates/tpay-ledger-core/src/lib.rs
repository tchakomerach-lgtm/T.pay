#![forbid(unsafe_code)]

//! Pure validation primitives for T.Pay's financial ledger.
//!
//! This crate deliberately performs no network calls, database writes, key
//! management, or provider integration. PostgreSQL remains the source of truth;
//! callers must validate inside the same database transaction that persists
//! the ledger and its idempotency record.

use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LedgerValidationError {
    OrganizationRequired,
    IdempotencyKeyInvalid,
    TooFewLines,
    AccountRequired,
    AmountMustBePositive,
    CurrencyInvalid,
    MixedCurrencies,
    AmountOverflow,
    UnbalancedTransaction,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Money {
    /// ISO 4217 currency code, for example XOF. Never use floating point.
    pub currency: String,
    /// Integer minor units; for XOF this is conventionally the whole CFA franc.
    pub minor_units: i128,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    Debit,
    Credit,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LedgerLine {
    pub account_id: String,
    pub amount: Money,
    pub side: Side,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LedgerTransaction {
    pub organization_id: String,
    pub idempotency_key: String,
    pub lines: Vec<LedgerLine>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedTotals {
    pub currency: String,
    pub debit_minor_units: i128,
    pub credit_minor_units: i128,
    pub line_count: usize,
}

/// Validates invariants only. It does not authorize the actor, establish
/// tenant ownership, persist idempotency, or commit a database transaction.
pub fn validate_transaction(
    transaction: &LedgerTransaction,
) -> Result<ValidatedTotals, LedgerValidationError> {
    if transaction.organization_id.trim().is_empty() {
        return Err(LedgerValidationError::OrganizationRequired);
    }

    let key = transaction.idempotency_key.as_bytes();
    if !(16..=128).contains(&key.len())
        || !key.iter().all(|byte| byte.is_ascii_graphic())
    {
        return Err(LedgerValidationError::IdempotencyKeyInvalid);
    }

    if transaction.lines.len() < 2 {
        return Err(LedgerValidationError::TooFewLines);
    }

    let mut currency: Option<&str> = None;
    let mut debits: i128 = 0;
    let mut credits: i128 = 0;
    let mut seen_line_fingerprints = HashSet::new();

    for line in &transaction.lines {
        if line.account_id.trim().is_empty() {
            return Err(LedgerValidationError::AccountRequired);
        }
        if line.amount.minor_units <= 0 {
            return Err(LedgerValidationError::AmountMustBePositive);
        }

        let code = line.amount.currency.as_str();
        if code.len() != 3 || !code.bytes().all(|byte| byte.is_ascii_uppercase()) {
            return Err(LedgerValidationError::CurrencyInvalid);
        }
        match currency {
            None => currency = Some(code),
            Some(existing) if existing != code => {
                return Err(LedgerValidationError::MixedCurrencies);
            }
            Some(_) => {}
        }

        // Repeated account lines are allowed by accounting practice, but exact
        // duplicate lines are rejected to catch common accidental double-adds.
        let fingerprint = (
            line.account_id.as_str(),
            code,
            line.amount.minor_units,
            line.side,
        );
        if !seen_line_fingerprints.insert(fingerprint) {
            return Err(LedgerValidationError::UnbalancedTransaction);
        }

        match line.side {
            Side::Debit => {
                debits = debits
                    .checked_add(line.amount.minor_units)
                    .ok_or(LedgerValidationError::AmountOverflow)?;
            }
            Side::Credit => {
                credits = credits
                    .checked_add(line.amount.minor_units)
                    .ok_or(LedgerValidationError::AmountOverflow)?;
            }
        }
    }

    if debits != credits {
        return Err(LedgerValidationError::UnbalancedTransaction);
    }

    Ok(ValidatedTotals {
        currency: currency.unwrap_or_default().to_owned(),
        debit_minor_units: debits,
        credit_minor_units: credits,
        line_count: transaction.lines.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(account: &str, amount: i128, side: Side) -> LedgerLine {
        LedgerLine {
            account_id: account.to_owned(),
            amount: Money {
                currency: "XOF".to_owned(),
                minor_units: amount,
            },
            side,
        }
    }

    fn transaction(lines: Vec<LedgerLine>) -> LedgerTransaction {
        LedgerTransaction {
            organization_id: "org-test".to_owned(),
            idempotency_key: "idem-test-key-0001".to_owned(),
            lines,
        }
    }

    #[test]
    fn accepts_balanced_integer_amounts() {
        let tx = transaction(vec![
            line("cash", 12_500, Side::Debit),
            line("customer", 12_500, Side::Credit),
        ]);
        let totals = validate_transaction(&tx).expect("balanced transaction");
        assert_eq!(totals.debit_minor_units, 12_500);
        assert_eq!(totals.credit_minor_units, 12_500);
        assert_eq!(totals.currency, "XOF");
    }

    #[test]
    fn rejects_unbalanced_transaction() {
        let tx = transaction(vec![
            line("cash", 12_500, Side::Debit),
            line("customer", 12_499, Side::Credit),
        ]);
        assert_eq!(
            validate_transaction(&tx),
            Err(LedgerValidationError::UnbalancedTransaction)
        );
    }

    #[test]
    fn rejects_non_positive_amounts() {
        let tx = transaction(vec![
            line("cash", 0, Side::Debit),
            line("customer", 0, Side::Credit),
        ]);
        assert_eq!(
            validate_transaction(&tx),
            Err(LedgerValidationError::AmountMustBePositive)
        );
    }

    #[test]
    fn rejects_mixed_currencies() {
        let mut credit = line("customer", 10, Side::Credit);
        credit.amount.currency = "USD".to_owned();
        let tx = transaction(vec![line("cash", 10, Side::Debit), credit]);
        assert_eq!(
            validate_transaction(&tx),
            Err(LedgerValidationError::MixedCurrencies)
        );
    }

    #[test]
    fn rejects_invalid_currency_code() {
        let mut debit = line("cash", 10, Side::Debit);
        debit.amount.currency = "xof".to_owned();
        let tx = transaction(vec![debit, line("customer", 10, Side::Credit)]);
        assert_eq!(
            validate_transaction(&tx),
            Err(LedgerValidationError::CurrencyInvalid)
        );
    }

    #[test]
    fn rejects_amount_overflow() {
        let tx = transaction(vec![
            line("cash-1", i128::MAX, Side::Debit),
            line("cash-2", 1, Side::Debit),
            line("customer", i128::MAX, Side::Credit),
            line("customer-2", 1, Side::Credit),
        ]);
        assert_eq!(
            validate_transaction(&tx),
            Err(LedgerValidationError::AmountOverflow)
        );
    }

    #[test]
    fn rejects_short_idempotency_key() {
        let mut tx = transaction(vec![
            line("cash", 1, Side::Debit),
            line("customer", 1, Side::Credit),
        ]);
        tx.idempotency_key = "short".to_owned();
        assert_eq!(
            validate_transaction(&tx),
            Err(LedgerValidationError::IdempotencyKeyInvalid)
        );
    }

    #[test]
    fn rejects_empty_organization_and_account() {
        let mut tx = transaction(vec![
            line("cash", 1, Side::Debit),
            line("customer", 1, Side::Credit),
        ]);
        tx.organization_id = " ".to_owned();
        assert_eq!(
            validate_transaction(&tx),
            Err(LedgerValidationError::OrganizationRequired)
        );

        let mut tx = transaction(vec![
            line(" ", 1, Side::Debit),
            line("customer", 1, Side::Credit),
        ]);
        assert_eq!(
            validate_transaction(&tx),
            Err(LedgerValidationError::AccountRequired)
        );
    }

    #[test]
    fn rejects_exact_duplicate_lines() {
        let duplicate = line("cash", 100, Side::Debit);
        let tx = transaction(vec![
            duplicate.clone(),
            duplicate,
            line("customer", 200, Side::Credit),
        ]);
        assert_eq!(
            validate_transaction(&tx),
            Err(LedgerValidationError::UnbalancedTransaction)
        );
    }
}
