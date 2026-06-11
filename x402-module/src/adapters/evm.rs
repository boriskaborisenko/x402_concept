use serde_json::json;

#[derive(Debug)]
pub struct VerifyResult {
    pub success: bool,
    pub reason: Option<String>,
    pub pending: bool,
    pub confirmations: Option<u64>,
}

pub async fn verify_evm_tx(
    rpc_url: &str,
    tx_hash: &str,
    expected_recipient: &str,
    expected_asset: &str,
    expected_amount: &str,
    token_address: Option<&str>,
    native_symbol: &str,
    native_decimals: u32,
    token_decimals: u32,
) -> VerifyResult {
    let client = reqwest::Client::new();

    let tx: Option<serde_json::Value> = rpc_call(&client, rpc_url, "eth_getTransactionByHash", json!([tx_hash]))
        .await
        .ok()
        .and_then(|v| v.get("result").cloned())
        .filter(|v| !v.is_null());

    let Some(tx) = tx else {
        return VerifyResult {
            success: false,
            reason: Some("Transaction not found on chain yet.".into()),
            pending: true,
            confirmations: None,
        };
    };

    let receipt: Option<serde_json::Value> =
        rpc_call(&client, rpc_url, "eth_getTransactionReceipt", json!([tx_hash]))
            .await
            .ok()
            .and_then(|v| v.get("result").cloned())
            .filter(|v| !v.is_null());

    let Some(receipt) = receipt else {
        return VerifyResult {
            success: false,
            reason: Some("Transaction is still pending.".into()),
            pending: true,
            confirmations: None,
        };
    };

    if receipt.get("status").and_then(|s| s.as_str()) != Some("0x1") {
        return VerifyResult {
            success: false,
            reason: Some("Transaction failed on-chain.".into()),
            pending: false,
            confirmations: None,
        };
    }

    let current_block = rpc_call(&client, rpc_url, "eth_blockNumber", json!([]))
        .await
        .ok()
        .and_then(|v| v.get("result").and_then(|s| s.as_str()).map(parse_hex_u64))
        .unwrap_or(0);
    let tx_block = tx
        .get("blockNumber")
        .and_then(|s| s.as_str())
        .map(parse_hex_u64)
        .unwrap_or(0);
    let confirmations = current_block.saturating_sub(tx_block);

    if confirmations < 1 {
        return VerifyResult {
            success: false,
            reason: Some("Insufficient block confirmations.".into()),
            pending: true,
            confirmations: Some(confirmations),
        };
    }

    if expected_asset == native_symbol {
        let to = tx.get("to").and_then(|s| s.as_str()).unwrap_or_default();
        if !eq_addr(to, expected_recipient) {
            return fail("Recipient mismatch.");
        }
        let value = tx
            .get("value")
            .and_then(|s| s.as_str())
            .map(parse_hex_u128)
            .unwrap_or(0);
        let expected = amount_to_units(expected_amount, native_decimals);
        if value < expected {
            return fail("Native amount mismatch.");
        }
    } else if let Some(token) = token_address {
        let to = tx.get("to").and_then(|s| s.as_str()).unwrap_or_default();
        if !eq_addr(to, token) {
            return fail("Asset contract mismatch.");
        }
        let input = tx.get("input").and_then(|s| s.as_str()).unwrap_or_default();
        if !input.starts_with("0xa9059cbb") {
            return fail("Transaction is not an ERC20 transfer.");
        }
        let recipient = format!("0x{}", &input[34..74]);
        if !eq_addr(&recipient, expected_recipient) {
            return fail("Token recipient mismatch.");
        }
        let value_hex = format!("0x{}", &input[74..138]);
        let actual = parse_hex_u128(&value_hex);
        let expected = amount_to_units(expected_amount, token_decimals);
        if actual < expected {
            return fail("Token amount mismatch.");
        }
    } else {
        return fail("Unsupported asset route.");
    }

    VerifyResult {
        success: true,
        reason: None,
        pending: false,
        confirmations: Some(confirmations),
    }
}

async fn rpc_call(
    client: &reqwest::Client,
    rpc_url: &str,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, reqwest::Error> {
    let body = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
    client
        .post(rpc_url)
        .json(&body)
        .send()
        .await?
        .json()
        .await
}

fn parse_hex_u64(hex: &str) -> u64 {
    u64::from_str_radix(hex.trim_start_matches("0x"), 16).unwrap_or(0)
}

fn parse_hex_u128(hex: &str) -> u128 {
    u128::from_str_radix(hex.trim_start_matches("0x"), 16).unwrap_or(0)
}

fn amount_to_units(amount: &str, decimals: u32) -> u128 {
    let scale = 10u128.pow(decimals);
    (amount.parse::<f64>().unwrap_or(0.0) * scale as f64) as u128
}

fn eq_addr(a: &str, b: &str) -> bool {
    a.to_lowercase() == b.to_lowercase()
}

fn fail(reason: &str) -> VerifyResult {
    VerifyResult {
        success: false,
        reason: Some(reason.into()),
        pending: false,
        confirmations: None,
    }
}
