//! A front-file copy borrows the clipboard; restore only the version it actually read.

use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2_app_kit::{NSPasteboard, NSPasteboardItem, NSPasteboardWriting};
use objc2_foundation::{ns_string, NSArray, NSData, NSString, NSURL};
use std::path::PathBuf;

#[derive(Debug, PartialEq, Eq)]
pub struct Snapshot {
    pub change_count: isize,
    items: Vec<Vec<(String, Vec<u8>)>>,
}

impl Snapshot {
    pub fn take(board: &NSPasteboard) -> Result<Self, String> {
        let change_count = board.changeCount();
        let mut items = Vec::new();
        if let Some(originals) = board.pasteboardItems() {
            for original in originals.iter() {
                let mut item = Vec::new();
                for kind in original.types().iter() {
                    let data = original
                        .dataForType(&kind)
                        .ok_or("读不了原剪贴板，未复制文件")?;
                    item.push((kind.to_string(), data.to_vec()));
                }
                items.push(item);
            }
        }
        if board.changeCount() != change_count {
            return Err("剪贴板正在变化，请重试收取文件".into());
        }
        Ok(Self {
            change_count,
            items,
        })
    }

    /// A later copy belongs to the person; never replace it with our earlier snapshot.
    pub fn restore(&self, board: &NSPasteboard, copied_count: isize) -> Result<bool, String> {
        if copied_count == self.change_count || board.changeCount() != copied_count {
            return Ok(false);
        }
        let mut items = Vec::<Retained<NSPasteboardItem>>::new();
        for original in &self.items {
            let item = NSPasteboardItem::new();
            for (kind, bytes) in original {
                if !item.setData_forType(&NSData::with_bytes(bytes), &NSString::from_str(kind)) {
                    return Err("没能保全原剪贴板，请重试".into());
                }
            }
            items.push(item);
        }
        let objects: Vec<&ProtocolObject<dyn NSPasteboardWriting>> = items
            .iter()
            .map(|item| ProtocolObject::from_ref(&**item))
            .collect();
        let objects = NSArray::from_slice(&objects);
        // Prepare everything before checking the version and changing the board.
        if board.changeCount() != copied_count {
            return Ok(false);
        }
        let cleared_count = board.clearContents();
        if items.is_empty() {
            return Ok(true);
        }
        if board.changeCount() != cleared_count {
            return Ok(false);
        }
        if !board.writeObjects(&objects) {
            return Err("没能恢复原剪贴板".into());
        }
        Ok(true)
    }
}

/// No change means Cmd+C did not produce content; old file URLs must not be admitted.
pub fn copied_files(
    board: &NSPasteboard,
    before: isize,
) -> Option<(isize, Vec<PathBuf>, Option<String>)> {
    let count = board.changeCount();
    if count == before {
        return None;
    }
    let mut files = Vec::new();
    if let Some(list) = board.propertyListForType(ns_string!("NSFilenamesPboardType")) {
        if let Ok(array) = list.downcast::<NSArray>() {
            for item in array.iter() {
                if let Some(path) = item.downcast_ref::<NSString>() {
                    files.push(PathBuf::from(path.to_string()));
                }
            }
        }
    }
    if files.is_empty() {
        if let Some(items) = board.pasteboardItems() {
            for item in items.iter() {
                if let Some(raw) = item.stringForType(ns_string!("public.file-url")) {
                    if let Some(path) = file_url_path(&raw.to_string()) {
                        files.push(path);
                    }
                }
            }
        }
    }
    let text = if files.is_empty() {
        board
            .stringForType(ns_string!("public.utf8-plain-text"))
            .map(|value| value.to_string())
    } else {
        None
    };
    (board.changeCount() == count).then_some((count, files, text))
}

pub fn file_url_path(raw: &str) -> Option<PathBuf> {
    let url = NSURL::URLWithString(&NSString::from_str(raw))?;
    if !url.isFileURL()
        || url
            .host()
            .is_some_and(|host| !host.is_empty() && host.to_string() != "localhost")
    {
        return None;
    }
    Some(PathBuf::from(url.path()?.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(board: &NSPasteboard, items: &[Vec<(&str, &[u8])>]) {
        let values: Vec<_> = items
            .iter()
            .map(|types| {
                let item = NSPasteboardItem::new();
                for (kind, bytes) in types {
                    assert!(
                        item.setData_forType(&NSData::with_bytes(bytes), &NSString::from_str(kind))
                    );
                }
                item
            })
            .collect();
        let objects: Vec<&ProtocolObject<dyn NSPasteboardWriting>> = values
            .iter()
            .map(|item| ProtocolObject::from_ref(&**item))
            .collect();
        board.clearContents();
        assert!(board.writeObjects(&NSArray::from_slice(&objects)));
    }

    // W2-18-CLIPBOARD-01/02: only a unique private board; never the person's general pasteboard.
    #[test]
    fn typed_items_survive_copy_and_no_copy_never_reads_old_files() {
        let board = NSPasteboard::pasteboardWithUniqueName();
        let originals = vec![
            vec![
                ("public.utf8-plain-text", b"original".as_slice()),
                ("public.rtf", b"{\\rtf1 original}".as_slice()),
                // AppKit advertises this derived flavor too; seed its exact bytes explicitly.
                (
                    "public.utf16-external-plain-text",
                    b"\xff\xfeo\0r\0i\0g\0i\0n\0a\0l\0".as_slice(),
                ),
            ],
            vec![(
                "public.png",
                include_bytes!("../../../src-tauri/icons/icon.png").as_slice(),
            )],
            vec![("public.file-url", b"file:///tmp/old-file".as_slice())],
        ];
        write(&board, &originals);
        let saved = Snapshot::take(&board).unwrap();
        let expected: Vec<Vec<(String, Vec<u8>)>> = originals
            .iter()
            .map(|item| {
                item.iter()
                    .map(|(kind, bytes)| (kind.to_string(), bytes.to_vec()))
                    .collect()
            })
            .collect();
        assert_eq!(
            saved.items, expected,
            "all item types and exact fixture bytes were captured"
        );
        assert!(copied_files(&board, saved.change_count).is_none());
        assert!(!saved.restore(&board, saved.change_count).unwrap());
        assert_eq!(
            Snapshot::take(&board).unwrap(),
            saved,
            "failed copy leaves every original item intact"
        );
        write(
            &board,
            &[vec![(
                "public.file-url",
                "file:///tmp/%E4%B8%AD%E6%96%87%20file.txt".as_bytes(),
            )]],
        );
        let (copied_count, files, _) = copied_files(&board, saved.change_count).unwrap();
        assert_eq!(files, vec![PathBuf::from("/tmp/中文 file.txt")]);
        assert!(saved.restore(&board, copied_count).unwrap());
        assert_eq!(Snapshot::take(&board).unwrap().items, saved.items);
        board.clearContents();
    }

    // W2-18-CLIPBOARD-02: interleave a real third write after capture, before restoration.
    #[test]
    fn later_copy_is_not_overwritten_by_restoration() {
        let board = NSPasteboard::pasteboardWithUniqueName();
        write(
            &board,
            &[vec![("public.utf8-plain-text", b"before".as_slice())]],
        );
        let saved = Snapshot::take(&board).unwrap();
        write(
            &board,
            &[vec![("public.file-url", b"file:///tmp/copied".as_slice())]],
        );
        let (copied_count, _, _) = copied_files(&board, saved.change_count).unwrap();
        write(
            &board,
            &[vec![(
                "public.utf8-plain-text",
                b"person's next copy".as_slice(),
            )]],
        );
        let latest = Snapshot::take(&board).unwrap();
        assert!(!saved.restore(&board, copied_count).unwrap());
        assert_eq!(Snapshot::take(&board).unwrap(), latest);
        board.clearContents();
    }
}
