# Terminal PTY Alternatives for Obsidian Plugins - Research Report

## Problem Statement

The current terminal implementation in our Obsidian plugin uses `child_process` instead of proper PTY functionality due to Obsidian's inability to bundle native modules like `node-pty`. This limits terminal capabilities (no proper shell interaction, no resize support, limited I/O handling).

## Why node-pty Doesn't Work in Obsidian

- **Native Module Restrictions**: Obsidian runs in Electron, which restricts loading non-context-aware native modules
- **Bundling Limitations**: node-pty contains C++ code that must be compiled, preventing it from being bundled into the plugin
- **Security Constraints**: Recent Electron versions block native modules for security reasons

## Research Findings: PTY Alternatives

### 1. Python-Based PTY Helper (PROVEN APPROACH)

**Source**: [polyipseity/obsidian-terminal](https://github.com/polyipseity/obsidian-terminal)

**How it Works**:
- Uses a separate Python script (`pty-helper.py`) as PTY intermediary
- Plugin communicates with Python helper via file descriptors/pipes
- Python handles actual PTY creation and process spawning
- Works on Linux, macOS, and Windows

**Implementation Details**:
```python
# pty-helper.py approach
- Requires Python 3.10+
- Dependencies: psutil==5.9.5, pywinctl==0.0.50, typing_extensions==4.7.1
- Uses file descriptor 3 for terminal size changes
- Handles cross-platform shell spawning
```

**Pros**:
- ✅ Proven to work in Obsidian plugins
- ✅ Full PTY functionality (resize, proper shell interaction)
- ✅ Cross-platform compatibility
- ✅ Active maintenance (3.16.0 released 2 months ago)

**Cons**:
- ❌ Requires Python installation on user system
- ❌ Additional dependency management
- ❌ More complex setup process

### 2. Pure JavaScript Terminal Emulator

**Source**: [rohanchandra/javascript-terminal](https://github.com/rohanchandra/javascript-terminal)

**How it Works**:
- Pure JavaScript terminal emulator with Immutable.js
- Simulates terminal environment without system processes
- Predefined command set (ls, cd, cat, etc.)
- No native dependencies

**Capabilities**:
- Command parsing and autocompletion
- Environment variable management
- Keyboard history navigation
- Extensible command mapping

**Pros**:
- ✅ Pure JavaScript (no native dependencies)
- ✅ Works in browsers and Node.js
- ✅ No system-level constraints
- ✅ Easy to bundle in Obsidian plugin

**Cons**:
- ❌ Not a true PTY - simulated terminal only
- ❌ No real system command execution
- ❌ Limited to predefined command set
- ❌ Cannot launch Claude Code CLI

### 3. Browser-Compatible PTY Implementation

**Source**: [xterm-pty](https://xterm-pty.netlify.app/)

**How it Works**:
- Implements "simple Linux-like line discipline" in pure JavaScript
- Designed for Emscripten-compiled CUI programs
- Works in browsers without node-pty
- Uses WebAssembly for compiled programs

**Technical Approach**:
- JavaScript implementation of PTY line discipline
- Input echo, line editing, conversion in JS
- Bridge between xterm.js and WebAssembly programs

**Pros**:
- ✅ Pure JavaScript PTY implementation
- ✅ Works in browsers
- ✅ Demonstrates PTY functionality without native code

**Cons**:
- ❌ Requires WebAssembly support
- ❌ Designed for Emscripten programs, not system shells
- ❌ Proof-of-concept rather than production-ready
- ❌ Would need significant adaptation for our use case

### 4. WebSocket PTY Proxy

**Concept**: Remote terminal over WebSocket connection

**How it Would Work**:
- External PTY server (separate process/service)
- Plugin connects via WebSocket
- xterm.js frontend with WebSocket backend

**Implementation Options**:
- Standalone PTY server written in Go/Node.js
- SSH-like connection to local/remote terminal
- Custom protocol for terminal I/O

**Pros**:
- ✅ Full PTY functionality
- ✅ No bundling constraints
- ✅ Could support remote terminals

**Cons**:
- ❌ Requires separate service installation
- ❌ Complex setup and configuration
- ❌ Network dependency for local terminals

## Recommendations

### Primary Recommendation: Python PTY Helper

**Adopt the Python-based approach used by obsidian-terminal**

**Rationale**:
1. **Proven Solution**: Successfully implemented in production Obsidian plugin
2. **Full PTY Support**: Proper shell interaction, resizing, I/O handling
3. **Cross-Platform**: Works on Windows, macOS, Linux
4. **Maintainable**: Well-documented approach with active community

**Implementation Plan**:
1. Create `resources/pty-helper.py` script
2. Modify terminal view to spawn Python helper instead of direct child_process
3. Implement IPC between plugin and Python helper
4. Add Python installation detection and setup guidance
5. Handle cross-platform shell configuration

### Secondary Recommendation: WebSocket PTY Proxy

**For advanced users or future enhancement**

**Use Case**: When Python installation is not feasible or for remote terminal support

**Implementation**: Create optional WebSocket-based PTY server that users can install separately

### Not Recommended

1. **Pure JavaScript Terminal Emulator**: Too limited for our Claude Code use case
2. **xterm-pty Adaptation**: Too experimental and would require extensive modification
3. **Continuing with child_process**: Lacks essential PTY features

## Implementation Strategy

### Phase 1: Python PTY Helper
- Study obsidian-terminal's pty-helper.py implementation
- Create minimal PTY helper for our specific use case
- Implement plugin-side IPC handling
- Add Python detection and setup flow

### Phase 2: Enhanced User Experience
- Auto-detect Python installation
- Provide platform-specific installation instructions
- Graceful fallback to child_process when Python unavailable
- Enhanced error handling and user guidance

### Phase 3: Optional Enhancements
- WebSocket PTY proxy for advanced users
- Remote terminal support
- Integration with existing terminal solutions

## Technical Considerations

### Security
- Validate Python script integrity
- Sandbox Python helper process
- Handle process cleanup properly

### Cross-Platform Support
- Windows: PowerShell, CMD, WSL detection
- macOS: zsh, bash shell selection
- Linux: Common shell detection

### Error Handling
- Python installation validation
- PTY helper crash recovery
- Graceful degradation strategies

## Detailed Implementation Plan

Based on analysis of the proven `polyipseity/obsidian-terminal` plugin implementation, here's the detailed plan:

### Architecture Overview

```typescript
interface Pseudoterminal {
  readonly shell?: Promise<ChildProcess> | undefined
  readonly kill: () => Promise<void>
  readonly onExit: Promise<NodeJS.Signals | number>
  readonly pipe: (terminal: Terminal) => Promise<void>
  readonly resize?: (columns: number, rows: number) => Promise<void>
}
```

### Phase 1: Python PTY Helper Scripts

**1.1 Create `src/terminal/unix_pseudoterminal.py`** (98 lines from obsidian-terminal)
```python
# Key features from their implementation:
- Uses Python's built-in `pty.fork()` for Unix systems
- File descriptor 3 for resize commands (format: "COLUMNSxROWS\n")
- Selector-based I/O multiplexing for stdin/stdout/resize
- Handles shell process lifecycle and cleanup
- Executes shell command passed as arguments
```

**1.2 Create `src/terminal/win32_resizer.py`** (252 lines from obsidian-terminal)
```python
# Windows-specific resizing via Python dependencies:
- psutil>=5.9.5 for process management
- pywinctl>=0.0.50 for window control
- Complex console buffer manipulation
- Window handle detection and resizing
```

**1.3 Create `requirements.txt`**
```
psutil>=5.9.5
pywinctl>=0.0.50  
typing_extensions>=4.7.1
```

### Phase 2: TypeScript PTY Classes

**2.1 Create `src/terminal/shell-pseudoterminal.ts`**

```typescript
export class UnixPseudoterminal implements Pseudoterminal {
  private static readonly CMDIO_FD = 3
  public readonly shell: Promise<ChildProcess>
  public readonly onExit: Promise<NodeJS.Signals | number>

  constructor(args: {
    executable: string
    args?: string[]
    cwd?: string
    pythonExecutable?: string
  }) {
    // Spawn Python helper with unix_pseudoterminal.py
    this.shell = this.spawnPythonHelper(args)
    this.onExit = this.shell.then(shell => 
      new Promise(resolve => shell.once("exit", resolve))
    )
  }

  private async spawnPythonHelper(args): Promise<ChildProcess> {
    const python = args.pythonExecutable || "python3"
    const script = await import("./unix_pseudoterminal.py?raw") // Vite raw import
    
    return spawn(python, ["-c", script, args.executable, ...args.args], {
      cwd: args.cwd,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      stdio: ["pipe", "pipe", "pipe", "pipe"] // stdin, stdout, stderr, cmdio
    })
  }

  async pipe(terminal: Terminal): Promise<void> {
    const shell = await this.shell
    
    // Pipe shell output to terminal
    shell.stdout.on("data", (data: Buffer) => terminal.write(data.toString()))
    shell.stderr.on("data", (data: Buffer) => terminal.write(data.toString()))
    
    // Pipe terminal input to shell
    terminal.onData(data => shell.stdin?.write(data))
  }

  async resize(columns: number, rows: number): Promise<void> {
    const shell = await this.shell
    const cmdio = shell.stdio[UnixPseudoterminal.CMDIO_FD] as Writable
    await writePromise(cmdio, `${columns}x${rows}\n`)
  }

  async kill(): Promise<void> {
    const shell = await this.shell
    shell.kill("SIGTERM")
  }
}
```

**2.2 Modify `src/terminal/terminal-view.ts`**

```typescript
import { UnixPseudoterminal } from "./shell-pseudoterminal"

export class ClaudeTerminalView extends ItemView {
  private terminal: Terminal
  private fitAddon: FitAddon
  private pseudoterminal: UnixPseudoterminal | null = null

  async startShell(): Promise<void> {
    try {
      // Try Python PTY approach first
      this.pseudoterminal = new UnixPseudoterminal({
        executable: "/opt/homebrew/bin/zsh",
        args: ["-l"],
        cwd: process.cwd(),
        pythonExecutable: "python3"
      })
      
      await this.pseudoterminal.pipe(this.terminal)
      
      // Handle resizing
      this.terminal.onResize(({ cols, rows }) => {
        this.pseudoterminal?.resize(cols, rows)
      })
      
    } catch (error) {
      console.warn("[Terminal] Python PTY failed, falling back to child_process:", error)
      // Fallback to existing child_process implementation
      await this.startChildProcessShell()
    }
  }
}
```

### Phase 3: Python Detection and Setup

**3.1 Add Python Detection**
```typescript
async function detectPython(): Promise<string | null> {
  const candidates = ["python3", "python", "/usr/bin/python3"]
  
  for (const python of candidates) {
    try {
      const result = await execPromise(`${python} --version`)
      if (result.stdout.includes("Python 3.")) {
        return python
      }
    } catch {}
  }
  return null
}
```

**3.2 Add Setup Guidance Modal**
```typescript
class PythonSetupModal extends Modal {
  constructor(app: App) {
    super(app)
  }
  
  onOpen() {
    const { contentEl } = this
    contentEl.createEl("h2", { text: "Python Setup Required" })
    contentEl.createEl("p", { 
      text: "For full terminal functionality, please install Python 3.10+ and dependencies:" 
    })
    
    const codeEl = contentEl.createEl("pre")
    codeEl.createEl("code", { 
      text: "pip3 install psutil>=5.9.5 pywinctl>=0.0.50 typing_extensions>=4.7.1" 
    })
    
    // Platform-specific instructions
    if (process.platform === "darwin") {
      contentEl.createEl("p", { text: "On macOS, Python 3 is usually pre-installed." })
    }
  }
}
```

### Phase 4: Enhanced Error Handling

**4.1 Graceful Degradation**
```typescript
export class TerminalManager {
  private pythonPath: string | null = null
  
  async initialize() {
    this.pythonPath = await detectPython()
    if (!this.pythonPath) {
      new Notice("Terminal: Python not found. Using basic terminal mode.")
      // Show setup modal once
      if (!localStorage.getItem("claude-terminal-python-setup-shown")) {
        new PythonSetupModal(this.app).open()
        localStorage.setItem("claude-terminal-python-setup-shown", "true")
      }
    }
  }
  
  createTerminal(): Pseudoterminal {
    if (this.pythonPath) {
      return new UnixPseudoterminal({ pythonExecutable: this.pythonPath })
    } else {
      return new ChildProcessPseudoterminal() // Fallback
    }
  }
}
```

### Phase 5: Bundle Configuration

**5.1 Update `esbuild.config.mjs`**
```javascript
export default {
  // ... existing config
  loader: {
    ".py": "text", // Bundle Python scripts as text
  },
  define: {
    // Make Python scripts available at runtime
    "import.meta.glob": "undefined",
  },
}
```

**5.2 Update `package.json`**
```json
{
  "dependencies": {
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0"
    // Remove node-pty dependency
  }
}
```

### Phase 6: Testing and Validation

**6.1 Test Matrix**
- ✅ macOS with Python 3.10+ → Full PTY functionality
- ✅ macOS without Python → child_process fallback
- ✅ Windows with Python + dependencies → Full functionality  
- ✅ Linux with Python → Full functionality
- ✅ Terminal resizing, shell interaction, Claude Code launch

**6.2 Integration Tests**
```typescript
// Test Python PTY helper
const pty = new UnixPseudoterminal({
  executable: "echo",
  args: ["hello world"]
})

// Test resize functionality
await pty.resize(80, 24)

// Test Claude Code launch
terminal.sendText("claude\n")
```

### Migration from Current Implementation

1. **Keep existing child_process code** as fallback
2. **Add Python detection** on plugin load
3. **Implement UnixPseudoterminal class** alongside existing code
4. **Update terminal-view.ts** to try Python PTY first, fallback to child_process
5. **Bundle Python scripts** as text resources
6. **Add user guidance** for Python setup

This approach provides **full PTY functionality** when Python is available while maintaining **compatibility** with systems that don't have Python configured.

## Conclusion

The Python PTY helper approach offers the best balance of functionality, reliability, and maintainability for our Obsidian Claude Code integration. The implementation plan above is based on the proven architecture from `polyipseity/obsidian-terminal` and provides:

- **Full PTY functionality** with proper shell interaction and resizing
- **Graceful degradation** to child_process when Python unavailable  
- **Cross-platform compatibility** with platform-specific handling
- **Maintainable architecture** using established patterns
- **User-friendly setup** with detection and guidance

This approach ensures our Claude Code integration works optimally while remaining accessible to users who don't want to install Python dependencies.