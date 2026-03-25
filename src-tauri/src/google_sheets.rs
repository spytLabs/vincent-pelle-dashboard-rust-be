use jsonwebtoken::{encode, EncodingKey, Header, Algorithm};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::time::{SystemTime, UNIX_EPOCH};

const GOOGLE_OAUTH_URL: &str = "https://oauth2.googleapis.com/token";

#[derive(Serialize)]
struct Claims {
    iss: String,
    scope: String,
    aud: String,
    exp: usize,
    iat: usize,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
}

pub async fn get_access_token() -> Result<String, String> {
    let client_email = env::var("GOOGLE_SERVICE_ACCOUNT_EMAIL")
        .or_else(|_| env::var("GOOGLE_CLIENT_EMAIL"))
        .map_err(|_| "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_CLIENT_EMAIL".to_string())?;
    
    let private_key_str = env::var("GOOGLE_PRIVATE_KEY")
        .map_err(|_| "Missing GOOGLE_PRIVATE_KEY".to_string())?;
    
    let private_key = private_key_str.replace("\\n", "\n");

    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as usize;
    let claims = Claims {
        iss: client_email,
        scope: "https://www.googleapis.com/auth/spreadsheets".to_string(),
        aud: GOOGLE_OAUTH_URL.to_string(),
        exp: now + 3600,
        iat: now,
    };

    let mut header = Header::new(Algorithm::RS256);
    header.typ = Some("JWT".to_string());

    let encoding_key = EncodingKey::from_rsa_pem(private_key.as_bytes())
        .map_err(|e| format!("Invalid private key format: {}", e))?;

    let jwt = encode(&header, &claims, &encoding_key)
        .map_err(|e| format!("Failed to create JWT: {}", e))?;

    let client = Client::new();
    let res = client.post(GOOGLE_OAUTH_URL)
        .form(&[
            ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
            ("assertion", &jwt)
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Failed to get valid OAuth token: {}", err_text));
    }

    let token_res: TokenResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(token_res.access_token)
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
    let spreadsheet_id = env::var("GOOGLE_SHEET_ID").map_err(|_| "Missing GOOGLE_SHEET_ID".to_string())?;
    let sheet_name = env::var("GOOGLE_SHEET_NAME").unwrap_or_else(|_| "Orders".to_string());
    let token = get_access_token().await?;

    let url = format!("https://sheets.googleapis.com/v4/spreadsheets/{}/values/{}!A1:AZ", spreadsheet_id, sheet_name);

    let client = Client::new();
    let res = client.get(&url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Failed to retrieve sheet data: {}", res.status()));
    }

    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    let mut values = Vec::new();
    
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

    if values.is_empty() {
        return Err("Sheet is empty.".to_string());
    }

    let headers = values[0].clone();
    let normalized_headers: Vec<String> = headers.iter().map(|h| normalize_header(h)).collect();

    Ok(SheetData {
        spreadsheet_id,
        sheet_name,
        values,
        headers,
        normalized_headers,
    })
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
        "".to_string()
    };

    Ok(OrderDetails {
        id: order_id,
        status,
        fields,
    })
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
            }
        }
    }

    if update_data.is_empty() {
        return get_order_details(order_id).await;
    }

    let token = get_access_token().await?;
    let url = format!("https://sheets.googleapis.com/v4/spreadsheets/{}/values:batchUpdate", data.spreadsheet_id);

    let client = Client::new();
    
    #[derive(Serialize)]
    struct Payload {
        #[serde(rename = "valueInputOption")]
        value_input_option: String,
        data: Vec<ValueRange>,
    }

    let payload = Payload {
        value_input_option: "RAW".to_string(),
        data: update_data,
    };

    let res = client.post(&url)
        .bearer_auth(token)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err = res.text().await.unwrap_or_default();
        return Err(format!("Failed to update order details: {}", err));
    }

    // Call WooCommerce sync if WooCommerce module was available
    crate::woocommerce::sync_order_to_woocommerce2(&order_id, &updates).await.ok();

    get_order_details(order_id).await
}

#[tauri::command]
pub async fn update_order_status(order_id: String, status: String, waybill_id: Option<String>) -> Result<OrderDetails, String> {
    let data = get_sheet_data().await?;
    let row_idx = find_order_row_index(&data, &order_id)?;
    let row_number = row_idx + 1;

    let status_idx = data.normalized_headers.iter()
        .position(|h| h == "status")
        .ok_or_else(|| "Could not find status column".to_string())?;

    let mut update_data = Vec::new();
    let status_range = format!("{}!{}{}", data.sheet_name, col_to_a1(status_idx + 1), row_number);
    
    update_data.push(ValueRange {
        range: status_range,
        values: vec![vec![status.clone()]],
    });

    if let Some(w_id) = waybill_id {
        if let Some(w_idx) = data.normalized_headers.iter().position(|h| h == "waybilll_id" || h == "waybill_id" || h == "waybill id" || h == "waybillid") {
            let w_range = format!("{}!{}{}", data.sheet_name, col_to_a1(w_idx + 1), row_number);
            update_data.push(ValueRange {
                range: w_range,
                values: vec![vec![w_id]],
            });
        }
    }

    let token = get_access_token().await?;
    let url = format!("https://sheets.googleapis.com/v4/spreadsheets/{}/values:batchUpdate", data.spreadsheet_id);

    let client = Client::new();
    
    #[derive(Serialize)]
    struct Payload {
        #[serde(rename = "valueInputOption")]
        value_input_option: String,
        data: Vec<ValueRange>,
    }

    let payload = Payload {
        value_input_option: "RAW".to_string(),
        data: update_data,
    };

    let res = client.post(&url)
        .bearer_auth(token)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let err = res.text().await.unwrap_or_default();
        return Err(format!("Failed to update order status: {}", err));
    }

    get_order_details(order_id).await
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
