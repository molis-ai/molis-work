use base64::Engine;
use std::io::Read;
use std::path::Path;

const MAX_BYTES: u64 = 32 * 1024 * 1024;

#[derive(serde::Serialize)]
pub struct SelectedFile {
    name: String,
    bytes_base64: String,
}

/// Called only by the trusted desktop picker after the person selects its search result.
#[tauri::command]
pub async fn platform_read_selected_file(path: String) -> Result<SelectedFile, String> {
    tauri::async_runtime::spawn_blocking(move || read_selected(Path::new(&path)))
        .await
        .map_err(|error| format!("File selection failed: {error}"))?
}

fn read_selected(path: &Path) -> Result<SelectedFile, String> {
    if !path.is_absolute() {
        return Err("A selected file must have an absolute path".into());
    }
    let file = std::fs::File::open(path).map_err(|error| error.to_string())?;
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_BYTES {
        return Err("Choose a file no larger than 32 MiB".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Choose a file no larger than 32 MiB".into());
    }
    Ok(SelectedFile {
        name: path
            .file_name()
            .ok_or("The selection has no file name")?
            .to_string_lossy()
            .into_owned(),
        bytes_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selected_file_is_bounded_and_contains_no_source_path() {
        let directory =
            std::env::temp_dir().join(format!("molis-selected-file-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("chosen.txt");
        std::fs::write(&path, b"chosen content").unwrap();
        let selected = read_selected(&path).unwrap();
        assert_eq!(selected.name, "chosen.txt");
        assert_eq!(selected.bytes_base64, "Y2hvc2VuIGNvbnRlbnQ=");
        assert!(read_selected(Path::new("chosen.txt")).is_err());
        assert!(read_selected(&directory).is_err());
        std::fs::File::create(&path)
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();
        assert!(read_selected(&path).is_err());
        std::fs::remove_dir_all(directory).unwrap();
    }
}
