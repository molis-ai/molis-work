use tauri::Url;

fn validated_external_url(value: &str) -> Result<Url, String> {
    if value.len() > 4096 {
        return Err("External URL is too long".into());
    }
    let url = Url::parse(value).map_err(|_| "Invalid external URL")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Only HTTP(S) URLs without credentials can be opened".into());
    }
    Ok(url)
}

/// The main-window capability permits this command only from Molis Work's local host.
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let url = validated_external_url(&url)?;
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("/usr/bin/open")
            .arg(url.as_str())
            .status()
            .map_err(|error| format!("Could not open system browser: {error}"))?;
        if !status.success() {
            return Err("The system browser could not open this URL".into());
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = url;
        Err("External browser opening is not available on this desktop target".into())
    }
}

#[cfg(test)]
mod tests {
    use super::validated_external_url;

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
        assert!(validated_external_url(&format!("https://example.com/{}", "x".repeat(4096))).is_err());
    }
}
