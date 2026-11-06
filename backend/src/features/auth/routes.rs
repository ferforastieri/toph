use super::*;

#[derive(Deserialize)]
pub(super) struct LoginRequest {
    #[serde(default)]
    username: String,
    password: String,
    #[serde(default)]
    kind: String,
}

pub(super) async fn login(
    State(state): State<Arc<AppState>>,
    ConnectInfo(connect): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(mut input): Json<LoginRequest>,
) -> Response {
    let key = client_key(&headers, Some(connect), &state.config.trusted_proxies);
    if !state.login_limiter.allow(&key) {
        let mut response = AppError::RateLimited.into_response();
        response
            .headers_mut()
            .insert(header::RETRY_AFTER, HeaderValue::from_static("60"));
        return response;
    }
    if input.username.is_empty() {
        input.username = "admin".into();
    }
    if input.kind.is_empty() {
        input.kind = "web".into();
    }
    if input.kind != "web" && input.kind != "mobile" {
        return AppError::BadRequest("invalid client kind".into()).into_response();
    }
    let result = match state
        .auth
        .login(&input.username, &input.password, &input.kind)
        .await
    {
        Ok(value) => value,
        Err(AppError::Unauthorized | AppError::InvalidCredentials) => {
            return AppError::InvalidCredentials.into_response()
        }
        Err(error) => return error.into_response(),
    };
    state.login_limiter.reset(&key);
    let mut response = Json(json!({
        "token": if input.kind == "mobile" { result.token.clone() } else { String::new() },
        "csrfToken": result.csrf_token,
        "expiresAt": result.session.expires_at,
        "user": result.user,
    }))
    .into_response();
    if input.kind == "web" {
        append_auth_cookies(
            response.headers_mut(),
            &result.token,
            &result.csrf_token,
            state.auth.secure_cookies(),
        );
    }
    response
}

pub(super) fn append_auth_cookies(headers: &mut HeaderMap, token: &str, csrf: &str, secure: bool) {
    let secure_flag = if secure { "; Secure" } else { "" };
    let session = format!(
        "{SESSION_COOKIE}={token}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict{secure_flag}"
    );
    let csrf_cookie =
        format!("{CSRF_COOKIE}={csrf}; Path=/; Max-Age=2592000; SameSite=Strict{secure_flag}");
    if let Ok(value) = HeaderValue::from_str(&session) {
        headers.append(header::SET_COOKIE, value);
    }
    if let Ok(value) = HeaderValue::from_str(&csrf_cookie) {
        headers.append(header::SET_COOKIE, value);
    }
}

pub(super) fn clear_auth_cookies(headers: &mut HeaderMap, secure: bool) {
    let secure_flag = if secure { "; Secure" } else { "" };
    for name in [SESSION_COOKIE, CSRF_COOKIE] {
        let value = format!(
            "{name}=; Path=/; Max-Age=0; HttpOnly={}; SameSite=Strict{secure_flag}",
            name == SESSION_COOKIE
        );
        if let Ok(value) = HeaderValue::from_str(&value) {
            headers.append(header::SET_COOKIE, value);
        }
    }
}

pub(super) async fn me(Extension(context): Extension<AuthContext>) -> Json<Value> {
    Json(json!({ "user": context.user, "session": context.session }))
}

pub(super) async fn get_pet(
    State(state): State<Arc<AppState>>,
    Extension(context): Extension<AuthContext>,
) -> AppResult<Json<PetConfig>> {
    Ok(Json(
        state
            .store
            .pet_config(context.user.id)
            .await?
            .unwrap_or_default(),
    ))
}

pub(super) async fn save_pet(
    State(state): State<Arc<AppState>>,
    Extension(context): Extension<AuthContext>,
    Json(mut input): Json<PetConfig>,
) -> AppResult<Json<PetConfig>> {
    let kind = input.kind.clone();
    input.kind = match kind.as_str() {
        "toph-core" | "toph-orbit" | "toph-prism" | "toph-bloom" | "toph-forge" | "toph-nimbus"
        | "toph-tide" | "toph-spark" | "toph-echo" | "toph-pebble" | "toph-nova" | "toph-luna"
        | "toph-peak" | "toph-kite" | "toph-grove" | "toph-pulse" | "toph-cube" | "toph-comet"
        | "toph-portal" | "toph-mochi" => kind,
        "pip" => "toph-bloom".into(),
        "byte" => "toph-forge".into(),
        "nori" => "toph-echo".into(),
        _ => "toph-core".into(),
    };
    if input.mode != "free" {
        input.mode = "corner".into();
    }
    input.commits = input.commits.max(0);
    state.store.save_pet_config(context.user.id, &input).await?;
    Ok(Json(input))
}

pub(super) async fn logout(
    State(state): State<Arc<AppState>>,
    Extension(context): Extension<AuthContext>,
) -> Response {
    let _ = state.auth.logout(&context.session.id).await;
    let mut response = Json(json!({ "ok": true })).into_response();
    if context.from_cookie {
        clear_auth_cookies(response.headers_mut(), state.auth.secure_cookies());
    }
    response
}
