use crate::native_language::tr;
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
        .map_err(|error| {
            eprintln!("platform_read_selected_file join error: {error}");
            tr(
                "读取所选文件没能完成，请再试一次。",
                "Couldn’t finish reading the selected file. Please try again.",
                "選択したファイルの読み込みを完了できませんでした。もう一度お試しください。",
            )
            .to_string()
        })?
}

fn read_selected(path: &Path) -> Result<SelectedFile, String> {
    if !path.is_absolute() {
        return Err(tr(
            "所选文件路径无效。",
            "The selected file path isn’t valid.",
            "選択したファイルのパスが無効です。",
        )
        .into());
    }
    let read_err = || {
        tr(
            "读不了所选文件，请检查文件是否还在以及访问权限。",
            "Couldn’t read the selected file. Check that it still exists and is readable.",
            "選択したファイルを読み込めませんでした。ファイルの存在とアクセス権を確認してください。",
        )
        .to_string()
    };
    let too_large = || {
        tr(
            "请选择不超过 32 MB 的单个文件。",
            "Choose a file up to 32 MB.",
            "32 MB 以下のファイルを選択してください。",
        )
        .to_string()
    };
    let file = std::fs::File::open(path).map_err(|error| {
        eprintln!("selected_file open error: {error}");
        read_err()
    })?;
    let metadata = file.metadata().map_err(|error| {
        eprintln!("selected_file metadata error: {error}");
        read_err()
    })?;
    if !metadata.is_file() || metadata.len() > MAX_BYTES {
        return Err(too_large());
    }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| {
            eprintln!("selected_file read error: {error}");
            read_err()
        })?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(too_large());
    }
    Ok(SelectedFile {
        name: path
            .file_name()
            .ok_or_else(|| {
                tr(
                    "所选文件缺少文件名。",
                    "The selected file doesn’t have a valid name.",
                    "選択したファイルに有効なファイル名がありません。",
                )
            })?
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
