use super::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};
use std::sync::OnceLock;

/// Accepts both full URLs and bare hosts: "grafana.lan:3000" becomes
/// "http://grafana.lan:3000".
pub(super) fn parse_preview_url(raw: &str) -> Option<reqwest::Url> {
    let value = raw.trim();
    if value.is_empty() {
        return None;
    }
    let candidate = if value.contains("://") {
        value.to_string()
    } else {
        format!("http://{value}")
    };
    let url = reqwest::Url::parse(&candidate).ok()?;
    (matches!(url.scheme(), "http" | "https") && url.host_str().is_some()).then_some(url)
}

fn request_reason(error: &reqwest::Error) -> String {
    let mut parts = vec![error.to_string()];
    let mut source = std::error::Error::source(error);
    while let Some(cause) = source {
        let text = cause.to_string();
        if !text.is_empty() && !parts.iter().any(|part| part.contains(&text)) {
            parts.push(text);
        }
        source = cause.source();
    }
    parts.join(" · ")
}

pub(super) async fn list_web_targets(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<WebTarget>>> {
    Ok(Json(state.store.list_web_targets().await?))
}

#[derive(Deserialize)]
pub(super) struct WebTargetRequest {
    name: String,
    url: String,
    #[serde(default)]
    icon: String,
}

pub(super) async fn create_web_target(
    State(state): State<Arc<AppState>>,
    Json(input): Json<WebTargetRequest>,
) -> AppResult<Response> {
    let url = parse_preview_url(&input.url)
        .ok_or_else(|| AppError::BadRequest("url must be http or https".into()))?;
    let target = state
        .store
        .create_web_target(WebTarget {
            id: new_id(),
            name: input.name,
            url: url.to_string(),
            icon: input.icon,
            created_at: String::new(),
        })
        .await?;
    Ok((StatusCode::CREATED, Json(target)).into_response())
}

pub(super) async fn delete_web_target(
    State(state): State<Arc<AppState>>,
    Path(target_id): Path<String>,
) -> AppResult<Json<Value>> {
    state.store.delete_web_target(&target_id).await?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub(super) struct WebPreviewQuery {
    url: String,
}

const PREVIEW_SHIMS: &str = r#"
(function () {
  if (window.__tophPreviewShims) return;
  window.__tophPreviewShims = true;
  function memoryStorage() {
    var map = new Map();
    return {
      getItem: function (key) { return map.has(String(key)) ? map.get(String(key)) : null; },
      setItem: function (key, value) { map.set(String(key), String(value)); },
      removeItem: function (key) { map.delete(String(key)); },
      clear: function () { map.clear(); },
      key: function (index) { var keys = Array.from(map.keys()); return index < keys.length ? keys[index] : null; },
      get length() { return map.size; }
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try { Object.defineProperty(window, name, { configurable: true, value: memoryStorage() }); } catch (error) {}
  });
  var cookies = new Map();
  try {
    Object.defineProperty(Document.prototype, 'cookie', {
      configurable: true,
      get: function () {
        return Array.from(cookies).map(function (pair) { return pair[0] + '=' + pair[1]; }).join('; ');
      },
      set: function (value) {
        var pair = String(value).split(';')[0];
        var index = pair.indexOf('=');
        if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
      }
    });
  } catch (error) {}
})();
"#;

const PREVIEW_NO_HMR: &str = r#"
(function () {
  // Vite's HMR client connects to the document host:port. Inside a preview the
  // document lives on the Toph host, while the dev server lives elsewhere, so
  // that websocket fails and Vite paints a blocking overlay. The preview has a
  // reload button; run the page without HMR instead.
  window.$RefreshReg$ = function () {};
  window.$RefreshSig$ = function () { return function (type) { return type; }; };
  window.__vite_plugin_react_preamble_installed__ = true;
})();
"#;

const PREVIEW_SCRIPT: &str = r#"
(function () {
  function proxied(url) {
    return new URL('/api/web-preview?url=' + encodeURIComponent(url), window.location.href).href;
  }
  document.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    var href = anchor.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^(javascript:|mailto:|tel:)/i.test(href)) return;
    var absolute;
    try { absolute = new URL(href, document.baseURI).href; } catch (error) { return; }
    if (anchor.target === '_blank') {
      event.preventDefault();
      window.open(absolute, '_blank', 'noopener,noreferrer');
      return;
    }
    event.preventDefault();
    window.location.href = proxied(absolute);
  }, true);
})();
"#;

const PREVIEW_PROXY_SHIM: &str = r#"
(function () {
  var prefix = "__PREFIX__";
  function map(value) {
    try {
      var url = new URL(String(value), document.baseURI);
      if (url.origin !== location.origin) return String(value);
      if (url.pathname.indexOf(prefix) === 0) return String(value);
      return prefix + url.pathname + url.search + url.hash;
    } catch (error) {
      return String(value);
    }
  }
  var originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function (input, init) {
      if (typeof input === "string") input = map(input);
      else if (input && input.url) input = new Request(map(input.url), input);
      return originalFetch.call(this, input, init);
    };
  }
  var open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments);
    args[1] = map(url);
    return open.apply(this, args);
  };
  var EventSourceRef = window.EventSource;
  if (EventSourceRef) {
    window.EventSource = function (url, config) { return new EventSourceRef(map(url), config); };
  }
})();
"#;

fn preview_proxy_shim(prefix: &str) -> String {
    PREVIEW_PROXY_SHIM.replace("__PREFIX__", prefix)
}

/// Rewrites root-absolute string specifiers in JavaScript. Regex literals must
/// not be touched, so only real module specifiers are prefixed.
fn preview_proxy_js(js: &str, prefix: &str, origin: &str) -> String {
    let mut out = js.to_string();
    for (from, to) in [
        ("from \"/", format!("from \"{prefix}/")),
        ("from '/", format!("from '{prefix}/")),
        ("from\"/", format!("from\"{prefix}/")),
        ("from'/", format!("from'{prefix}/")),
        ("import \"/", format!("import \"{prefix}/")),
        ("import '/", format!("import '{prefix}/")),
        ("import\"/", format!("import\"{prefix}/")),
        ("import'/", format!("import'{prefix}/")),
        ("import(\"/", format!("import(\"{prefix}/")),
        ("import('/", format!("import('{prefix}/")),
        ("import(`/", format!("import(`{prefix}/")),
    ] {
        out = out.replace(from, &to);
    }
    out.replace(origin, prefix)
}

fn preview_proxy_html(html: &str, prefix: &str, base: &str, origin: &str) -> String {
    let html = strip_preview_tags(html, |tag| tag.starts_with("<base"));
    let html = strip_preview_tags(&html, |tag| {
        tag.starts_with("<meta")
            && tag.contains("http-equiv")
            && tag.contains("content-security-policy")
    });
    let html = strip_preview_tags(&html, |tag| {
        tag.starts_with("<link") && tag.contains("rel=\"manifest\"")
    });
    let html = strip_preview_scripts(&html, |block| {
        block.contains("/@vite/client")
            || block.contains("/@react-refresh")
            || block.contains("injectIntoGlobalHook")
    });
    let html = html
        .replace("=\"/", &format!("=\"{prefix}/"))
        .replace("='/", &format!("='{prefix}/"))
        .replace("url(/", &format!("url({prefix}/"));
    let html = html.replace(origin, prefix);
    let injected = format!(
        "<base href=\"{}\"><script>{}</script><script>{}</script><script>{}</script><script>{}</script>",
        escape_preview(base),
        PREVIEW_SHIMS,
        PREVIEW_NO_HMR,
        preview_proxy_shim(prefix),
        PREVIEW_SCRIPT,
    );
    let lower = html.to_ascii_lowercase();
    if let Some(start) = lower.find("<head") {
        if let Some(end_relative) = lower[start..].find('>') {
            let pos = start + end_relative + 1;
            return format!("{}{}{}", &html[..pos], injected, &html[pos..]);
        }
    }
    format!("<head>{injected}</head>{html}")
}

fn preview_proxy_css(css: &str, prefix: &str, origin: &str) -> String {
    let css = css
        .replace("url(/", &format!("url({prefix}/"))
        .replace("url(\"/", &format!("url(\"{prefix}/"))
        .replace("url('/", &format!("url('{prefix}/"));
    css.replace(origin, prefix)
}

fn preview_cookie_header(headers: &HeaderMap) -> Option<String> {
    let mut kept = Vec::new();
    for value in headers.get_all(header::COOKIE) {
        let Ok(value) = value.to_str() else { continue };
        for part in value.split(';') {
            let part = part.trim();
            if part.is_empty() || part.starts_with("toph_") {
                continue;
            }
            kept.push(part.to_string());
        }
    }
    (!kept.is_empty()).then(|| kept.join("; "))
}

pub(super) async fn web_preview_root(
    State(state): State<Arc<AppState>>,
    Path(token): Path<String>,
    request: Request<Body>,
) -> Response {
    preview_proxy(state, token, String::new(), request).await
}

pub(super) async fn web_preview_asset(
    State(state): State<Arc<AppState>>,
    Path((token, path)): Path<(String, String)>,
    request: Request<Body>,
) -> Response {
    preview_proxy(state, token, path, request).await
}

/// Serves one request of a server-local app through Toph. Absolute paths are
/// rewritten to this prefix, so the browser never needs to resolve the target.
async fn preview_proxy(
    state: Arc<AppState>,
    token: String,
    path: String,
    request: Request<Body>,
) -> Response {
    let Some(mut target) = preview_origin_from_token(&token) else {
        return preview_error(
            "Preview inválido.",
            "/api/web-preview",
            StatusCode::BAD_REQUEST,
        );
    };
    let method = request.method().clone();
    let rewrite = matches!(method, Method::GET | Method::HEAD);
    let query = request.uri().query().map(str::to_string);
    let headers = request.headers().clone();
    let body = match axum::body::to_bytes(request.into_body(), 16 * 1024 * 1024).await {
        Ok(body) => body,
        Err(_) => {
            return preview_error(
                "O corpo da requisição é grande demais.",
                target.as_str(),
                StatusCode::PAYLOAD_TOO_LARGE,
            );
        }
    };
    let clean = path.trim_start_matches('/');
    target.set_path(&format!("/{clean}"));
    if let Some(query) = &query {
        target.set_query(Some(query));
    }
    let origin = {
        let mut origin = target.clone();
        origin.set_path("");
        origin.set_query(None);
        origin.set_fragment(None);
        origin.as_str().trim_end_matches('/').to_string()
    };
    let prefix = format!("/api/web-preview/{token}");
    let mut outgoing = state.preview_http.request(method.clone(), target.clone());
    for name in [
        header::ACCEPT,
        header::CONTENT_TYPE,
        header::USER_AGENT,
        header::IF_NONE_MATCH,
        header::IF_MODIFIED_SINCE,
    ] {
        if let Some(value) = headers.get(&name) {
            outgoing = outgoing.header(name, value);
        }
    }
    if let Some(cookies) = preview_cookie_header(&headers) {
        outgoing = outgoing.header(header::COOKIE, cookies);
    }
    outgoing = outgoing.header(header::ACCEPT_ENCODING, "identity").header(
        header::USER_AGENT,
        headers
            .get(header::USER_AGENT)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("Mozilla/5.0 (compatible; TophPreview/1.0)"),
    );
    if !body.is_empty() {
        outgoing = outgoing.body(body);
    }
    let response = match outgoing.send().await {
        Ok(response) => response,
        Err(error) => {
            tracing::warn!(%error, url = %target, "web preview proxy failed");
            return preview_error(
                &format!(
                    "Não foi possível alcançar este endereço a partir do servidor ({}).",
                    request_reason(&error)
                ),
                target.as_str(),
                StatusCode::BAD_GATEWAY,
            );
        }
    };
    let status = response.status();
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let lower_type = content_type.to_ascii_lowercase();
    let set_cookies = response
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok().map(str::to_string))
        .collect::<Vec<_>>();
    let location = response
        .headers()
        .get(header::LOCATION)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let body = match response.bytes().await {
        Ok(bytes) => bytes,
        Err(error) => {
            tracing::warn!(%error, url = %target, "web preview proxy body failed");
            return preview_error(
                "Não foi possível ler a resposta do preview.",
                target.as_str(),
                StatusCode::BAD_GATEWAY,
            );
        }
    };
    if body.len() > 32 * 1024 * 1024 {
        return preview_error(
            "A página é grande demais para o preview.",
            target.as_str(),
            StatusCode::PAYLOAD_TOO_LARGE,
        );
    }
    let rewritten = if !rewrite {
        None
    } else if lower_type.contains("text/html") {
        let entry_path = target.path();
        let directory = if entry_path.ends_with('/') {
            entry_path.to_string()
        } else {
            entry_path
                .rsplit_once('/')
                .map(|(head, _)| format!("{head}/"))
                .unwrap_or_else(|| "/".into())
        };
        let base = format!("{prefix}{directory}");
        let html = String::from_utf8_lossy(&body);
        Some(preview_proxy_html(&html, &prefix, &base, &origin).into_bytes())
    } else if lower_type.contains("javascript")
        || lower_type.contains("ecmascript")
        || lower_type.contains("typescript")
        || lower_type.contains("application/json")
    {
        let js = String::from_utf8_lossy(&body);
        Some(preview_proxy_js(&js, &prefix, &origin).into_bytes())
    } else if lower_type.contains("text/css") {
        let css = String::from_utf8_lossy(&body);
        Some(preview_proxy_css(&css, &prefix, &origin).into_bytes())
    } else {
        None
    };
    let body = rewritten
        .map(Body::from)
        .unwrap_or_else(|| Body::from(body));
    let mut builder = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "no-store");
    if let Some(location) = location {
        // A local app redirect keeps the browser inside the proxy prefix.
        let location = location.replace(&origin, &prefix);
        builder = builder.header(header::LOCATION, location);
    }
    for cookie in set_cookies {
        // The preview lives on the Toph origin; scoping the app's cookies to the
        // whole origin keeps its fetches authenticated.
        let cookie = cookie
            .split(';')
            .filter(|part| {
                !part
                    .trim_start()
                    .to_ascii_lowercase()
                    .starts_with("domain=")
            })
            .collect::<Vec<_>>()
            .join(";");
        builder = builder.header(header::SET_COOKIE, cookie);
    }
    builder
        .body(body)
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

pub(super) fn escape_preview(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

pub(super) fn strip_preview_tags(html: &str, remove: impl Fn(&str) -> bool) -> String {
    let lower = html.to_ascii_lowercase();
    let mut out = String::with_capacity(html.len());
    let mut pos = 0;
    while let Some(relative) = lower[pos..].find('<') {
        let start = pos + relative;
        let Some(end_relative) = lower[start..].find('>') else {
            break;
        };
        let end = start + end_relative + 1;
        if !remove(&lower[start..end]) {
            out.push_str(&html[pos..end]);
        } else {
            out.push_str(&html[pos..start]);
        }
        pos = end;
    }
    out.push_str(&html[pos..]);
    out
}

/// Remove a whole `<script>...</script>` block, unlike the void-tag helper.
pub(super) fn strip_preview_scripts(html: &str, remove: impl Fn(&str) -> bool) -> String {
    let lower = html.to_ascii_lowercase();
    let mut out = String::with_capacity(html.len());
    let mut pos = 0;
    while let Some(relative) = lower[pos..].find("<script") {
        let start = pos + relative;
        let Some(open_end) = lower[start..].find('>') else {
            break;
        };
        let open_end = start + open_end + 1;
        let Some(close_relative) = lower[open_end..].find("</script>") else {
            break;
        };
        let end = open_end + close_relative + "</script>".len();
        if remove(&lower[start..end]) {
            out.push_str(&html[pos..start]);
        } else {
            out.push_str(&html[pos..end]);
        }
        pos = end;
    }
    out.push_str(&html[pos..]);
    out
}

pub(super) fn rewrite_preview_html(html: &str, base_url: &str) -> String {
    let html = strip_preview_tags(html, |tag| tag.starts_with("<base"));
    let html = strip_preview_tags(&html, |tag| {
        tag.starts_with("<meta")
            && tag.contains("http-equiv")
            && tag.contains("content-security-policy")
    });
    let html = strip_preview_scripts(&html, |block| {
        block.contains("/@vite/client")
            || block.contains("/@react-refresh")
            || block.contains("injectIntoGlobalHook")
    });
    let injected = format!(
        "<base href=\"{}\"><script>{}</script><script>{}</script><script>{}</script>",
        escape_preview(base_url),
        PREVIEW_SHIMS,
        PREVIEW_NO_HMR,
        PREVIEW_SCRIPT,
    );
    let lower = html.to_ascii_lowercase();
    if let Some(start) = lower.find("<head") {
        if let Some(end_relative) = lower[start..].find('>') {
            let pos = start + end_relative + 1;
            return format!("{}{}{}", &html[..pos], injected, &html[pos..]);
        }
    }
    format!("<head>{injected}</head>{html}")
}

pub(super) fn preview_error(message: &str, target: &str, status: StatusCode) -> Response {
    let safe_target = escape_preview(target);
    let safe_message = escape_preview(message);
    let html = format!(
        r#"<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Preview indisponível</title><style>
        :root{{color-scheme:dark}}*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#e8e8e8;font-family:Inter,system-ui,sans-serif;padding:24px}}
        main{{width:min(520px,100%);border:1px solid #282828;background:#141414;border-radius:24px;padding:28px;box-shadow:0 20px 60px #0008}}
        h1{{margin:0 0 8px;font-size:20px}}p{{margin:0 0 18px;color:#aaa;line-height:1.6}}a{{display:inline-flex;border:1px solid #3c3c3c;border-radius:999px;padding:8px 14px;color:#ffb547;text-decoration:none}}code{{color:#ddd;word-break:break-all}}
        </style></head><body><main><h1>Não foi possível abrir o preview</h1><p>{safe_message}</p><p><code>{safe_target}</code></p><a href="{safe_target}" target="_blank" rel="noreferrer">Abrir em nova aba</a></main></body></html>"#,
    );
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(html))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

/// A target that only exists inside the Toph host: the browser cannot resolve
/// its `localhost`, so every request has to go through the server.
fn preview_is_server_local(url: &reqwest::Url) -> bool {
    matches!(
        url.host_str(),
        Some("localhost") | Some("127.0.0.1") | Some("::1") | Some("[::1]")
    )
}

/// Random per-process key so a preview token cannot be forged into an open
/// proxy for every service on the host's localhost.
fn preview_secret() -> &'static [u8; 32] {
    static SECRET: OnceLock<[u8; 32]> = OnceLock::new();
    SECRET.get_or_init(|| {
        let mut key = [0u8; 32];
        rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut key);
        key
    })
}

fn preview_signature(origin: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(origin.as_bytes());
    digest.update(b"|");
    digest.update(preview_secret());
    digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// Token for a local target: origin plus a signature, URL-safe.
fn preview_token(url: &reqwest::Url) -> String {
    let mut origin = url.clone();
    origin.set_path("");
    origin.set_query(None);
    origin.set_fragment(None);
    let origin = origin.as_str().trim_end_matches('/');
    format!(
        "{}.{}",
        URL_SAFE_NO_PAD.encode(origin),
        preview_signature(origin)
    )
}

fn preview_origin_from_token(token: &str) -> Option<reqwest::Url> {
    let (encoded, signature) = token.rsplit_once('.')?;
    let raw = URL_SAFE_NO_PAD.decode(encoded).ok()?;
    let origin = String::from_utf8(raw).ok()?;
    if preview_signature(&origin) != signature {
        return None;
    }
    let url = reqwest::Url::parse(&origin).ok()?;
    preview_is_server_local(&url).then_some(url)
}

fn preview_redirect(location: String) -> Response {
    Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, location)
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::empty())
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

pub(super) async fn web_preview(
    State(state): State<Arc<AppState>>,
    Query(query): Query<WebPreviewQuery>,
) -> Response {
    let raw_url = query.url.trim();
    let Some(target) = parse_preview_url(raw_url) else {
        return preview_error(
            "O endereço precisa ser uma URL http ou https válida.",
            raw_url,
            StatusCode::BAD_REQUEST,
        );
    };

    // localhost means the Toph host, not the browser's machine. Serve the whole
    // app through the prefix proxy so it also works from another device.
    if preview_is_server_local(&target) {
        let token = preview_token(&target);
        let path = target.path();
        let path = if path.is_empty() { "/" } else { path };
        let mut location = format!("/api/web-preview/{token}{path}");
        if let Some(query) = target.query() {
            location.push('?');
            location.push_str(query);
        }
        return preview_redirect(location);
    }

    let response = match state
        .preview_http
        .get(target.clone())
        .header(
            header::ACCEPT,
            "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        )
        .header(
            header::USER_AGENT,
            "Mozilla/5.0 (compatible; TophPreview/1.0; +https://github.com/ferforastieri/toph)",
        )
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            tracing::warn!(%error, url = %target, "web preview fetch failed");
            return preview_error(
                &format!(
                    "Não foi possível alcançar este endereço a partir do servidor ({}).",
                    request_reason(&error)
                ),
                target.as_str(),
                StatusCode::BAD_GATEWAY,
            );
        }
    };

    let final_url = response.url().clone();
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !content_type.contains("text/html") && !content_type.contains("application/xhtml+xml") {
        return preview_error(
            "Este endereço não retornou uma página HTML. Abra em uma nova aba para visualizar o conteúdo.",
            final_url.as_str(),
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
        );
    }
    if response
        .content_length()
        .is_some_and(|length| length > 8 * 1024 * 1024)
    {
        return preview_error(
            "A página é grande demais para o preview.",
            final_url.as_str(),
            StatusCode::PAYLOAD_TOO_LARGE,
        );
    }
    let body = match response.bytes().await {
        Ok(body) => body,
        Err(error) => {
            tracing::warn!(%error, url = %final_url, "web preview body read failed");
            return preview_error(
                "Não foi possível ler a página para o preview.",
                final_url.as_str(),
                StatusCode::BAD_GATEWAY,
            );
        }
    };
    let html = String::from_utf8_lossy(&body);
    let html = rewrite_preview_html(&html, final_url.as_str());
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(html))
        .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

#[cfg(test)]
mod preview_proxy_tests {
    use super::*;

    #[test]
    fn js_rewrite_keeps_regex_literals_and_prefixes_specifiers() {
        let js = "const re = /a\\/b/i; import \"/x\"; export { y } from '/y';";
        let out = preview_proxy_js(js, "/api/web-preview/t", "http://localhost:5173");
        assert!(out.contains("/a\\/b/i"));
        assert!(out.contains("/api/web-preview/t/x"));
        assert!(out.contains("/api/web-preview/t/y"));
    }

    #[test]
    fn signed_token_roundtrip_and_rejects_forged_tokens() {
        let url = reqwest::Url::parse("http://localhost:5173").expect("url");
        let token = preview_token(&url);
        assert!(preview_origin_from_token(&token).is_some());
        let replacement = if token.ends_with('0') { "1" } else { "0" };
        let forged = format!("{}{}", &token[..token.len() - 1], replacement);
        assert!(preview_origin_from_token(&forged).is_none());
    }
}
