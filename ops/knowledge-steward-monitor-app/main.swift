import Foundation

let projectRoot = "/Users/sossa/Documents/Codex/BeatSS"
let runner = projectRoot + "/scripts/run-knowledge-steward-monitor.sh"

let process = Process()
process.executableURL = URL(fileURLWithPath: "/bin/zsh")
process.arguments = [runner]
process.currentDirectoryURL = URL(fileURLWithPath: projectRoot, isDirectory: true)

do {
    try process.run()
    process.waitUntilExit()
    exit(process.terminationStatus)
} catch {
    fputs("Unable to start the BEATSS Knowledge Steward monitor.\\n", stderr)
    exit(1)
}
