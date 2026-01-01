import { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { useConfig } from '@/components/ConfigProvider';
import { api } from '@/lib/api';
import { Save, X, RefreshCw } from 'lucide-react';

interface JsonEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'warning') => void;
}

export function JsonEditor({ open, onOpenChange, showToast }: JsonEditorProps) {
  const { config } = useConfig();
  const [jsonValue, setJsonValue] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (config && open) {
      setJsonValue(JSON.stringify(config, null, 2));
    }
  }, [config, open]);

  // Handle open/close animations
  useEffect(() => {
    if (open) {
      setIsVisible(true);
      // Trigger the animation after a small delay to ensure the element is rendered
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      // Wait for the animation to complete before hiding
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleSaveResponse = (response: unknown, successMessage: string, errorMessage: string) => {
    // Show notification based on response
    if (response && typeof response === 'object' && 'success' in response) {
      const apiResponse = response as { success: boolean; message?: string };
      if (apiResponse.success) {
        if (showToast) {
          showToast(apiResponse.message || successMessage, 'success');
        }
        return true;
      } else {
        if (showToast) {
          showToast(apiResponse.message || errorMessage, 'error');
        }
        return false;
      }
    } else {
      // Default success notification
      if (showToast) {
        showToast(successMessage, 'success');
      }
      return true;
    }
  };

  const handleSave = async () => {
    if (!jsonValue) return;
    
    try {
      setIsSaving(true);
      const parsedConfig = JSON.parse(jsonValue);
      const response = await api.updateConfig(parsedConfig);
      
      const success = handleSaveResponse(
        response,
        'Config saved successfully',
        'Failed to save config'
      );

      if (success) {
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      if (showToast) {
        showToast('Failed to save config' + ': ' + (error as Error).message, 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndRestart = async () => {
    if (!jsonValue) return;
    
    try {
      setIsSaving(true);
      const parsedConfig = JSON.parse(jsonValue);
      
      // Save config first
      const saveResponse = await api.updateConfig(parsedConfig);
      const saveSuccessful = handleSaveResponse(
        saveResponse,
        'Config saved successfully',
        'Failed to save config'
      );

      // Only restart if save was successful
      if (saveSuccessful) {
        // Restart service
        const restartResponse = await api.restartService();

        handleSaveResponse(
          restartResponse,
          'Config saved and service restarted successfully',
          'Failed to save config and restart service'
        );

        onOpenChange(false);
      }
    } catch (error) {
      console.error('Failed to save config and restart:', error);
      if (showToast) {
        showToast('Failed to save config and restart service' + ': ' + (error as Error).message, 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!isVisible && !open) {
    return null;
  }

  return (
    <>
      {(isVisible || open) && (
        <div 
          className={`fixed inset-0 z-50 transition-all duration-300 ease-out ${
            isAnimating && open ? 'bg-black/50 opacity-100' : 'bg-black/0 opacity-0 pointer-events-none'
          }`}
          onClick={() => onOpenChange(false)}
        />
      )}
      
      <div 
        ref={containerRef}
        className={`fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-white shadow-2xl transition-all duration-300 ease-out transform ${
          isAnimating && open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ 
          height: '100vh',
          maxHeight: '100vh'
        }}
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">JSON Editor</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveAndRestart}
              disabled={isSaving}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save & Restart'}
            </Button>
          </div>
        </div>
        
        <div className="flex-1 min-h-0 bg-gray-50">
          <Editor
            height="100%"
            defaultLanguage="json"
            value={jsonValue}
            onChange={(value) => setJsonValue(value || '')}
            theme="vs"
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: 'on',
              formatOnPaste: true,
              formatOnType: true,
              suggest: {
                showKeywords: true,
                showSnippets: true,
              },
            }}
          />
        </div>
      </div>
    </>
  );
}