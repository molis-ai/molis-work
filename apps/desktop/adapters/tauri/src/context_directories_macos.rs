//! AppKit owns consent; persisted, read-only security-scoped bookmarks own access.
use crate::context_directories::{directory_name, validate_caller, DirectoryRecord};
use crate::context_directory_files::open_root;
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
    let bytes = STANDARD
        .decode(&record.bookmark)
        .map_err(|_| "目录授权无效，请重新选择")?;
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
    .map_err(|_| "目录授权已失效，请重新选择")?;
    if stale.as_bool() {
        return Err("目录位置或授权已改变，请重新选择".into());
    }
    if !unsafe { url.startAccessingSecurityScopedResource() } {
        return Err("无法恢复目录授权，请重新选择".into());
    }
    let result = (|| {
        let path = url.path().ok_or("目录地址无效，请重新选择")?.to_string();
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
        .map_err(|_| "无法保存目录授权，请重新选择")?;
    let path = url.path().ok_or("系统没有返回目录地址")?.to_string();
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
            let marker = MainThreadMarker::new().ok_or("系统选择器需要主线程")?;
            let panel = NSOpenPanel::openPanel(marker);
            panel.setCanChooseFiles(false);
            panel.setCanChooseDirectories(true);
            panel.setAllowsMultipleSelection(false);
            panel.setResolvesAliases(false);
            panel.setCanCreateDirectories(false);
            panel.setCanDownloadUbiquitousContents(false);
            panel.setShowsHiddenFiles(false);
            panel.setPrompt(Some(&NSString::from_str("允许访问此文件夹")));
            panel.setMessage(Some(&NSString::from_str(&format!(
                "为“{}”选择文件夹。下一步仅预览文件列表；开始整理后才读取所选正文。",
                directory_name(&id)
            ))));
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
            let url = panel.URL().ok_or("系统没有返回所选目录")?;
            bookmark(&url).map(Some)
        })();
        let _ = sender.send(result);
    })
    .map_err(|_| "无法打开系统目录选择器")?;
    receiver
        .recv()
        .map_err(|_| "系统目录选择器已关闭".to_string())?
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
