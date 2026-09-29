// swift-tools-version: 6.2
import PackageDescription
let package = Package(
    name: "JellyWhisper",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "jelly-whisper", targets: ["JellyWhisper"])],
    dependencies: [.package(url: "https://github.com/argmaxinc/argmax-oss-swift.git", exact: "1.0.0")],
    targets: [.executableTarget(name: "JellyWhisper", dependencies: [.product(name: "WhisperKit", package: "argmax-oss-swift")], linkerSettings: [.linkedFramework("AVFoundation"), .linkedFramework("Vision")])]
)
