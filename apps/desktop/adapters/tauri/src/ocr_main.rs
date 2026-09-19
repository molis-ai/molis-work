//! On-device text recognition for the Shelf. Reads an image, prints the lines
//! Vision found as JSON. No agent, no network, same rules as DropAgent's
//! `ImageText`: accurate level, language correction on, low confidence marked.

fn main() {
    let mut args = std::env::args().skip(1);
    let Some(path) = args.next() else {
        eprintln!("用法：molis-work-ocr <图片路径> [语言,语言]");
        std::process::exit(2);
    };
    let languages: Vec<String> = args
        .next()
        .map(|value| value.split(',').map(|item| item.trim().to_string()).filter(|item| !item.is_empty()).collect())
        .unwrap_or_else(|| vec!["zh-Hans".into(), "en-US".into()]);
    match recognize(&path, &languages) {
        Ok(lines) => println!("{}", json_lines(&lines)),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}

struct Line {
    text: String,
    confidence: f32,
}

fn json_lines(lines: &[Line]) -> String {
    let body = lines
        .iter()
        .map(|line| format!("{{\"text\":{},\"confidence\":{}}}", json_string(&line.text), line.confidence))
        .collect::<Vec<_>>()
        .join(",");
    format!("{{\"lines\":[{body}]}}")
}

fn json_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

#[cfg(not(target_os = "macos"))]
fn recognize(_path: &str, _languages: &[String]) -> Result<Vec<Line>, String> {
    Err("这台机器没有本机文字识别".into())
}

#[cfg(target_os = "macos")]
fn recognize(path: &str, languages: &[String]) -> Result<Vec<Line>, String> {
    use objc2::rc::{Allocated, Retained};
    use objc2::runtime::{AnyClass, AnyObject, Bool};
    use objc2::msg_send;
    use objc2_foundation::{NSArray, NSDictionary, NSString, NSURL};

    // Linking Vision here is what makes its classes visible to the runtime.
    #[link(name = "Vision", kind = "framework")]
    extern "C" {}

    if !std::path::Path::new(path).is_file() {
        return Err("打不开这张图".into());
    }
    unsafe {
        let handler_class = AnyClass::get(c"VNImageRequestHandler").ok_or("这台机器没有本机文字识别")?;
        let request_class = AnyClass::get(c"VNRecognizeTextRequest").ok_or("这台机器没有本机文字识别")?;

        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        let options: Retained<NSDictionary> = NSDictionary::new();
        let handler: Allocated<AnyObject> = msg_send![handler_class, alloc];
        let handler: Retained<AnyObject> = msg_send![handler, initWithURL: &*url, options: &*options];

        let request: Retained<AnyObject> = msg_send![request_class, new];
        let _: () = msg_send![&*request, setRecognitionLevel: 0isize];
        let _: () = msg_send![&*request, setUsesLanguageCorrection: true];
        let names: Vec<Retained<NSString>> = languages.iter().map(|value| NSString::from_str(value)).collect();
        let language_array = NSArray::from_retained_slice(&names);
        let _: () = msg_send![&*request, setRecognitionLanguages: &*language_array];

        let requests = NSArray::from_retained_slice(&[request.clone()]);
        let mut error: *mut AnyObject = std::ptr::null_mut();
        let ok: Bool = msg_send![&*handler, performRequests: &*requests, error: &mut error];
        if !ok.as_bool() {
            return Err("这张图识别失败".into());
        }

        let results: Option<Retained<NSArray<AnyObject>>> = msg_send![&*request, results];
        let Some(results) = results else { return Ok(Vec::new()) };
        let mut lines = Vec::new();
        for index in 0..results.count() {
            let observation = results.objectAtIndex(index);
            let candidates: Option<Retained<NSArray<AnyObject>>> = msg_send![&*observation, topCandidates: 1usize];
            let Some(candidates) = candidates else { continue };
            if candidates.count() == 0 {
                continue;
            }
            let best = candidates.objectAtIndex(0);
            let text: Retained<NSString> = msg_send![&*best, string];
            let confidence: f32 = msg_send![&*best, confidence];
            let text = text.to_string().trim().to_string();
            if text.is_empty() {
                continue;
            }
            lines.push(Line { text, confidence });
        }
        Ok(lines)
    }
}
