import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { validateStatusLineConfig, backupConfig, restoreConfig, createDefaultStatusLineConfig } from "@/utils/statusline";
import type { StatusLineConfig } from "@/types";

interface StatusLineImportExportProps {
  config: StatusLineConfig;
  onImport: (config: StatusLineConfig) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'warning') => void;
}

export function StatusLineImportExport({ config, onImport, onShowToast }: StatusLineImportExportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Export configuration as JSON file
  const handleExport = () => {
    try {
      // Validate configuration before export
      const validationResult = validateStatusLineConfig(config);

      if (!validationResult.isValid) {
        onShowToast("Configuration validation failed. Cannot export invalid configuration.", 'error');
        return;
      }

      const dataStr = JSON.stringify(config, null, 2);
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;

      const exportFileDefaultName = `statusline-config-${new Date().toISOString().slice(0, 10)}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      onShowToast("Configuration exported successfully", 'success');
    } catch (error) {
      console.error("Export failed:", error);
      onShowToast("Failed to export configuration", 'error');
    }
  };

  // Import configuration from JSON file
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedConfig = JSON.parse(content) as StatusLineConfig;

        // Validate imported configuration
        const validationResult = validateStatusLineConfig(importedConfig);

        if (!validationResult.isValid) {
          // Format error messages
          const errorMessages = validationResult.errors.map(error =>
            error.message
          ).join('; ');
          throw new Error(`Invalid configuration: ${errorMessages}`);
        }

        onImport(importedConfig);
        onShowToast("Configuration imported successfully", 'success');
      } catch (error) {
        console.error("Import failed:", error);
        onShowToast("Failed to import configuration" + (error instanceof Error ? `: ${error.message}` : ""), 'error');
      } finally {
        setIsImporting(false);
        // Reset file input so the same file can be selected again
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };

    reader.onerror = () => {
      onShowToast("Failed to import configuration", 'error');
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };

    reader.readAsText(file);
  };

  // Download configuration template
  const handleDownloadTemplate = () => {
    try {
      // Use the new default configuration function
      const templateConfig = createDefaultStatusLineConfig();

      const dataStr = JSON.stringify(templateConfig, null, 2);
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;

      const templateFileName = "statusline-config-template.json";

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', templateFileName);
      linkElement.click();

      onShowToast("Template downloaded successfully", 'success');
    } catch (error) {
      console.error("Template download failed:", error);
      onShowToast("Failed to download template", 'error');
    }
  };

  // Configuration backup functionality
  const handleBackup = () => {
    try {
      const backupStr = backupConfig(config);
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(backupStr)}`;

      const backupFileName = `statusline-backup-${new Date().toISOString().slice(0, 10)}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', backupFileName);
      linkElement.click();

      onShowToast("Configuration backup created successfully", 'success');
    } catch (error) {
      console.error("Backup failed:", error);
      onShowToast("Failed to create backup", 'error');
    }
  };

  // Configuration restore functionality
  const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const restoredConfig = restoreConfig(content);

        if (!restoredConfig) {
          throw new Error("Invalid backup file format");
        }

        // Validate restored configuration
        const validationResult = validateStatusLineConfig(restoredConfig);

        if (!validationResult.isValid) {
          // Format error messages
          const errorMessages = validationResult.errors.map(error =>
            error.message
          ).join('; ');
          throw new Error(`Invalid configuration: ${errorMessages}`);
        }

        onImport(restoredConfig);
        onShowToast("Configuration restored successfully", 'success');
      } catch (error) {
        console.error("Restore failed:", error);
        onShowToast("Failed to restore configuration" + (error instanceof Error ? `: ${error.message}` : ""), 'error');
      } finally {
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };

    reader.onerror = () => {
      onShowToast("Failed to restore configuration", 'error');
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };

    reader.readAsText(file);
  };

  // Removed local validation function since we now use the validation function from utils

  return (
    <Card className="transition-all hover:shadow-md">
      <CardHeader className="p-4">
        <CardTitle className="text-lg flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Import / Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={handleExport}
              variant="outline"
              className="transition-all hover:scale-105"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export
            </Button>

            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              disabled={isImporting}
              className="transition-all hover:scale-105"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Import
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={handleBackup}
              variant="outline"
              className="transition-all hover:scale-105"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              Backup
            </Button>

            <Button
              onClick={() => {
                // Create a hidden file input for restore
                const restoreInput = document.createElement('input');
                restoreInput.type = 'file';
                restoreInput.accept = '.json';
                restoreInput.onchange = (e) => handleRestore(e as any);
                restoreInput.click();
              }}
              variant="outline"
              className="transition-all hover:scale-105"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4M17 9l-5 5-5-5M12 12.8V2.5"/>
              </svg>
              Restore
            </Button>
          </div>

          <Button
            onClick={handleDownloadTemplate}
            variant="outline"
            className="transition-all hover:scale-105 sm:col-span-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            Download Template
          </Button>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImport}
          accept=".json"
          className="hidden"
        />

        <div className="p-3 bg-secondary/50 rounded-md">
          <div className="flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mt-0.5 flex-shrink-0">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <div>
              <p className="text-xs text-muted-foreground">
                Export: Download current configuration. Import: Load a previously saved configuration file. Backup: Create a timestamped backup. Restore: Load configuration from backup file. Download Template: Get a template configuration with default values.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
