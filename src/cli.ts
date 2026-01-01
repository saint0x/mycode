#!/usr/bin/env node
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Try to load .env from multiple locations
// 1. Current working directory
config({ path: '.env' });
// 2. HOME_DIR (~/mycode/.env)
const homeDirEnv = join(homedir(), 'mycode', '.env');
if (existsSync(homeDirEnv)) {
  config({ path: homeDirEnv, override: false }); // Don't override already loaded vars
}

import { run } from "./index";
import { showStatus } from "./utils/status";
import { executeCodeCommand } from "./utils/codeCommand";
import { parseStatusLineData, type StatusLineInput } from "./utils/statusline";
import {
  cleanupPidFile,
  isServiceRunning,
  getServiceInfo,
} from "./utils/processCheck";
import { runModelSelector } from "./utils/modelSelector"; // ADD THIS LINE
import { activateCommand } from "./utils/activateCommand";
import { version } from "../package.json";
import { spawn, exec } from "child_process";
import { PID_FILE, REFERENCE_COUNT_FILE, CONFIG_FILE } from "./constants";
import fs, { existsSync, readFileSync } from "fs";
import { join } from "path";
import { migrateFromLegacy, detectLegacyConfig, detectNewConfig } from "./utils/migration";

const command = process.argv[2];

console.log(`[DEBUG CLI] Command received: ${command || '(none)'}`);

const HELP_TEXT = `
Usage: mycode [command]  (or: mc [command])

Commands:
  start         Start server
  stop          Stop server
  restart       Restart server
  status        Show server status
  statusline    Integrated statusline
  code          Execute claude command
  model         Interactive model selection and configuration
  tui           Launch full-screen terminal UI
  activate      Output environment variables for shell integration
  migrate       Migrate config from legacy location
  ui            Open the web UI in browser
  -v, version   Show version information
  -h, help      Show help information

Example:
  mycode start
  mycode code "Write a Hello World"
  mc model
  mc tui
  eval "$(mycode activate)"  # Set environment variables globally
  mc ui
`;

async function waitForService(
  timeout = 15000,  // Increased to 15 seconds
  initialDelay = 2000  // Increased to 2 seconds for initialization
): Promise<boolean> {
  console.log(`[DEBUG] Waiting for service to start (timeout: ${timeout}ms, initial delay: ${initialDelay}ms)...`);

  // Wait for an initial period to let the service initialize
  // This allows time for directory setup, config loading, memory service init, etc.
  await new Promise((resolve) => setTimeout(resolve, initialDelay));

  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < timeout) {
    attempts++;
    console.log(`[DEBUG] Service check attempt ${attempts}...`);

    const isRunning = await isServiceRunning();

    if (isRunning) {
      const elapsed = Date.now() - startTime + initialDelay;
      console.log(`[DEBUG] Service detected as running after ${attempts} attempts (${elapsed}ms total)`);
      // Wait for an additional short period to ensure service is fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    }

    // Poll every 500ms (more reasonable than 100ms)
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const totalTime = Date.now() - startTime + initialDelay;
  console.log(`[DEBUG] Service wait timeout after ${attempts} attempts (${totalTime}ms total)`);
  return false;
}

async function main() {
  console.log("[DEBUG CLI] Entering main() function");
  console.log("[DEBUG CLI] Checking if service is running...");
  const isRunning = await isServiceRunning()
  console.log(`[DEBUG CLI] Service running: ${isRunning}`);

  switch (command) {
    case "start":
      console.log("[DEBUG CLI] Executing 'start' command...");
      await run();
      console.log("[DEBUG CLI] run() function completed");
      break;
    case "stop":
      try {
        const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
        process.kill(pid);
        cleanupPidFile();
        if (existsSync(REFERENCE_COUNT_FILE)) {
          try {
            fs.unlinkSync(REFERENCE_COUNT_FILE);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        console.log(
          "claude code router service has been successfully stopped."
        );
      } catch (e) {
        console.log(
          "Failed to stop the service. It may have already been stopped."
        );
        cleanupPidFile();
      }
      break;
    case "status":
      await showStatus();
      break;
    case "statusline":
      // Read JSON input from stdin
      let inputData = "";
      process.stdin.setEncoding("utf-8");
      process.stdin.on("readable", () => {
        let chunk;
        while ((chunk = process.stdin.read()) !== null) {
          inputData += chunk;
        }
      });

      process.stdin.on("end", async () => {
        try {
          const input: StatusLineInput = JSON.parse(inputData);
          const statusLine = await parseStatusLineData(input);
          console.log(statusLine);
        } catch (error) {
          console.error("Error parsing status line data:", error);
          process.exit(1);
        }
      });
      break;
    // ADD THIS CASE
    case "model":
      await runModelSelector();
      break;
    case "tui":
      // Run TUI in a separate Bun process with the SolidJS plugin loaded
      const tuiArgs = process.argv.slice(3);
      const tuiRunnerPath = join(__dirname, "..", "src", "tui", "run.ts");

      const tuiProcess = spawn("bun", ["run", tuiRunnerPath, ...tuiArgs], {
        stdio: "inherit",
        cwd: process.cwd()
      });

      tuiProcess.on("exit", (code) => {
        process.exit(code || 0);
      });

      // Wait for the process to complete
      await new Promise((resolve) => {
        tuiProcess.on("close", resolve);
      });
      break;
    case "activate":
    case "env":
      await activateCommand();
      break;
    case "code":
      console.log("[DEBUG CLI] Executing 'code' command...");
      if (!isRunning) {
        console.log("Service not running, starting service...");
        const cliPath = join(__dirname, "cli.js");
        console.log(`[DEBUG CLI] Spawning start process: node ${cliPath} start`);
        console.log(`[DEBUG CLI] Child process will run in background (logs: ~/mycode/logs/)`);
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: "ignore",  // Background process should not inherit parent's stdio
        });

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", error.message);
          process.exit(1);
        });

        startProcess.unref();
        console.log("[DEBUG CLI] Waiting for service to start...");

        if (await waitForService()) {
          console.log("[DEBUG CLI] Service started successfully!");
          console.log("[DEBUG CLI] Executing code command...");
          // Join all code arguments into a single string to preserve spaces within quotes
          const codeArgs = process.argv.slice(3);
          executeCodeCommand(codeArgs);
        } else {
          console.error("❌ Service startup timeout after 15 seconds");
          console.error("Troubleshooting:");
          console.error("  1. Check if port is already in use: lsof -i :3456");
          console.error("  2. Check logs: tail -f ~/mycode/logs/ccr-*.log");
          console.error("  3. Try manual start: mc start");
          console.error("  4. Check config: cat ~/mycode/config.json");
          process.exit(1);
        }
      } else {
        console.log("[DEBUG CLI] Service already running, executing code command...");
        // Join all code arguments into a single string to preserve spaces within quotes
        const codeArgs = process.argv.slice(3);
        executeCodeCommand(codeArgs);
      }
      break;
    case "ui":
      // Check if service is running
      if (!isRunning) {
        console.log("Service not running, starting service...");
        const cliPath = join(__dirname, "cli.js");
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: "ignore",
        });

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", error.message);
          process.exit(1);
        });

        startProcess.unref();

        if (!(await waitForService())) {
          // If service startup fails, try to start with default config
          console.log(
            "Service startup timeout, trying to start with default configuration..."
          );
          const {
            initDir,
            writeConfigFile,
            backupConfigFile,
          } = require("./utils");

          try {
            // Initialize directories
            await initDir();

            // Backup existing config file if it exists
            const backupPath = await backupConfigFile();
            if (backupPath) {
              console.log(
                `Backed up existing configuration file to ${backupPath}`
              );
            }

            // Create a minimal default config file
            await writeConfigFile({
              PORT: 3456,
              Providers: [],
              Router: {},
            });
            console.log(
              `Created minimal default configuration file at ${CONFIG_FILE}`
            );
            console.log(
              "Please edit this file with your actual configuration."
            );

            // Try starting the service again
            const restartProcess = spawn("node", [cliPath, "start"], {
              detached: true,
              stdio: "ignore",
            });

            restartProcess.on("error", (error) => {
              console.error(
                "Failed to start service with default config:",
                error.message
              );
              process.exit(1);
            });

            restartProcess.unref();

            if (!(await waitForService(15000))) {
              // Wait a bit longer for the first start
              console.error(
                "Service startup still failing. Please manually run `mycode start` to start the service and check the logs."
              );
              process.exit(1);
            }
          } catch (error: any) {
            console.error(
              "Failed to create default configuration:",
              error.message
            );
            process.exit(1);
          }
        }
      }

      // Get service info and open UI
      const serviceInfo = await getServiceInfo();

      // Add temporary API key as URL parameter if successfully generated
      const uiUrl = `${serviceInfo.endpoint}/ui/`;

      console.log(`Opening UI at ${uiUrl}`);

      // Open URL in browser based on platform
      const platform = process.platform;
      let openCommand = "";

      if (platform === "win32") {
        // Windows
        openCommand = `start ${uiUrl}`;
      } else if (platform === "darwin") {
        // macOS
        openCommand = `open ${uiUrl}`;
      } else if (platform === "linux") {
        // Linux
        openCommand = `xdg-open ${uiUrl}`;
      } else {
        console.error("Unsupported platform for opening browser");
        process.exit(1);
      }

      exec(openCommand, (error) => {
        if (error) {
          console.error("Failed to open browser:", error.message);
          process.exit(1);
        }
      });
      break;
    case "-v":
    case "version":
      console.log(`claude-code-router version: ${version}`);
      break;
    case "restart":
      // Stop the service if it's running
      try {
        const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
        process.kill(pid);
        cleanupPidFile();
        if (existsSync(REFERENCE_COUNT_FILE)) {
          try {
            fs.unlinkSync(REFERENCE_COUNT_FILE);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        console.log("claude code router service has been stopped.");
      } catch (e) {
        console.log("Service was not running or failed to stop.");
        cleanupPidFile();
      }

      // Start the service again in the background
      console.log("Starting claude code router service...");
      const cliPath = join(__dirname, "cli.js");
      const startProcess = spawn("node", [cliPath, "start"], {
        detached: true,
        stdio: "ignore",
      });

      startProcess.on("error", (error) => {
        console.error("Failed to start service:", error);
        process.exit(1);
      });

      startProcess.unref();
      console.log("✅ Service started successfully in the background.");
      break;
    case "-h":
    case "help":
      console.log(HELP_TEXT);
      break;
    case "migrate":
      const hasLegacy = await detectLegacyConfig();
      const hasNew = await detectNewConfig();

      if (hasNew && !hasLegacy) {
        console.log('Already using new config location. No migration needed.');
        break;
      }

      if (!hasLegacy) {
        console.log('No legacy config found. Nothing to migrate.');
        break;
      }

      console.log('Starting migration...');
      const result = await migrateFromLegacy();

      if (result.success) {
        console.log('\nMigration successful!');
        console.log(`Migrated: ${result.migrated.join(', ')}`);
        console.log(`Backup: ${result.backupPath}`);
      } else {
        console.error('\nMigration failed!');
        console.error(`Errors: ${result.errors.join(', ')}`);
      }
      break;
    default:
      console.log(HELP_TEXT);
      process.exit(1);
  }
}

main().catch(console.error);