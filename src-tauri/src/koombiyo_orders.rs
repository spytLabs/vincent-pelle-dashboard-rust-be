use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IncomingOrder {
    pub id: Option<String>,
    pub status: Option<String>,
    pub customer_name: Option<String>,
    pub district: Option<String>,
    pub city: Option<String>,
    pub address: Option<String>,
    pub receiver_street: Option<String>,
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub phone: Option<String>,
    pub mobile: Option<String>,
    pub whatsapp: Option<String>,
    pub items_summary: Option<String>,
    pub total: Option<serde_json::Value>,
    pub payment_method: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendOrdersResult {
    pub success: bool,
    pub updated_order_ids: Vec<String>,
    pub skipped_order_ids: Vec<String>,
    pub failed_order_ids: Vec<String>,
    pub generated_waybills: Vec<serde_json::Value>,
    pub logs: Vec<String>,
}

fn is_locked_status(status: Option<&String>) -> bool {
    if let Some(s) = status {
        let s = s.trim().to_lowercase();
        s == "sent-to-koombiyo" || s == "rejected"
    } else {
        false
    }
}

fn is_processing_status(status: Option<&String>) -> bool {
    if let Some(s) = status {
        s.trim().to_lowercase() == "processing"
    } else {
        false
    }
}

fn parse_cod(total: Option<&Value>) -> f64 {
    if let Some(t) = total {
        if let Some(s) = t.as_str() {
            let n_str: String = s.chars().filter(|c| c.is_ascii_digit() || *c == '.').collect();
            n_str.parse().unwrap_or(0.0)
        } else if let Some(n) = t.as_f64() {
            n
        } else {
            0.0
        }
    } else {
        0.0
    }
}

fn is_cash_on_delivery(payment_method: Option<&String>) -> bool {
    if let Some(m) = payment_method {
        let normalized = m.trim().to_lowercase();
        normalized == "cash on delivery" || normalized == "cod" || normalized.contains("cash on delivery")
    } else {
        false
    }
}

async fn allocate_waybill() -> Result<String, String> {
    let api_key = env::var("KOOMBIYO_API_KEY").map_err(|_| "KOOMBIYO_API_KEY is missing")?;
    let base_url = env::var("KOOMBIYO_BASE_URL").unwrap_or_else(|_| "https://koombiyodelivery.lk/api".to_string());
    
    let url = format!("{}/Waybils/users", base_url);
    let body = format!("apikey={}&limit=1", urlencoding::encode(&api_key));

    let client = Client::new();
    let res = client.post(&url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Accept", "application/json")
        .header("apikey", &api_key)
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Failed to fetch waybills: {}", res.status()));
    }

    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    
    if json.get("status").and_then(|s| s.as_str()) == Some("error") {
        return Err(json.get("message").and_then(|m| m.as_str()).unwrap_or("Koombiyo API error").to_string());
    }

    let waybills_array = if json.is_array() {
        json.as_array().cloned()
    } else {
        json.get("waybills").and_then(|w| w.as_array()).cloned()
    };

    if let Some(arr) = waybills_array {
        if let Some(first) = arr.first() {
            if let Some(w_id) = first.get("waybill_id").and_then(|w| w.as_str()) {
                return Ok(w_id.to_string());
            } else if let Some(w_id) = first.get("waybill_id").and_then(|w| w.as_u64()) {
                return Ok(w_id.to_string());
            }
        }
    }

    Err("No waybills available".to_string())
}

async fn retrieve_district(district_name: &str) -> Result<String, String> {
    let districts_val = crate::koombiyo::fetch_koombiyo_districts().await?;
    if let Some(arr) = districts_val.as_array() {
        for dist in arr {
            if let Some(name) = dist.get("district_name").and_then(|n| n.as_str()) {
                if name.trim().eq_ignore_ascii_case(district_name.trim()) {
                    if let Some(id) = dist.get("district_id").and_then(|i| i.as_u64()) {
                        return Ok(id.to_string());
                    } else if let Some(id) = dist.get("district_id").and_then(|i| i.as_str()) {
                        return Ok(id.to_string());
                    }
                }
            }
        }
    }
    Err(format!("District not found: {}", district_name))
}

async fn retrieve_city(city_name: &str, district_id: &str) -> Result<String, String> {
    let cities_val = crate::koombiyo::fetch_koombiyo_cities(district_id.to_string()).await?;
    if let Some(arr) = cities_val.as_array() {
        for city in arr {
            if let Some(name) = city.get("city_name").and_then(|n| n.as_str()) {
                if name.trim().eq_ignore_ascii_case(city_name.trim()) {
                    if let Some(id) = city.get("city_id").and_then(|i| i.as_u64()) {
                        return Ok(id.to_string());
                    } else if let Some(id) = city.get("city_id").and_then(|i| i.as_str()) {
                        return Ok(id.to_string());
                    }
                }
            }
        }
    }
    Err(format!("City not found: {} in district_id {}", city_name, district_id))
}

async fn add_order(
    waybill: &str,
    order_no: &str,
    receiver_name: &str,
    street: &str,
    district_id: &str,
    city_id: &str,
    phone: &str,
    description: &str,
    cod: f64
) -> Result<(), String> {
    let api_key = env::var("KOOMBIYO_API_KEY").map_err(|_| "KOOMBIYO_API_KEY is missing")?;
    let base_url = env::var("KOOMBIYO_BASE_URL").unwrap_or_else(|_| "https://koombiyodelivery.lk/api".to_string());
    
    let url = format!("{}/Addorders/users", base_url);
    
    let body = format!(
        "apikey={}&orderWaybillid={}&orderNo={}&receiverName={}&receiverStreet={}&receiverDistrict={}&receiverCity={}&receiverPhone={}&description={}&spclNote=&getCod={}",
        urlencoding::encode(&api_key),
        urlencoding::encode(waybill),
        urlencoding::encode(order_no),
        urlencoding::encode(receiver_name),
        urlencoding::encode(street),
        urlencoding::encode(district_id),
        urlencoding::encode(city_id),
        urlencoding::encode(phone),
        urlencoding::encode(description),
        urlencoding::encode(&cod.to_string())
    );

    let client = Client::new();
    let res = client.post(&url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Accept", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Failed to add order: {}", res.status()));
    }

    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    
    if json.get("status").and_then(|s| s.as_str()) == Some("error") {
        return Err(json.get("message").and_then(|m| m.as_str()).unwrap_or("Error while adding order").to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn send_koombiyo_orders(orders: Vec<IncomingOrder>) -> Result<SendOrdersResult, String> {
    let mut logs = Vec::new();
    let mut updated_order_ids = Vec::new();
    let mut skipped_order_ids = Vec::new();
    let mut failed_order_ids = Vec::new();
    let mut generated_waybills = Vec::new();

    if orders.is_empty() {
        return Err("No orders provided.".to_string());
    }

    for i in 0..orders.len() {
        let o = &orders[i];
        let order_id = o.id.clone().unwrap_or_default().trim().to_string();

        if order_id.is_empty() {
            logs.push(format!("❌ Row {}: Missing order id.", i + 1));
            failed_order_ids.push(format!("row-{}", i + 1));
            continue;
        }

        if is_locked_status(o.status.as_ref()) {
            logs.push(format!("⏭️ #{}: Skipped ({}).", order_id, o.status.as_deref().unwrap_or("unknown")));
            skipped_order_ids.push(order_id);
            continue;
        }

        if !is_processing_status(o.status.as_ref()) {
            logs.push(format!("⏭️ #{}: Skipped ({}). Status must be processing before sending.", order_id, o.status.as_deref().unwrap_or("unknown")));
            skipped_order_ids.push(order_id);
            continue;
        }

        let waybill = match allocate_waybill().await {
            Ok(w) => w,
            Err(_) => {
                logs.push(format!("⚠️ #{}: Insufficient waybills. Request more waybills.", order_id));
                failed_order_ids.push(order_id);
                // Fail remaining as well since no waybills
                for j in (i + 1)..orders.len() {
                    let pending_id = orders[j].id.clone().unwrap_or_default().trim().to_string();
                    if !pending_id.is_empty() {
                        logs.push(format!("⚠️ #{}: Not processed due to insufficient waybills.", pending_id));
                        failed_order_ids.push(pending_id);
                    }
                }
                break;
            }
        };

        let oid = order_id.clone();
        let result: Result<(), String> = async {
            let district_name = o.district.as_deref().unwrap_or("").trim();
            let district_id = retrieve_district(district_name).await?;

            let city_name = o.city.as_deref().unwrap_or("").trim();
            let city_id = retrieve_city(city_name, &district_id).await?;

            let addr_line1 = o.address_line1.as_deref().unwrap_or("");
            let rx_street = o.receiver_street.as_deref().unwrap_or("");
            let addr = o.address.as_deref().unwrap_or("");
            let mut base_address = String::new();
            if !addr.is_empty() { base_address = addr.to_string(); }
            else if !rx_street.is_empty() { base_address = rx_street.to_string(); }
            else if !addr_line1.is_empty() { base_address = addr_line1.to_string(); }

            let extra_address = o.address_line2.as_deref().unwrap_or("").trim();
            let receiver_street = if !extra_address.is_empty() {
                format!("{}, {}", base_address.trim(), extra_address)
            } else {
                base_address.trim().to_string()
            };

            let p1 = o.phone.as_deref().unwrap_or("");
            let p2 = o.mobile.as_deref().unwrap_or("");
            let receiver_phone = if !p1.is_empty() { p1.trim() } else { p2.trim() };

            if receiver_street.is_empty() { return Err("Missing receiver street/address.".to_string()); }
            if receiver_phone.is_empty() { return Err("Missing receiver phone.".to_string()); }

            let is_cod = is_cash_on_delivery(o.payment_method.as_ref());
            let cod_amount = if is_cod { parse_cod(o.total.as_ref()) } else { 0.0 };

            add_order(
                &waybill,
                &oid,
                o.customer_name.as_deref().unwrap_or("Customer"),
                &receiver_street,
                &district_id,
                &city_id,
                receiver_phone,
                o.items_summary.as_deref().unwrap_or("Order items"),
                cod_amount
            ).await?;

            crate::google_sheets::update_order_status(oid.clone(), "sent-to-koombiyo".to_string(), Some(waybill.clone())).await?;
            
            Ok(())
        }.await;

        match result {
            Ok(_) => {
                updated_order_ids.push(order_id.clone());
                generated_waybills.push(serde_json::json!({
                    "orderId": order_id.clone(),
                    "waybill": waybill.clone()
                }));
                logs.push(format!("✅ #{}: Sent to Koombiyo. Waybill: {}", order_id, waybill));
            },
            Err(e) => {
                failed_order_ids.push(order_id.clone());
                logs.push(format!("❌ #{}: {}", order_id, e));
            }
        }
    }

    Ok(SendOrdersResult {
        success: true,
        updated_order_ids,
        skipped_order_ids,
        failed_order_ids,
        generated_waybills,
        logs,
    })
}
