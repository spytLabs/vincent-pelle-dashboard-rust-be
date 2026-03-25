use reqwest::{Client, header};
use serde_json::Value;
use std::env;

const KOOMBIYO_LOGIN_URL: &str = "https://koombiyodelivery.lk/custSignin";
const KOOMBIYO_ACCOUNT_URL: &str = "https://koombiyodelivery.lk/myaccount";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

#[tauri::command]
pub async fn login_koombiyo(username: String, password: String) -> Result<String, String> {
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

    let body = format!("logUsername={}&logPass={}", urlencoding::encode(&username), urlencoding::encode(&password));

    let res = client.post(KOOMBIYO_LOGIN_URL)
        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded; charset=UTF-8")
        .header(header::USER_AGENT, USER_AGENT)
        .header(header::ACCEPT, "*/*")
        .header("x-requested-with", "XMLHttpRequest")
        .header("origin", "https://koombiyodelivery.lk")
        .header("referer", "https://koombiyodelivery.lk/")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let set_cookie = res.headers().get(header::SET_COOKIE);
    let mut session_cookie = None;

    if let Some(cookie_val) = set_cookie {
        let cookie_str = cookie_val.to_str().unwrap_or("");
        for part in cookie_str.split(';') {
            let part = part.trim();
            if part.starts_with("cisessionlk=") {
                session_cookie = Some(part.strip_prefix("cisessionlk=").unwrap_or("").to_string());
                break;
            }
        }
    }

    let login_body = res.text().await.unwrap_or_default();

    if session_cookie.is_none() || login_body.trim() == "0" || login_body.to_lowercase().contains("error") || login_body.to_lowercase().contains("failed") {
        return Err("Invalid username or password".to_string());
    }

    let cookie = session_cookie.unwrap();

    let validate_res = client.get(KOOMBIYO_ACCOUNT_URL)
        .header(header::COOKIE, format!("cisessionlk={}", cookie))
        .header(header::USER_AGENT, USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if validate_res.status().is_redirection() {
        return Err("Login failed - invalid credentials".to_string());
    }

    Ok(cookie)
}

#[tauri::command]
pub async fn validate_koombiyo(cookie: String) -> Result<bool, String> {
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

    let validate_res = client.get(KOOMBIYO_ACCOUNT_URL)
        .header(header::COOKIE, format!("cisessionlk={}", cookie))
        .header(header::USER_AGENT, USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if validate_res.status().is_redirection() {
        Ok(false)
    } else {
        Ok(true)
    }
}

#[tauri::command]
pub async fn fetch_koombiyo_districts() -> Result<Value, String> {
    let api_key = env::var("KOOMBIYO_API_KEY").map_err(|_| "KOOMBIYO_API_KEY is missing".to_string())?;
    let base_url = env::var("KOOMBIYO_BASE_URL").unwrap_or_else(|_| "https://koombiyodelivery.lk/api".to_string());
    
    let url = format!("{}/Districts/users", base_url);
    let body = format!("apikey={}", urlencoding::encode(&api_key));

    let client = Client::new();
    let res = client.post(&url)
        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
        .header(header::ACCEPT, "application/json")
        .header(header::USER_AGENT, USER_AGENT)
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Failed to fetch districts: {}", res.status()));
    }

    res.json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_koombiyo_cities(district_id: String) -> Result<Value, String> {
    let api_key = env::var("KOOMBIYO_API_KEY").map_err(|_| "KOOMBIYO_API_KEY is missing".to_string())?;
    let base_url = env::var("KOOMBIYO_BASE_URL").unwrap_or_else(|_| "https://koombiyodelivery.lk/api".to_string());
    
    let url = format!("{}/Cities/users", base_url);
    let body = format!("apikey={}&district_id={}", urlencoding::encode(&api_key), urlencoding::encode(&district_id));

    let client = Client::new();
    let res = client.post(&url)
        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
        .header(header::ACCEPT, "application/json")
        .header(header::USER_AGENT, USER_AGENT)
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("Failed to fetch cities: {}", res.status()));
    }

    res.json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_pod(waybillid: String, cookie: String) -> Result<Vec<u8>, String> {
    let url = format!("https://koombiyodelivery.lk/myaccount/pod_single?waybill={}", urlencoding::encode(&waybillid));

    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(&url)
        .header(header::COOKIE, format!("cisessionlk={}", cookie))
        .header(header::USER_AGENT, USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_redirection() {
        return Err("Unauthorized - Session expired".to_string());
    }

    if !res.status().is_success() {
        return Err(format!("Failed to fetch POD from Koombiyo (Status: {})", res.status()));
    }

    if let Some(content_type) = res.headers().get(header::CONTENT_TYPE) {
        if content_type.to_str().unwrap_or("").contains("text/html") {
            return Err("Failed to fetch POD - received HTML. Waybill might be invalid.".to_string());
        }
    }

    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

#[tauri::command]
pub async fn check_koombiyo_waybills() -> Result<usize, String> {
    let api_key = env::var("KOOMBIYO_API_KEY").map_err(|_| "KOOMBIYO_API_KEY is missing")?;
    let base_url = env::var("KOOMBIYO_BASE_URL").unwrap_or_else(|_| "https://koombiyodelivery.lk/api".to_string());
    
    let url = format!("{}/Waybils/users", base_url);
    let body = format!("apikey={}&limit=1000", urlencoding::encode(&api_key));

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

    let len = if json.is_array() {
        json.as_array().map(|a| a.len()).unwrap_or(0)
    } else {
        json.get("waybills").and_then(|w| w.as_array()).map(|a| a.len()).unwrap_or(0)
    };

    Ok(len)
}
