use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

static PUBLIC_SHEETS_API_FORBIDDEN: AtomicBool = AtomicBool::new(false);
static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();
static SHEET_CACHE: Mutex<Option<SheetCacheEntry>> = Mutex::new(None);
const DEFAULT_SHEET_CACHE_TTL_SECS: u64 = 300;

#[derive(Clone)]
struct SheetCacheEntry {
    fetched_at: Instant,
    data: SheetData,
}

fn http_client() -> &'static Client {
    HTTP_CLIENT.get_or_init(|| {
        Client::builder()
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(10))
            .build()
            .expect("failed to build HTTP client")
    })
}

fn sheet_cache_ttl_secs() -> u64 {
    env::var("GOOGLE_SHEET_CACHE_TTL_SECS")
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(DEFAULT_SHEET_CACHE_TTL_SECS)
}

fn get_cached_sheet_data() -> Option<SheetData> {
    let guard = SHEET_CACHE.lock().ok()?;
    let entry = guard.as_ref()?;

    if entry.fetched_at.elapsed() <= Duration::from_secs(sheet_cache_ttl_secs()) {
        Some(entry.data.clone())
    } else {
        None
    }
}

fn set_cached_sheet_data(data: &SheetData) {
    if let Ok(mut guard) = SHEET_CACHE.lock() {
        *guard = Some(SheetCacheEntry {
            fetched_at: Instant::now(),
            data: data.clone(),
        });
    }
}

fn set_cached_sheet_row(data: &SheetData, row_idx: usize, row: &[String]) {
    if let Ok(mut guard) = SHEET_CACHE.lock() {
        let mut next = data.clone();
        if row_idx < next.values.len() {
            next.values[row_idx] = row.to_vec();
        }
        *guard = Some(SheetCacheEntry {
            fetched_at: Instant::now(),
            data: next,
        });
    }
}
fn get_anon_write_url() -> Result<String, String> {
    env::var("GOOGLE_SHEET_ANON_WRITE_URL")
        .map(|s| s.trim().to_string())
        .map_err(|_| "Missing GOOGLE_SHEET_ANON_WRITE_URL".to_string())
        .and_then(|v| {
            if v.is_empty() {
                Err("GOOGLE_SHEET_ANON_WRITE_URL is empty".to_string())
            } else {
                Ok(v)
            }
        })
}

async fn post_anon_write(payload: &Value) -> Result<(), String> {
    let url = get_anon_write_url()?;
    let res = http_client()
        .post(url)
        .json(payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status();
    let body = res.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!(
            "Anonymous sheet webhook failed with status {}: {}",
            status, body
        ));
    }

    let trimmed = body.trim().to_lowercase();
    if trimmed.starts_with("error") {
        return Err(format!("Anonymous sheet webhook returned an error: {}", body));
    }

    Ok(())
}

async fn fetch_sheet_data_via_webhook(spreadsheet_id: &str, sheet_name: &str) -> Result<Vec<Vec<String>>, String> {
    let payload = json!({
        "action": "getSheetData",
        "spreadsheetId": spreadsheet_id,
        "sheetName": sheet_name,
    });

    let url = get_anon_write_url()?;
    let res = http_client()
        .post(url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status();
    let body = res.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!(
            "Anonymous sheet read webhook failed with status {}: {}",
            status, body
        ));
    }

    if body.trim().to_lowercase().starts_with("error") {
        return Err(format!("Anonymous sheet read webhook returned an error: {}", body));
    }

    let parsed: Value = serde_json::from_str(&body)
        .map_err(|e| format!("Invalid JSON from anonymous sheet read webhook: {}", e))?;

    let rows = parsed
        .get("values")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Anonymous sheet read webhook response missing 'values' array".to_string())?;

    let mut values = Vec::new();
    for row in rows {
        let mut row_vec = Vec::new();
        if let Some(cols) = row.as_array() {
            for col in cols {
                row_vec.push(col.as_str().unwrap_or_default().to_string());
            }
        }
        values.push(row_vec);
    }

    Ok(values)
}

fn build_order_details_from_row(data: &SheetData, order_id: &str, row: &[String]) -> OrderDetails {
    let mut fields = Vec::new();
    for (idx, header) in data.headers.iter().enumerate() {
        let value = row.get(idx).cloned().unwrap_or_default();
        fields.push(SheetField {
            header: header.clone(),
            value,
            editable: get_editable_by_header(header),
        });
    }

    let status_idx = data.normalized_headers.iter().position(|h| h == "status");
    let status = if let Some(idx) = status_idx {
        row.get(idx).cloned().unwrap_or_default()
    } else {
        String::new()
    };

    OrderDetails {
        id: order_id.to_string(),
        status,
        fields,
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SheetField {
    pub header: String,
    pub value: String,
    pub editable: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct OrderDetails {
    pub id: String,
    pub status: String,
    pub fields: Vec<SheetField>,
}

#[derive(Clone)]
pub struct SheetData {
    pub spreadsheet_id: String,
    pub sheet_name: String,
    pub values: Vec<Vec<String>>,
    pub headers: Vec<String>,
    pub normalized_headers: Vec<String>,
}

pub fn col_to_a1(mut col_number: usize) -> String {
    let mut s = String::new();
    while col_number > 0 {
        let mod_val = (col_number - 1) % 26;
        s.insert(0, (65 + mod_val as u8) as char);
        col_number = (col_number - 1) / 26;
    }
    s
}

pub fn normalize_header(value: &str) -> String {
    value.to_lowercase().trim().to_string()
}

pub fn get_editable_by_header(header: &str) -> bool {
    let h = normalize_header(header);
    h == "city" || h == "district"
}

pub async fn get_sheet_data() -> Result<SheetData, String> {
    if let Some(cached) = get_cached_sheet_data() {
        return Ok(cached);
    }

    let spreadsheet_id = env::var("GOOGLE_SHEET_ID").map_err(|_| "Missing GOOGLE_SHEET_ID".to_string())?;
    let sheet_name = env::var("GOOGLE_SHEET_NAME").unwrap_or_else(|_| "Orders".to_string());
    let encoded_sheet_name = urlencoding::encode(&sheet_name);
    let api_key = env::var("GOOGLE_API_KEY").ok().map(|s| s.trim().to_string());

    let key_query = match api_key {
        Some(k) if !k.is_empty() => format!("?key={}", k),
        _ => String::new(),
    };

    let url = format!(
        "https://sheets.googleapis.com/v4/spreadsheets/{}/values/{}!A1:AZ{}",
        spreadsheet_id, encoded_sheet_name, key_query
    );

    let mut values = Vec::new();

    if PUBLIC_SHEETS_API_FORBIDDEN.load(Ordering::Relaxed) {
        values = fetch_sheet_data_via_webhook(&spreadsheet_id, &sheet_name).await?;
    } else {
        let res = http_client()
            .get(&url)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = res.status();

        if status.is_success() {
            let json: Value = res.json().await.map_err(|e| e.to_string())?;

            if let Some(rows) = json.get("values").and_then(|v| v.as_array()) {
                for row in rows {
                    let mut row_vec = Vec::new();
                    if let Some(cols) = row.as_array() {
                        for col in cols {
                            row_vec.push(col.as_str().unwrap_or("").to_string());
                        }
                    }
                    values.push(row_vec);
                }
            }
        } else {
            let err = res.text().await.unwrap_or_default();
            let is_auth_error = status.as_u16() == 401 || status.as_u16() == 403;

            if is_auth_error {
                PUBLIC_SHEETS_API_FORBIDDEN.store(true, Ordering::Relaxed);
                values = fetch_sheet_data_via_webhook(&spreadsheet_id, &sheet_name).await?;
            } else {
                return Err(format!(
                    "Failed to retrieve sheet data anonymously: {}",
                    err
                ));
            }
        }
    }

    if values.is_empty() {
        return Err("Sheet is empty.".to_string());
    }

    let headers = values[0].clone();
    let normalized_headers: Vec<String> = headers.iter().map(|h| normalize_header(h)).collect();

    let data = SheetData {
        spreadsheet_id,
        sheet_name,
        values,
        headers,
        normalized_headers,
    };

    set_cached_sheet_data(&data);
    Ok(data)
}

pub fn find_order_row_index(data: &SheetData, order_id: &str) -> Result<usize, String> {
    let id_idx = data.normalized_headers.iter()
        .position(|h| h == "id" || h == "order id" || h == "orderid")
        .ok_or_else(|| "Could not find order id column".to_string())?;

    for (idx, row) in data.values.iter().enumerate().skip(1) {
        if let Some(val) = row.get(id_idx) {
            if val.trim() == order_id.trim() {
                return Ok(idx);
            }
        }
    }
    Err(format!("Order id '{}' not found", order_id))
}

#[tauri::command]
pub async fn get_order_details(order_id: String) -> Result<OrderDetails, String> {
    let data = get_sheet_data().await?;
    let row_idx = find_order_row_index(&data, &order_id)?;
    let row = &data.values[row_idx];

    Ok(build_order_details_from_row(&data, &order_id, row))
}

#[derive(Serialize)]
pub struct ValueRange {
    pub range: String,
    pub values: Vec<Vec<String>>,
}



#[tauri::command]
pub async fn update_order_details(order_id: String, updates: std::collections::HashMap<String, String>) -> Result<OrderDetails, String> {
    let data = get_sheet_data().await?;
    let row_idx = find_order_row_index(&data, &order_id)?;
    let row_number = row_idx + 1;
    let mut row = data.values[row_idx].clone();

    let mut update_data = Vec::new();

    for (header, value) in &updates {
        let normalized = normalize_header(&header);
        if normalized == "city" || normalized == "district" {
            if let Some(header_idx) = data.headers.iter().position(|h| h == header) {
                let range = format!("{}!{}{}", data.sheet_name, col_to_a1(header_idx + 1), row_number);
                update_data.push(ValueRange {
                    range,
                    values: vec![vec![value.clone()]],
                });

                if header_idx >= row.len() {
                    row.resize(header_idx + 1, String::new());
                }
                row[header_idx] = value.clone();
            }
        }
    }

    if update_data.is_empty() {
        return Ok(build_order_details_from_row(&data, &order_id, &row));
    }

    let updates_payload: Vec<Value> = update_data
        .into_iter()
        .map(|u| {
            json!({
                "range": u.range,
                "values": u.values,
            })
        })
        .collect();

    let payload = json!({
        "action": "updateOrderFields",
        "spreadsheetId": data.spreadsheet_id,
        "sheetName": data.sheet_name,
        "orderId": order_id,
        "updates": updates_payload,
    });

    post_anon_write(&payload).await?;

    set_cached_sheet_row(&data, row_idx, &row);

    // Fire and forget WooCommerce sync so UI does not wait on remote API latency.
    let wc_order_id = order_id.clone();
    let wc_updates = updates.clone();
    tauri::async_runtime::spawn(async move {
        let _ = crate::woocommerce::sync_order_to_woocommerce2(&wc_order_id, &wc_updates).await;
    });

    Ok(build_order_details_from_row(&data, &order_id, &row))
}

#[tauri::command]
pub async fn update_order_status(order_id: String, status: String, waybill_id: Option<String>) -> Result<OrderDetails, String> {
    let data = get_sheet_data().await?;
    let row_idx = find_order_row_index(&data, &order_id)?;
    let row_number = row_idx + 1;
    let mut row = data.values[row_idx].clone();

    let status_idx = data.normalized_headers.iter()
        .position(|h| h == "status")
        .ok_or_else(|| "Could not find status column".to_string())?;

    let status_range = format!("{}!{}{}", data.sheet_name, col_to_a1(status_idx + 1), row_number);
    let mut updates_payload = vec![json!({
        "range": status_range,
        "values": [[status.clone()]],
    })];

    if status_idx >= row.len() {
        row.resize(status_idx + 1, String::new());
    }
    row[status_idx] = status.clone();

    if let Some(w_id) = waybill_id {
        if let Some(w_idx) = data
            .normalized_headers
            .iter()
            .position(|h| h == "waybilll_id" || h == "waybill_id" || h == "waybill id" || h == "waybillid")
        {
            let w_range = format!("{}!{}{}", data.sheet_name, col_to_a1(w_idx + 1), row_number);
            if w_idx >= row.len() {
                row.resize(w_idx + 1, String::new());
            }
            row[w_idx] = w_id.clone();
            updates_payload.push(json!({
                "range": w_range,
                "values": [[w_id]],
            }));
        }
    }

    let payload = json!({
        "action": "updateOrderFields",
        "spreadsheetId": data.spreadsheet_id,
        "sheetName": data.sheet_name,
        "orderId": order_id,
        "updates": updates_payload,
    });

    post_anon_write(&payload).await?;
    set_cached_sheet_row(&data, row_idx, &row);

    Ok(build_order_details_from_row(&data, &order_id, &row))
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OrderRow {
    pub id: String,
    pub order_number: String,
    pub status: String,
    pub date_created: String,
    pub customer_name: String,
    pub email: String,
    pub phone: String,
    pub whatsapp: String,
    pub address_line1: String,
    pub address_line2: String,
    pub city: String,
    pub state: String,
    pub postcode: String,
    pub district: String,
    pub items_summary: String,
    pub shipping: String,
    pub total: String,
    pub customer_note: String,
    pub payment_method: String,
}

#[tauri::command]
pub async fn fetch_orders_sheets() -> Result<Vec<OrderRow>, String> {
    let data = get_sheet_data().await?;
    
    let get_idx = |h: &str| -> Option<usize> {
        data.normalized_headers.iter().position(|x| x == h)
    };

    let id_idx = get_idx("order id").or_else(|| get_idx("id"));
    let order_no_idx = get_idx("order number");
    let status_idx = get_idx("status");
    let date_idx = get_idx("date created");
    let name_idx = get_idx("customer name");
    let email_idx = get_idx("email");
    let phone_idx = get_idx("phone");
    let wa_idx = get_idx("whatsapp");
    let add1_idx = get_idx("address line 1");
    let add2_idx = get_idx("address line 2");
    let city_idx = get_idx("city");
    let state_idx = get_idx("state");
    let postcode_idx = get_idx("postcode");
    let district_idx = get_idx("district");
    let items_idx = get_idx("items summary");
    let ship_idx = get_idx("shipping");
    let total_idx = get_idx("total");
    let note_idx = get_idx("customer note");
    let payment_idx = get_idx("payment method");

    let mut orders = Vec::new();

    for row in data.values.iter().skip(1) {
        let status = status_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default();
        
        // Only show "processing" orders (matching the original Next.js filter)
        if status.trim().to_lowercase() != "processing" && status.trim().to_lowercase() != "sent-to-koombiyo" {
            continue;
        }

        let order = OrderRow {
            id: id_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            order_number: order_no_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            status,
            date_created: date_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            customer_name: name_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            email: email_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            phone: phone_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            whatsapp: wa_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            address_line1: add1_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            address_line2: add2_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            city: city_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            state: state_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            postcode: postcode_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            district: district_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            items_summary: items_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            shipping: ship_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            total: total_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            customer_note: note_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
            payment_method: payment_idx.and_then(|i| row.get(i)).map(|s| s.clone()).unwrap_or_default(),
        };
        orders.push(order);
    }

    Ok(orders)
}
