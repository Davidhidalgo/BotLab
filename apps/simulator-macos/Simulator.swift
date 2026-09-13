import AppKit

struct SimulatorDefinition: Decodable {
    let id: String
    let name: String
    let executable: String
    let arguments: [String]
    let environment: [String: String]
    let healthURL: URL
    let editorURL: URL
}

struct SimulatorCatalog: Decodable {
    let schemaVersion: Int
    let simulators: [SimulatorDefinition]
}

final class SimulatorApp: NSObject, NSApplicationDelegate {
    private var gateway: Process?
    private var window: NSWindow!
    private var status: NSTextField!
    private let selector = NSPopUpButton()
    private var startButton: NSButton!
    private var simulators: [SimulatorDefinition] = []
    private var poll: Timer?
    private var quitting = false
    private var ready = false
    private let logs = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Logs/BotLab Simulator", isDirectory: true)

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let root = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Open Editor", action: #selector(openEditor), keyEquivalent: "e").target = self
        appMenu.addItem(withTitle: "Show Logs", action: #selector(showLogs), keyEquivalent: "l").target = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit BotLab Simulator", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        root.submenu = appMenu
        menu.addItem(root)
        NSApp.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 460, height: 195),
                          styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "BotLab Simulator"
        window.isReleasedWhenClosed = false
        selector.frame = NSRect(x: 24, y: 145, width: 280, height: 30)
        window.contentView?.addSubview(selector)
        startButton = NSButton(title: "Start", target: self, action: #selector(startSelected))
        startButton.frame = NSRect(x: 320, y: 145, width: 110, height: 30)
        window.contentView?.addSubview(startButton)
        status = NSTextField(wrappingLabelWithString: "Choose an installed simulator.")
        status.frame = NSRect(x: 24, y: 65, width: 410, height: 65)
        window.contentView?.addSubview(status)
        let button = NSButton(title: "Open Editor", target: self, action: #selector(openEditor))
        button.frame = NSRect(x: 24, y: 24, width: 150, height: 32)
        window.contentView?.addSubview(button)
        window.center()
        window.makeKeyAndOrderFront(nil)
        do {
            let data = try Data(contentsOf: Bundle.main.resourceURL!.appendingPathComponent("simulators.json"))
            let catalog = try JSONDecoder().decode(SimulatorCatalog.self, from: data)
            guard catalog.schemaVersion == 1, !catalog.simulators.isEmpty,
                  Set(catalog.simulators.map { $0.id }).count == catalog.simulators.count else {
                throw NSError(domain: "BotLab", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unsupported simulator catalog."])
            }
            simulators = catalog.simulators
            selector.addItems(withTitles: simulators.map { $0.name })
            if simulators.count == 1 { startSelected() }
        } catch { fail(error.localizedDescription) }
    }

    @objc private func startSelected() {
        guard gateway == nil, simulators.indices.contains(selector.indexOfSelectedItem) else { return }
        do { try startGateway(simulators[selector.indexOfSelectedItem]) }
        catch { gateway = nil; fail(error.localizedDescription) }
    }

    private func startGateway(_ simulator: SimulatorDefinition) throws {
        let resources = Bundle.main.resourceURL!
        let executable = resources.appendingPathComponent(simulator.executable).standardizedFileURL.resolvingSymlinksInPath()
        guard executable.path.hasPrefix(resources.resolvingSymlinksInPath().path + "/") else {
            throw NSError(domain: "BotLab", code: 2, userInfo: [NSLocalizedDescriptionKey: "Simulator executable is outside its package."])
        }
        func expand(_ text: String) -> String {
            text.replacingOccurrences(of: "${resources}", with: resources.path)
                .replacingOccurrences(of: "${logs}", with: logs.path)
                .replacingOccurrences(of: "${parentPid}", with: String(ProcessInfo.processInfo.processIdentifier))
        }
        try FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true)
        let log = logs.appendingPathComponent("launcher.log")
        FileManager.default.createFile(atPath: log.path, contents: nil)
        let output = try FileHandle(forWritingTo: log)
        let child = Process()
        child.executableURL = executable
        child.arguments = simulator.arguments.map(expand)
        // The installed host never inherits a development virtual environment.
        var environment = ["HOME": FileManager.default.homeDirectoryForCurrentUser.path,
                           "PATH": "/usr/bin:/bin:/usr/sbin:/sbin"]
        for (key, value) in simulator.environment { environment[key] = expand(value) }
        child.environment = environment
        child.standardOutput = output
        child.standardError = output
        child.terminationHandler = { [weak self] process in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.poll?.invalidate()
                self.gateway = nil
                self.selector.isEnabled = true
                self.startButton.isEnabled = true
                if self.quitting { NSApp.reply(toApplicationShouldTerminate: true) }
                else if process.terminationStatus == 0 {
                    if self.simulators.count == 1 { NSApp.terminate(nil) }
                    else { self.status.stringValue = "Simulator closed. Choose another to continue."; self.window.makeKeyAndOrderFront(nil) }
                } else {
                    self.fail("The simulator stopped. Check Show Logs for details. Close any other simulator using the same local ports before trying again.")
                }
            }
        }
        gateway = child
        ready = false
        selector.isEnabled = false
        startButton.isEnabled = false
        status.stringValue = "Starting \(simulator.name)…"
        try child.run()
        poll = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self = self, !self.ready else { return }
            var request = URLRequest(url: simulator.healthURL)
            request.timeoutInterval = 1
            URLSession.shared.dataTask(with: request) { data, _, _ in
                guard let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      json["protocolVersion"] as? Int == 1,
                      json["simulatorId"] as? String == simulator.id,
                      json["presentation"] as? String == "external",
                      json["pid"] as? Int == Int(child.processIdentifier) else { return }
                DispatchQueue.main.async {
                    guard self.gateway === child, !self.quitting else { return }
                    self.ready = true
                    self.poll?.invalidate()
                    self.status.stringValue = "\(simulator.name) is ready in its native window. Open the editor and connect."
                    self.window.orderOut(nil)
                }
            }.resume()
        }
    }

    private func fail(_ message: String) {
        status.stringValue = message
        selector.isEnabled = gateway == nil
        startButton.isEnabled = gateway == nil && !simulators.isEmpty
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func openEditor() {
        if simulators.indices.contains(selector.indexOfSelectedItem) {
            NSWorkspace.shared.open(simulators[selector.indexOfSelectedItem].editorURL)
        }
    }
    @objc private func showLogs() { NSWorkspace.shared.open(logs) }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil)
        return true
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let child = gateway, child.isRunning else { return .terminateNow }
        quitting = true
        poll?.invalidate()
        status.stringValue = "Stopping simulator…"
        child.terminate()
        return .terminateLater
    }
}

let app = NSApplication.shared
let delegate = SimulatorApp()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
