import CoreMedia
import CoreVideo
import Foundation
import ScreenCaptureKit

private let frameMagic: [UInt8] = [0x4c, 0x4d, 0x46, 0x52] // LMFR

private struct Options {
    let displayID: CGDirectDisplayID
    let sourceRect: CGRect
    let outputWidth: Int
    let outputHeight: Int
    let fps: Int

    static func parse(_ arguments: [String]) throws -> Options {
        guard arguments.count == 9,
              let displayID = UInt32(arguments[1]),
              let x = Double(arguments[2]),
              let y = Double(arguments[3]),
              let width = Double(arguments[4]),
              let height = Double(arguments[5]),
              let outputWidth = Int(arguments[6]),
              let outputHeight = Int(arguments[7]),
              let fps = Int(arguments[8]),
              width > 0, height > 0,
              outputWidth > 0, outputHeight > 0,
              fps > 0, fps <= 60 else {
            throw CaptureError.invalidArguments
        }
        return Options(
            displayID: displayID,
            sourceRect: CGRect(x: x, y: y, width: width, height: height),
            outputWidth: outputWidth,
            outputHeight: outputHeight,
            fps: fps
        )
    }
}

private enum CaptureError: Error, CustomStringConvertible {
    case invalidArguments
    case displayNotFound

    var description: String {
        switch self {
        case .invalidArguments:
            return "usage: magnifier-capture <display-id> <x> <y> <width> <height> <output-width> <output-height> <fps>"
        case .displayNotFound:
            return "requested display is not available to ScreenCaptureKit"
        }
    }
}

private final class FrameOutput: NSObject, SCStreamOutput {
    private let output = FileHandle.standardOutput
    private var writing = false

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
                of outputType: SCStreamOutputType) {
        guard outputType == .screen, sampleBuffer.isValid, !writing,
              let pixelBuffer = sampleBuffer.imageBuffer else { return }

        writing = true
        defer { writing = false }

        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

        guard let base = CVPixelBufferGetBaseAddress(pixelBuffer) else { return }
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        let sourceStride = CVPixelBufferGetBytesPerRow(pixelBuffer)
        let rowBytes = width * 4

        // ScreenCaptureKit delivers BGRA. Convert to RGBA here so the
        // renderer can construct ImageData directly without a per-frame
        // JavaScript color shuffle.
        var payload = Data(count: rowBytes * height)
        payload.withUnsafeMutableBytes { rawDestination in
            guard let destination = rawDestination.bindMemory(to: UInt8.self).baseAddress else { return }
            for row in 0..<height {
                let source = base.advanced(by: row * sourceStride).assumingMemoryBound(to: UInt8.self)
                let target = destination.advanced(by: row * rowBytes)
                for column in 0..<width {
                    let offset = column * 4
                    target[offset] = source[offset + 2]
                    target[offset + 1] = source[offset + 1]
                    target[offset + 2] = source[offset]
                    target[offset + 3] = source[offset + 3]
                }
            }
        }

        var packet = Data(frameMagic)
        appendUInt32(UInt32(width), to: &packet)
        appendUInt32(UInt32(height), to: &packet)
        appendUInt32(UInt32(payload.count), to: &packet)
        packet.append(payload)
        do {
            try output.write(contentsOf: packet)
        } catch {
            // The parent closed stdout, so there is no consumer left.
            exit(0)
        }
    }

    private func appendUInt32(_ value: UInt32, to data: inout Data) {
        var littleEndian = value.littleEndian
        withUnsafeBytes(of: &littleEndian) { data.append(contentsOf: $0) }
    }
}

private final class RegionCapture: NSObject, SCStreamDelegate {
    private let frameOutput = FrameOutput()
    private let captureQueue = DispatchQueue(label: "org.edutictac.lekhini.magnifier.frames")
    private var stream: SCStream?

    func start(options: Options) async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(
            false,
            onScreenWindowsOnly: true
        )
        guard let display = content.displays.first(where: { $0.displayID == options.displayID }) else {
            throw CaptureError.displayNotFound
        }

        let excludedApplications = content.applications.filter {
            $0.bundleIdentifier == "org.opensourcebharat.lekhini"
        }
        let filter = SCContentFilter(
            display: display,
            excludingApplications: excludedApplications,
            exceptingWindows: []
        )
        let configuration = SCStreamConfiguration()
        configuration.sourceRect = options.sourceRect
        configuration.width = options.outputWidth
        configuration.height = options.outputHeight
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(options.fps))
        configuration.queueDepth = 2
        configuration.pixelFormat = kCVPixelFormatType_32BGRA
        configuration.showsCursor = false

        let stream = SCStream(filter: filter, configuration: configuration, delegate: self)
        try stream.addStreamOutput(frameOutput, type: .screen, sampleHandlerQueue: captureQueue)
        self.stream = stream
        try await stream.startCapture()
    }

    func stop() async {
        guard let stream else { return }
        try? await stream.stopCapture()
        try? stream.removeStreamOutput(frameOutput, type: .screen)
        self.stream = nil
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        FileHandle.standardError.write(Data("capture stopped: \(error.localizedDescription)\n".utf8))
        exit(2)
    }
}

@main
private struct MagnifierCapture {
    static func main() async {
        do {
            let options = try Options.parse(CommandLine.arguments)
            let capture = RegionCapture()
            try await capture.start(options: options)

            signal(SIGTERM, SIG_IGN)
            signal(SIGINT, SIG_IGN)
            let term = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
            let interrupt = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
            let stop: () -> Void = {
                Task {
                    await capture.stop()
                    exit(0)
                }
            }
            term.setEventHandler(handler: stop)
            interrupt.setEventHandler(handler: stop)
            term.resume()
            interrupt.resume()

            await withCheckedContinuation { (_: CheckedContinuation<Void, Never>) in }
        } catch {
            FileHandle.standardError.write(Data("magnifier provider: \(error)\n".utf8))
            exit(1)
        }
    }
}
