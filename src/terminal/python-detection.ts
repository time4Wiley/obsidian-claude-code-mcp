import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface PythonInfo {
  executable: string;
  version: string;
  available: boolean;
}

export async function detectPython(): Promise<PythonInfo | null> {
  const candidates = [
    "python3",
    "python", 
    "/usr/bin/python3",
    "/usr/local/bin/python3",
    "/opt/homebrew/bin/python3"
  ];
  
  for (const python of candidates) {
    try {
      const result = await execAsync(`${python} --version`);
      const versionMatch = result.stdout.match(/Python (\d+\.\d+\.\d+)/);
      
      if (versionMatch) {
        const version = versionMatch[1];
        const [major, minor] = version.split('.').map(Number);
        
        // Require Python 3.7+ for compatibility
        if (major >= 3 && minor >= 7) {
          console.debug(`[Terminal] Found Python: ${python} ${version}`);
          return {
            executable: python,
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
  // For Unix systems, we only need the standard library (pty, selectors, etc.)
  // These are built-in, so we just check if Python runs
  try {
    const result = await execAsync(`${pythonExecutable} -c "import pty, selectors, sys; print('OK')"`);
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