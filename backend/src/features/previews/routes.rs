use super::*;

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
    let url = reqwest::Url::parse(&input.url)
        .map_err(|_| AppError::BadRequest("url must be http or https".into()))?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err(AppError::BadRequest("url must be http or https".into()));
    }
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

pub(super) fn rewrite_preview_html(html: &str, base_url: &str) -> String {
    let html = strip_preview_tags(html, |tag| tag.starts_with("<base"));
    let html = strip_preview_tags(&html, |tag| {
        tag.starts_with("<meta")
            && tag.contains("http-equiv")
            && tag.contains("content-security-policy")
    });
    let injected = format!(
        "<base href=\"{}\"><script>{}</script>",
        escape_preview(base_url),
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

pub(super) async fn web_preview(
    State(state): State<Arc<AppState>>,
    Query(query): Query<WebPreviewQuery>,
) -> Response {
    let raw_url = query.url.trim();
    let target = match reqwest::Url::parse(raw_url) {
        Ok(url) if matches!(url.scheme(), "http" | "https") => url,
        _ => {
            return preview_error(
                "O endereço precisa ser uma URL http ou https válida.",
                raw_url,
                StatusCode::BAD_REQUEST,
            )
        }
    };

    let response = match state
        .http
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
                "Não foi possível alcançar este endereço a partir do servidor.",
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
