use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use std::env;

const WC_API_URL: &str = "https://vinzvault.lk/wp-json/wc/v3";

#[derive(Serialize)]
struct WcBillingOrShipping {
    city: String,
}

#[derive(Serialize)]
struct WcMetaData {
    key: String,
    value: String,
}

#[derive(Serialize, Default)]
struct WcOrderUpdates {
    #[serde(skip_serializing_if = "Option::is_none")]
    billing: Option<WcBillingOrShipping>,
    #[serde(skip_serializing_if = "Option::is_none")]
    shipping: Option<WcBillingOrShipping>,
    #[serde(skip_serializing_if = "Option::is_none")]
    meta_data: Option<Vec<WcMetaData>>,
}



pub async fn sync_order_to_woocommerce2(
    order_id: &str,
    updates: &std::collections::HashMap<String, String>
) -> Result<Value, String> {
    let consumer_key = env::var("WC_CONSUMER_KEY").unwrap_or_else(|_| "ck_1371e5c9b0de10a511ac10cd893e9dfe48526317".to_string());
    let consumer_secret = env::var("WC_CONSUMER_SECRET").unwrap_or_else(|_| "cs_10332462d1ad7716d6327dd8f3064018160fca6b".to_string());

    let mut wc_updates = WcOrderUpdates::default();
    let mut modified = false;

    for (k, v) in updates {
        let normalized = k.trim().to_lowercase();
        if normalized == "city" {
            wc_updates.billing = Some(WcBillingOrShipping { city: v.clone() });
            wc_updates.shipping = Some(WcBillingOrShipping { city: v.clone() });
            modified = true;
        } else if normalized == "district" {
            wc_updates.meta_data = Some(vec![WcMetaData {
                key: "district".to_string(),
                value: v.clone(),
            }]);
            modified = true;
        }
    }

    if !modified {
        return Ok(serde_json::json!({}));
    }

    let url = format!("{}/orders/{}", WC_API_URL, order_id);

    let client = Client::new();
    let res = client.put(&url)
        .basic_auth(consumer_key, Some(consumer_secret))
        .json(&wc_updates)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err = res.text().await.unwrap_or_default();
        return Err(format!("WooCommerce sync failed: {}", err));
    }

    res.json::<Value>().await.map_err(|e| e.to_string())
}
