import * as path from 'path';
import * as os from 'os';

/**
 * Get the Claude Code configuration directory path.
 * 
 * Resolution order:
 * 1. CLAUDE_CONFIG_DIR environment variable (if set)
 * 2. $XDG_CONFIG_HOME/claude or ~/.config/claude (new default since v1.0.30)
 * 3. ~/.claude (legacy location, used as fallback)
 * 
 * @returns The base Claude configuration directory path
 */
export function getClaudeConfigDir(): string {
    // 1. Check CLAUDE_CONFIG_DIR environment variable
    if (process.env.CLAUDE_CONFIG_DIR) {
        return process.env.CLAUDE_CONFIG_DIR;
    }

    const homeDir = os.homedir();
    const isWindows = process.platform === 'win32';

    // Windows-specific configuration
    if (isWindows) {
        // On Windows, use %APPDATA%\claude or %USERPROFILE%\.claude
        const appDataDir = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
        const modernConfigDir = path.join(appDataDir, 'claude');
        const legacyConfigDir = path.join(homeDir, '.claude');
        
        const fs = require('fs');
        
        try {
            // Check if modern config directory exists
            if (fs.existsSync(modernConfigDir)) {
                return modernConfigDir;
            }
            
            // Check if legacy directory exists
            if (fs.existsSync(legacyConfigDir)) {
                return legacyConfigDir;
            }
            
            // If neither exists, use the modern location
            return modernConfigDir;
        } catch (error) {
            // If we can't check file system, default to modern location
            return modernConfigDir;
        }
    }

    // Unix/macOS configuration
    // 2. Check XDG_CONFIG_HOME (or default to ~/.config)
    const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config');
    const modernConfigDir = path.join(xdgConfigHome, 'claude');

    // 3. Legacy ~/.claude directory
    const legacyConfigDir = path.join(homeDir, '.claude');

    // For now, we'll check if the modern config directory exists, otherwise fall back to legacy
    // This matches Claude Code's behavior
    const fs = require('fs');
    
    try {
        // Check if modern config directory exists
        if (fs.existsSync(modernConfigDir)) {
            return modernConfigDir;
        }
        
        // Check if legacy directory exists
        if (fs.existsSync(legacyConfigDir)) {
            return legacyConfigDir;
        }
        
        // If neither exists, use the modern location (Claude Code will create it)
        return modernConfigDir;
    } catch (error) {
        // If we can't check file system, default to modern location
        return modernConfigDir;
    }
}

/**
 * Get the Claude Code IDE directory path where lock files are stored.
 * @returns The full path to the IDE subdirectory
 */
export function getClaudeIdeDir(): string {
    return path.join(getClaudeConfigDir(), 'ide');
}