import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface PythonInfo {
  executable: string;
  version: string;
  available: boolean;
}

export async function detectPython(): Promise<PythonInfo | null> {
  const isWindows = process.platform === "win32";
  
  const candidates = isWindows ? [
    "python",
    "python3",
    "py -3",
    "C:\\Python311\\python.exe",
    "C:\\Python310\\python.exe",
    "C:\\Python39\\python.exe",
    "C:\\Python38\\python.exe",
    "%LOCALAPPDATA%\\Programs\\Python\\Python311\\python.exe",
    "%LOCALAPPDATA%\\Programs\\Python\\Python310\\python.exe",
    "%LOCALAPPDATA%\\Programs\\Python\\Python39\\python.exe"
  ] : [
    "python3",
    "python", 
    "/usr/bin/python3",
    "/usr/local/bin/python3",
    "/opt/homebrew/bin/python3"
  ];
  
  for (const python of candidates) {
    try {
      // Expand environment variables on Windows
      const expandedPath = isWindows && python.includes('%') 
        ? python.replace(/%([^%]+)%/g, (_, envVar) => process.env[envVar] || '')
        : python;
      
      const result = await execAsync(`"${expandedPath}" --version`);
      const versionMatch = (result.stdout || result.stderr).match(/Python (\d+\.\d+\.\d+)/);
      
      if (versionMatch) {
        const version = versionMatch[1];
        const [major, minor] = version.split('.').map(Number);
        
        // Require Python 3.7+ for compatibility
        if (major >= 3 && minor >= 7) {
          console.debug(`[Terminal] Found Python: ${expandedPath} ${version}`);
          return {
            executable: expandedPath,
            version,
            available: true
          };
        }
      }
    } catch (error) {
      // Python executable not found or failed to run
      console.debug(`[Terminal] Python candidate ${python} not available:`, error);
    }
  }
  
  console.warn("[Terminal] No suitable Python installation found");
  return null;
}

export async function checkPythonDependencies(pythonExecutable: string): Promise<boolean> {
  const isWindows = process.platform === "win32";
  
  try {
    // Windows doesn't have pty module, but has built-in subprocess
    const checkCommand = isWindows
      ? `"${pythonExecutable}" -c "import subprocess, sys; print('OK')"`
      : `"${pythonExecutable}" -c "import pty, selectors, sys; print('OK')"`;
    
    const result = await execAsync(checkCommand);
    return result.stdout.trim() === "OK";
  } catch (error) {
    console.warn("[Terminal] Python dependencies check failed:", error);
    return false;
  }
}

export class PythonManager {
  private pythonInfo: PythonInfo | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      this.pythonInfo = await detectPython();
      
      if (this.pythonInfo) {
        const depsOk = await checkPythonDependencies(this.pythonInfo.executable);
        if (!depsOk) {
          console.warn("[Terminal] Python dependencies not available");
          this.pythonInfo = null;
        }
      }
    } catch (error) {
      console.error("[Terminal] Python detection failed:", error);
      this.pythonInfo = null;
    } finally {
      this.initialized = true;
    }
  }

  getPythonInfo(): PythonInfo | null {
    return this.pythonInfo;
  }

  isAvailable(): boolean {
    return this.pythonInfo?.available ?? false;
  }

  getExecutable(): string | undefined {
    return this.pythonInfo?.executable;
  }
}