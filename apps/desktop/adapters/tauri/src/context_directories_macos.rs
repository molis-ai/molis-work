//! AppKit owns consent; persisted, read-only security-scoped bookmarks own access.
use crate::context_directories::{validate_caller, DirectoryRecord};
use crate::context_directory_files::open_root;
use crate::native_language::{choose_folder_message, choose_folder_prompt, tr};
use base64::{engine::general_purpose::STANDARD, Engine};
use objc2::{rc::Retained, runtime::Bool};
use objc2_app_kit::{NSModalResponseOK, NSOpenPanel};
use objc2_foundation::{
    MainThreadMarker, NSData, NSString, NSURLBookmarkCreationOptions,
    NSURLBookmarkResolutionOptions, NSURL,
};
use std::fs::File;
use std::path::Path;
use tauri::{AppHandle, WebviewWindow};

pub(crate) struct DirectoryScope {
    pub directory: File,
    pub path: String,
    url: Retained<NSURL>,
}
impl Drop for DirectoryScope {
    fn drop(&mut self) {
        unsafe {
            self.url.stopAccessingSecurityScopedResource();
        }
    }
}

pub(crate) fn access(record: &DirectoryRecord) -> Result<DirectoryScope, String> {
    let bytes = STANDARD.decode(&record.bookmark).map_err(|_| {
        tr(
            "文件夹授权已失效，请重新选择。",
            "Folder access isn’t valid anymore. Please select the folder again.",
            "フォルダーのアクセス許可が無効になりました。もう一度選択してください。",
        )
    })?;
    let data = NSData::with_bytes(&bytes);
    let mut stale = Bool::NO;
    let url = unsafe {
        NSURL::URLByResolvingBookmarkData_options_relativeToURL_bookmarkDataIsStale_error(
            &data,
            NSURLBookmarkResolutionOptions::WithSecurityScope
                | NSURLBookmarkResolutionOptions::WithoutUI
                | NSURLBookmarkResolutionOptions::WithoutMounting,
            None,
            &mut stale,
        )
    }
    .map_err(|_| {
        tr(
            "文件夹授权已过期，请重新选择。",
            "Folder access expired. Please select the folder again.",
            "フォルダーのアクセス許可が期限切れです。もう一度選択してください。",
        )
    })?;
    if stale.as_bool() {
        return Err(tr(
            "文件夹位置或授权已变化，请重新选择。",
            "This folder moved or its permission changed. Please select it again.",
            "フォルダーの場所または権限が変更されました。もう一度選択してください。",
        )
        .into());
    }
    if !unsafe { url.startAccessingSecurityScopedResource() } {
        return Err(tr(
            "没能恢复文件夹访问权限，请重新选择。",
            "Couldn’t restore folder access. Please select the folder again.",
            "フォルダーのアクセス権を復元できませんでした。もう一度選択してください。",
        )
        .into());
    }
    let result = (|| {
        let path = url
            .path()
            .ok_or_else(|| {
                tr(
                    "文件夹路径无效，请重新选择。",
                    "This folder path isn’t valid. Please select it again.",
                    "フォルダーパスが無効です。もう一度選択してください。",
                )
            })?
            .to_string();
        let directory = open_root(Path::new(&path))?;
        Ok((path, directory))
    })();
    match result {
        Ok((path, directory)) => Ok(DirectoryScope {
            directory,
            path,
            url,
        }),
        Err(error) => {
            unsafe {
                url.stopAccessingSecurityScopedResource();
            }
            Err(error)
        }
    }
}

fn bookmark(url: &NSURL) -> Result<DirectoryRecord, String> {
    let data = url
        .bookmarkDataWithOptions_includingResourceValuesForKeys_relativeToURL_error(
            NSURLBookmarkCreationOptions::WithSecurityScope
                | NSURLBookmarkCreationOptions::SecurityScopeAllowOnlyReadAccess,
            None,
            None,
        )
        .map_err(|_| {
            tr(
                "没能保存文件夹授权，请重新选择。",
                "Couldn’t save folder permission. Please select it again.",
                "フォルダーの権限を保存できませんでした。もう一度選択してください。",
            )
        })?;
    let path = url
        .path()
        .ok_or_else(|| {
            tr(
                "系统没有返回所选文件夹路径。",
                "macOS didn’t return a folder path.",
                "選択したフォルダーのパスを取得できませんでした。",
            )
        })?
        .to_string();
    let record = DirectoryRecord {
        path,
        bookmark: STANDARD.encode(data.to_vec()),
    };
    // Granting a path string without a bookmark that actually resolves is never success.
    access(&record)?;
    Ok(record)
}

pub(crate) fn choose(
    app: &AppHandle,
    window: &WebviewWindow,
    id: &str,
) -> Result<Option<DirectoryRecord>, String> {
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    let id = id.to_string();
    let window = window.clone();
    app.run_on_main_thread(move || {
        let result = (|| {
            validate_caller(&window)?;
            let marker = MainThreadMarker::new().ok_or_else(|| {
                tr(
                    "系统文件夹选择器需要在主线程打开。",
                    "The folder picker must open on the main thread.",
                    "フォルダー選択ダイアログはメインスレッドで開く必要があります。",
                )
            })?;
            let panel = NSOpenPanel::openPanel(marker);
            panel.setCanChooseFiles(false);
            panel.setCanChooseDirectories(true);
            panel.setAllowsMultipleSelection(false);
            panel.setResolvesAliases(false);
            panel.setCanCreateDirectories(false);
            panel.setCanDownloadUbiquitousContents(false);
            panel.setShowsHiddenFiles(false);
            let prompt = choose_folder_prompt();
            let message = choose_folder_message(&id);
            panel.setPrompt(Some(&NSString::from_str(&prompt)));
            panel.setMessage(Some(&NSString::from_str(&message)));
            let folder = match id.as_str() {
                "downloads" => Some("Downloads"),
                "documents" => Some("Documents"),
                "desktop" => Some("Desktop"),
                _ => None,
            };
            if let (Some(folder), Some(home)) = (folder, std::env::var_os("HOME")) {
                // Building the initial URL performs no filesystem probe or enumeration.
                let initial = std::path::PathBuf::from(home).join(folder);
                let url = NSURL::fileURLWithPath_isDirectory(
                    &NSString::from_str(&initial.to_string_lossy()),
                    true,
                );
                panel.setDirectoryURL(Some(&url));
            }
            if panel.runModal() != NSModalResponseOK {
                return Ok(None);
            }
            validate_caller(&window)?;
            let url = panel.URL().ok_or_else(|| {
                tr(
                    "系统没有返回所选文件夹。",
                    "No folder was returned by the system picker.",
                    "選択したフォルダーを取得できませんでした。",
                )
            })?;
            bookmark(&url).map(Some)
        })();
        let _ = sender.send(result);
    })
    .map_err(|_| {
        tr(
            "暂时打不开系统文件夹选择器，请再试一次。",
            "Couldn’t open the folder picker right now. Please try again.",
            "フォルダー選択ダイアログを開けませんでした。もう一度お試しください。",
        )
    })?;
    receiver.recv().map_err(|_| {
        tr(
            "文件夹选择器已关闭。",
            "The folder picker was closed.",
            "フォルダー選択ダイアログが閉じられました。",
        )
        .to_string()
    })?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bookmark_restores_an_isolated_directory_after_serialization() {
        let path = std::env::temp_dir().join(format!(
            "molis-scoped-bookmark-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&path).unwrap();
        let canonical = std::fs::canonicalize(&path).unwrap();
        let url = NSURL::fileURLWithPath_isDirectory(
            &NSString::from_str(canonical.to_str().unwrap()),
            true,
        );
        let record = bookmark(&url).unwrap();
        let serialized = serde_json::to_vec(&record).unwrap();
        drop(record);
        drop(url);
        let restored: DirectoryRecord = serde_json::from_slice(&serialized).unwrap();
        let scope = access(&restored).unwrap();
        assert_eq!(scope.path, canonical.to_str().unwrap());
        drop(scope);
        std::fs::remove_dir(&path).unwrap();
        assert!(access(&restored).is_err());
    }
}
