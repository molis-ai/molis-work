import Foundation
import AVFoundation
import Vision
import WhisperKit
import ArgmaxCore

private let variant = "large-v3-v20240930_626MB"
private let modelBytes = 626_000_000
private struct Segment: Codable { let start_seconds: Double; let end_seconds: Double; let text: String }
private struct Frame: Codable { let seconds: Double; let text: String; let confidence: Double? }
private struct Page: Codable { let number: Int; let text: String; let method: String; let confidence: Double? }
private struct Coverage: Codable { let status: String; let processed_pages: Int; let total_pages: Int; let issues: [String] }
private struct Output: Codable { let text: String; let pages: [Page]; let segments: [Segment]; let frames: [Frame]; let coverage: Coverage; let extractor: String; let duration_seconds: Double }
private struct Failure: Codable { let error: String; let message: String; let approximate_bytes: Int?; let variant: String? }
private enum MediaError: Error { case failure(String, String) }
private func emit<T: Encodable>(_ value: T) throws { let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]; FileHandle.standardOutput.write(try encoder.encode(value)); FileHandle.standardOutput.write(Data([10])) }
private func progress(_ stage: String, _ fraction: Double) { if let data = try? JSONSerialization.data(withJSONObject: ["stage": stage, "progress": max(0, min(1, fraction))], options: [.sortedKeys]) { FileHandle.standardError.write(data); FileHandle.standardError.write(Data([10])) } }
private func within(_ child: URL, _ root: URL) -> Bool { child.standardizedFileURL.resolvingSymlinksInPath().path.hasPrefix(root.standardizedFileURL.resolvingSymlinksInPath().path + "/") }
private func isModel(_ folder: URL, root: URL) -> Bool {
    guard within(folder, root), folder.lastPathComponent.contains(variant) else { return false }
    return ["MelSpectrogram", "AudioEncoder", "TextDecoder"].allSatisfy { name in ["mlmodelc", "mlpackage"].contains { ext in FileManager.default.fileExists(atPath: folder.appendingPathComponent("\(name).\(ext)").path) } }
}
private func modelFolder(_ root: URL) -> URL? {
    for parent in [root, root.appendingPathComponent("models/argmaxinc/whisperkit-coreml")] {
        if let children = try? FileManager.default.contentsOfDirectory(at: parent, includingPropertiesForKeys: nil), let model = children.first(where: { isModel($0, root: root) }) { return model }
    }
    return nil
}
private func tokenizerAvailable(_ root: URL, model: URL) -> Bool {
    let candidates = [root, model, root.appendingPathComponent("models/openai/whisper-large-v3"), model.appendingPathComponent("models/openai/whisper-large-v3")]
    return candidates.contains { folder in
        let file = folder.appendingPathComponent("tokenizer.json")
        guard within(file, root), let data = try? Data(contentsOf: file), (try? JSONSerialization.jsonObject(with: data)) != nil else { return false }
        return true
    }
}
private final class NoNetwork: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.scheme == "http" || request.url?.scheme == "https" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { client?.urlProtocol(self, didFailWithError: NSError(domain: "JellyWhisper", code: 1, userInfo: [NSLocalizedDescriptionKey: "未授权下载模型或tokenizer"])) }
    override func stopLoading() {}
}
private func prepareModel(_ root: URL, allowDownload: Bool) async throws -> URL {
    if let existing = modelFolder(root), tokenizerAvailable(root, model: existing) { return existing }
    guard allowDownload else { throw MediaError.failure("model_required", "音视频转写需要下载约 626 MB 的本地 Whisper 模型，等待用户明确选择") }
    progress("model_download", 0)
    let folder: URL
    if let existing = modelFolder(root) { folder = existing }
    else { folder = try await WhisperKit.download(variant: variant, downloadBase: root, from: "argmaxinc/whisperkit-coreml", progressCallback: { value in progress("model_download", value.fractionCompleted) }) }
    guard isModel(folder, root: root) else { throw MediaError.failure("model_download_failed", "模型下载结果不完整") }
    // Tokenizer is permitted only within the same explicit download choice.
    if !tokenizerAvailable(root, model: folder) { _ = try await ModelUtilities.loadTokenizer(for: .largev3, tokenizerFolder: root, additionalSearchPaths: [folder]) }
    return folder
}
private func normalized(_ raw: [TranscriptionSegment]) throws -> [Segment] {
    let segments = raw.compactMap { segment -> Segment? in
        let text = segment.text.replacingOccurrences(of: "<\\|[^>]*\\|>", with: "", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
        let start = Double(segment.start); let end = Double(segment.end)
        guard start.isFinite, end.isFinite, start >= 0, end >= start, end <= 604800, text.unicodeScalars.contains(where: { CharacterSet.alphanumerics.contains($0) }) else { return nil }
        return Segment(start_seconds: start, end_seconds: end, text: text)
    }.sorted { $0.start_seconds < $1.start_seconds }
    guard !segments.isEmpty else { throw MediaError.failure("insufficient_content", "未识别到有意义的语音内容") }
    let fingerprints = segments.map { $0.text.lowercased().unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) }.map(String.init).joined() }
    if fingerprints.count >= 3, Set(fingerprints).count == 1, fingerprints[0].count <= 4 { throw MediaError.failure("insufficient_content", "转写仅得到短句重复噪声") }
    return segments
}
private func transcribe(_ audio: URL, folder: URL, models: URL) async throws -> [Segment] {
    progress("transcribing", 0)
    let kit = try await WhisperKit(WhisperKitConfig(modelFolder: folder.path, tokenizerFolder: models, verbose: false, logLevel: .none, prewarm: ProcessInfo.processInfo.physicalMemory < 32 * 1024 * 1024 * 1024, load: true, download: false))
    let results = try await kit.transcribe(audioPath: audio.path, decodeOptions: DecodingOptions(skipSpecialTokens: true, suppressBlank: true), callback: { _ in if Task.isCancelled { return false }; progress("transcribing", 0.5); return nil })
    try Task.checkCancellation(); progress("transcribing", 1)
    return try normalized(results.flatMap(\.segments))
}
private final class ExportBox: @unchecked Sendable { let session: AVAssetExportSession; init(_ session: AVAssetExportSession) { self.session = session } }
private func audioTrack(_ asset: AVURLAsset, output: URL) async throws -> URL {
    guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else { throw MediaError.failure("audio_extraction_failed", "无法创建音轨提取器") }
    session.outputURL = output; session.outputFileType = .m4a; let box = ExportBox(session)
    await withTaskCancellationHandler { await withCheckedContinuation { continuation in box.session.exportAsynchronously { continuation.resume() } } } onCancel: { box.session.cancelExport() }
    try Task.checkCancellation(); guard session.status == .completed else { throw MediaError.failure("audio_extraction_failed", "视频音轨提取失败") }; return output
}
private func recognize(_ image: CGImage) throws -> (String, Double?) {
    let request = VNRecognizeTextRequest(); request.recognitionLevel = .accurate; request.usesLanguageCorrection = true
    let supported = try request.supportedRecognitionLanguages(); request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"].filter { supported.contains($0) }
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    let candidates = (request.results ?? []).compactMap { $0.topCandidates(1).first }
    return (candidates.map(\.string).joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines), candidates.isEmpty ? nil : candidates.reduce(0) { $0 + Double($1.confidence) } / Double(candidates.count))
}
private func videoFrames(_ asset: AVURLAsset, duration: Double) async -> ([Frame], [String]) {
    let generator = AVAssetImageGenerator(asset: asset); generator.appliesPreferredTrackTransform = true; generator.maximumSize = CGSize(width: 1600, height: 1600)
    generator.requestedTimeToleranceBefore = CMTime(seconds: 0.25, preferredTimescale: 600); generator.requestedTimeToleranceAfter = CMTime(seconds: 0.25, preferredTimescale: 600)
    var frames: [Frame] = []; var issues: [String] = []
    for (index, fraction) in [0.0, 0.25, 0.5, 0.75, 0.999].enumerated() {
        do { try Task.checkCancellation(); let seconds = max(0, min(duration - 0.001, duration * fraction)); let result = try await generator.image(at: CMTime(seconds: seconds, preferredTimescale: 600)); let ocr = try recognize(result.image); frames.append(Frame(seconds: result.actualTime.seconds, text: ocr.0, confidence: ocr.1)); progress("frame_ocr", Double(index + 1) / 5) }
        catch { issues.append("第 \(index + 1) 个采样帧读取或 OCR 失败") }
    }
    return (frames, issues)
}
private func extract(file: URL, models: URL, work: URL, allowDownload: Bool) async throws -> Output {
    let metadata = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
    guard metadata.isRegularFile == true, metadata.isSymbolicLink != true, let bytes = metadata.fileSize, bytes > 0, bytes <= 25 * 1024 * 1024 else { throw MediaError.failure("invalid_file", "音视频文件无效或超过 25 MB") }
    let asset = AVURLAsset(url: file); let duration = try await asset.load(.duration).seconds
    guard duration.isFinite, duration > 0, duration <= 604800 else { throw MediaError.failure("invalid_media", "媒体时长无效或超过 7 天") }
    let audioTracks = try await asset.loadTracks(withMediaType: .audio); let videoTracks = try await asset.loadTracks(withMediaType: .video)
    guard !audioTracks.isEmpty || !videoTracks.isEmpty else { throw MediaError.failure("invalid_media", "媒体没有可读取的音轨或画面") }
    let isVideo = !videoTracks.isEmpty; var segments: [Segment] = []; var frames: [Frame] = []; var issues: [String] = []
    if !audioTracks.isEmpty {
        let folder = try await prepareModel(models, allowDownload: allowDownload)
        let audio = isVideo ? try await audioTrack(asset, output: work.appendingPathComponent("audio.m4a")) : file
        do { segments = try await transcribe(audio, folder: folder, models: models) } catch { if !isVideo { throw error }; issues.append("音轨转写失败") }
    } else { issues.append("视频没有音轨，未进行语音转写") }
    if isVideo { let sampled = await videoFrames(asset, duration: duration); frames = sampled.0; issues.append(contentsOf: sampled.1); issues.append("仅采样 5 帧中的文字，未理解完整视觉内容") }
    var parts = segments.map { "[\(String(format: "%.2f", $0.start_seconds))–\(String(format: "%.2f", $0.end_seconds)) 秒] \($0.text)" }
    parts.append(contentsOf: frames.filter { !$0.text.isEmpty }.map { "[画面 \(String(format: "%.2f", $0.seconds)) 秒] \($0.text)" })
    var text = parts.joined(separator: "\n"); if text.count > 2_000_000 { text = String(text.prefix(2_000_000)); issues.append("文字达到 200 万字符上限") }
    let page = Page(number: 1, text: text, method: isVideo ? "whisper-avfoundation-frame-ocr" : "whisper-transcript", confidence: nil)
    let status = text.isEmpty ? "insufficient" : issues.isEmpty ? "sufficient" : "partial"
    return Output(text: text, pages: [page], segments: segments, frames: frames, coverage: Coverage(status: status, processed_pages: text.isEmpty ? 0 : 1, total_pages: 1, issues: issues), extractor: isVideo ? "macos-whisper-video" : "macos-whisper-audio", duration_seconds: duration)
}
@main struct JellyWhisperMain {
    static func main() async {
        Logging.shared.logLevel = .none
        do {
            let arguments = Array(CommandLine.arguments.dropFirst())
            if arguments.count == 2, arguments[0] == "capabilities" {
                let root = URL(fileURLWithPath: arguments[1]); let model = modelFolder(root)
                let ready = model.map { tokenizerAvailable(root, model: $0) } ?? false
                try emit(["model": ready ? "available" : "model_required", "variant": variant, "approximate_bytes": String(modelBytes)]); return
            }
            guard arguments.count == 4 || arguments.count == 5, arguments[0] == "extract", arguments.count == 4 || arguments[4] == "--allow-model-download" else { throw MediaError.failure("invalid_arguments", "用法：jelly-whisper extract <文件> <模型目录> <临时目录> [--allow-model-download]") }
            let allowDownload = arguments.count == 5
            if !allowDownload { URLProtocol.registerClass(NoNetwork.self) }
            let file = URL(fileURLWithPath: arguments[1]); let models = URL(fileURLWithPath: arguments[2]); let work = URL(fileURLWithPath: arguments[3])
            try FileManager.default.createDirectory(at: models, withIntermediateDirectories: true); try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
            let result = try await extract(file: file, models: models, work: work, allowDownload: allowDownload); try emit(result)
        } catch {
            let code: String; let message: String
            if case let MediaError.failure(c, m) = error { code = c; message = m } else { code = "transcription_failed"; message = "音视频提取失败：\(error.localizedDescription)" }
            try? emit(Failure(error: code, message: message, approximate_bytes: code == "model_required" ? modelBytes : nil, variant: code == "model_required" ? variant : nil)); exit(1)
        }
    }
}
