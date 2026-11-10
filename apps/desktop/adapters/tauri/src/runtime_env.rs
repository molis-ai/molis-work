use std::process::Command;

pub(crate) fn login_shell_path() -> String {
    let output = Command::new("/bin/zsh")
        .args(["-l", "-c", r#"printf '%s' "$PATH""#])
        .output();
    let fallback = std::env::var("PATH").unwrap_or_default();
    selected_path(
        output
            .ok()
            .filter(|result| result.status.success())
            .map(|result| result.stdout)
            .as_deref(),
        &fallback,
    )
}

fn selected_path(output: Option<&[u8]>, fallback: &str) -> String {
    let value = output.map(String::from_utf8_lossy);
    match value.as_deref().map(str::trim) {
        Some(path) if !path.is_empty() => path.to_string(),
        _ => fallback.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::selected_path;
    #[test]
    fn d0061_login_path_uses_successful_output_and_falls_back_on_empty_or_failure() {
        assert_eq!(
            selected_path(Some(b" /custom/bin:/usr/bin\n"), "/fallback"),
            "/custom/bin:/usr/bin"
        );
        assert_eq!(selected_path(Some(b" \n"), "/fallback"), "/fallback");
        assert_eq!(selected_path(None, "/fallback"), "/fallback");
    }
}
