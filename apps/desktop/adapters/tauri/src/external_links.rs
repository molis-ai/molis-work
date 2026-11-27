use crate::native_language::tr;
use tauri::Url;

fn validated_external_url(value: &str) -> Result<Url, String> {
    if value.len() > 4096 {
        return Err(tr(
            "链接太长，无法打开。",
            "This link is too long to open.",
            "URL が長すぎるため開けません。",
        )
        .into());
    }
    let url = Url::parse(value).map_err(|_| {
        tr(
            "链接格式无效，无法打开。",
            "This link isn’t valid.",
            "無効な URL です。",
        )
    })?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(tr(
            "只能打开不含账号密码的 HTTP 或 HTTPS 网页链接。",
            "Only HTTP or HTTPS links without embedded credentials can be opened.",
            "認証情報を含まない HTTP または HTTPS のリンクのみ開けます。",
        )
        .into());
    }
    Ok(url)
}

fn launch_external_browser(url: &Url) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("/usr/bin/open")
            .arg(url.as_str())
            .status()
            .map_err(|error| {
                eprintln!("open_external_url spawn error: {error}");
                tr(
                    "没能打开系统浏览器，请稍后再试。",
                    "Couldn’t open your default browser. Please try again.",
                    "既定のブラウザーを開けませんでした。もう一度お試しください。",
                )
                .to_string()
            })?;
        if !status.success() {
            return Err(tr(
                "系统浏览器没能打开这个链接。",
                "Your default browser couldn’t open this link.",
                "既定のブラウザーでこのリンクを開けませんでした。",
            )
            .into());
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = url;
        Err(tr(
            "当前系统暂不支持打开外部浏览器。",
            "Opening an external browser isn’t supported on this platform yet.",
            "このプラットフォームでは外部ブラウザーの起動にまだ対応していません。",
        )
        .into())
    }
}

pub(crate) fn new_window_target(url: &Url) -> Option<Url> {
    validated_external_url(url.as_str()).ok()
}

/// Handles `window.open` / `target="_blank"` from the main WebView: opens safe HTTP(S) links in
/// the system browser off the UI thread while the caller returns `NewWindowResponse::Deny`.
pub(crate) fn handle_new_window_request(url: &Url) {
    let Some(safe) = new_window_target(url) else {
        return;
    };
    let _ = std::thread::Builder::new()
        .name("molis-open-external".into())
        .spawn(move || {
            if let Err(error) = launch_external_browser(&safe) {
                eprintln!("on_new_window open browser error: {error}");
            }
        });
}

/// The main-window capability permits this command only from Molis Work's local host.
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let url = validated_external_url(&url)?;
    launch_external_browser(&url)
}

#[cfg(test)]
mod tests {
    use super::{new_window_target, validated_external_url};
    use tauri::Url;

    #[test]
    fn web_links_preserve_paths_query_and_fragments() {
        let url = "https://example.com/docs?a=1&b=2#section";
        assert_eq!(validated_external_url(url).unwrap().as_str(), url);
        assert!(validated_external_url("http://127.0.0.1:4173/projects/demo/").is_ok());
    }

    #[test]
    fn rejects_executable_file_credential_and_malformed_targets() {
        for url in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,hello",
            "mailto:person@example.com",
            "https://user:secret@example.com/",
            "https://user@example.com/",
            "https://",
            "--args /bin/sh",
        ] {
            assert!(validated_external_url(url).is_err(), "accepted {url}");
        }
        assert!(
            validated_external_url(&format!("https://example.com/{}", "x".repeat(4096))).is_err()
        );
    }

    #[test]
    fn new_window_target_allows_only_safe_http_and_https_urls() {
        let oauth = Url::parse("https://accounts.example.com/oauth?state=abc&redirect=1").unwrap();
        assert_eq!(new_window_target(&oauth), Some(oauth));
        let local = Url::parse("http://127.0.0.1:4173/projects/demo").unwrap();
        assert_eq!(new_window_target(&local), Some(local));
        for blocked in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,<script>alert(1)</script>",
            "about:blank",
            "mailto:person@example.com",
            "https://user:secret@example.com/oauth",
        ] {
            let parsed = Url::parse(blocked).unwrap();
            assert_eq!(new_window_target(&parsed), None, "accepted {blocked}");
        }
    }
}
