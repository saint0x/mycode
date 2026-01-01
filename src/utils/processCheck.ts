import { existsSync, readFileSync, writeFileSync } from 'fs';
import { PID_FILE, REFERENCE_COUNT_FILE } from '../constants';
import { readConfigFile } from '.';
import find from 'find-process';
import { execSync } from 'child_process'; // Import execSync to execute commands

export async function isProcessRunning(pid: number): Promise<boolean> {
    try {
        const processes = await find('pid', pid);
        return processes.length > 0;
    } catch (error) {
        return false;
    }
}

export function incrementReferenceCount() {
    let count = 0;
    if (existsSync(REFERENCE_COUNT_FILE)) {
        count = parseInt(readFileSync(REFERENCE_COUNT_FILE, 'utf-8')) || 0;
    }
    count++;
    writeFileSync(REFERENCE_COUNT_FILE, count.toString());
}

export function decrementReferenceCount() {
    let count = 0;
    if (existsSync(REFERENCE_COUNT_FILE)) {
        count = parseInt(readFileSync(REFERENCE_COUNT_FILE, 'utf-8')) || 0;
    }
    count = Math.max(0, count - 1);
    writeFileSync(REFERENCE_COUNT_FILE, count.toString());
}

export function getReferenceCount(): number {
    if (!existsSync(REFERENCE_COUNT_FILE)) {
        return 0;
    }
    return parseInt(readFileSync(REFERENCE_COUNT_FILE, 'utf-8')) || 0;
}

/**
 * Get the configured service port, with fallback to default
 */
export async function getServicePort(): Promise<number> {
    try {
        const config = await readConfigFile();
        return config.PORT || 3456;
    } catch {
        // If config file doesn't exist or fails to read, use default port
        return 3456;
    }
}

/**
 * Check if service is running and ready to accept connections
 * Uses three-step verification:
 * 1. PID file exists
 * 2. Process with that PID exists
 * 3. Health endpoint responds (server is ready)
 */
export async function isServiceRunning(): Promise<boolean> {
    console.log("[DEBUG] Checking if service is running...");

    // Check 1: PID file exists
    if (!existsSync(PID_FILE)) {
        console.log("[DEBUG] PID file not found");
        return false;
    }

    let pid: number;
    try {
        const pidStr = readFileSync(PID_FILE, 'utf-8');
        pid = parseInt(pidStr, 10);
        if (isNaN(pid)) {
            console.log("[DEBUG] PID file content is invalid");
            cleanupPidFile();
            return false;
        }
        console.log(`[DEBUG] Found PID: ${pid}`);
    } catch (e) {
        console.log("[DEBUG] Failed to read PID file");
        return false;
    }

    // Check 2: Process exists
    try {
        if (process.platform === 'win32') {
            // Windows platform logic
            const command = `tasklist /FI "PID eq ${pid}"`;
            const output = execSync(command, { stdio: 'pipe' }).toString();

            if (!output.includes(pid.toString())) {
                console.log("[DEBUG] Process not found (Windows)");
                cleanupPidFile();
                return false;
            }
        } else {
            // Linux, macOS and other platforms logic
            // Use signal 0 to check if process exists (doesn't actually kill the process)
            process.kill(pid, 0);
        }
        console.log("[DEBUG] Process exists");
    } catch (e) {
        console.log("[DEBUG] Process not found");
        cleanupPidFile();
        return false;
    }

    // Check 3: Health endpoint responds (server is fully ready)
    try {
        const port = await getServicePort();
        const healthUrl = `http://127.0.0.1:${port}/health`;
        console.log(`[DEBUG] Checking health endpoint: ${healthUrl}`);

        const response = await fetch(healthUrl, {
            signal: AbortSignal.timeout(5000) // 5 second timeout - allows for server startup
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`[DEBUG] Health check passed: ${JSON.stringify(data)}`);
            return true;
        } else {
            console.log(`[DEBUG] Health check failed: ${response.status}`);
            return false;
        }
    } catch (err: any) {
        console.log(`[DEBUG] Health check error: ${err.message}`);
        // Process exists but server not ready yet - this is expected during startup
        return false;
    }
}

export function savePid(pid: number) {
    writeFileSync(PID_FILE, pid.toString());
}

export function cleanupPidFile() {
    if (existsSync(PID_FILE)) {
        try {
            const fs = require('fs');
            fs.unlinkSync(PID_FILE);
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

export function getServicePid(): number | null {
    if (!existsSync(PID_FILE)) {
        return null;
    }

    try {
        const pid = parseInt(readFileSync(PID_FILE, 'utf-8'));
        return isNaN(pid) ? null : pid;
    } catch (e) {
        return null;
    }
}

export async function getServiceInfo() {
    const pid = getServicePid();
    const running = await isServiceRunning();
    const config = await readConfigFile();
    const port = config.PORT || 3456;

    return {
        running,
        pid,
        port,
        endpoint: `http://127.0.0.1:${port}`,
        pidFile: PID_FILE,
        referenceCount: getReferenceCount()
    };
}
