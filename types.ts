export enum RunMode {
  GPU = 'GPU',
  CPU = 'CPU'
}

export enum AppStatus {
  STOPPED = 'STOPPED',
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  STOPPING = 'STOPPING'
}

export interface LogEntry {
  id: number;
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'system';
}

export interface VersionInfo {
  id: string;        // Short hash or tag
  fullId: string;    // Full hash
  message: string;   // Commit message or release notes
  date: string;
  type: 'stable' | 'dev';
}

export interface AppSettings {
  pythonPath: string;  // Empty = use portable, otherwise custom path
  gitPath: string;     // Empty = use portable, otherwise custom path
  customArgs: string;
  useGitHubProxy: boolean;
  modelsPath?: string;  // Shared models directory path
  psPluginPath?: string; // Photoshop plugins directory path
}

export type TabView = 'dashboard' | 'console' | 'versions' | 'runninghub' | 'settings' | 'about';

// RunningHub API Configuration
export interface RunningHubConfig {
  apiKey: string;
  webappId: string;
  baseUrl?: string; // Default: https://www.runninghub.cn
}

// RunningHub workflow generation result
export interface WorkflowGenerationResult {
  success: boolean;
  workflow?: any;
  message: string;
  savedPath?: string;
}

// Define the interface for the Electron API exposed via contextBridge
declare global {
  interface Window {
    electronAPI: {
      startComfy: (settings: AppSettings, mode: RunMode) => Promise<void>;
      stopComfy: () => Promise<void>;
      openTerminal: (settings: AppSettings) => Promise<void>;
      openDirectory: (relativePath: string) => Promise<void>;
      gitCommand: (command: string, settings: AppSettings) => Promise<string>;
      openUrl: (url: string) => Promise<void>;
      selectDirectory: () => Promise<string | null>;
      selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
      createModelSymlink: (sourcePath: string) => Promise<{ success: boolean; message: string }>;
      loadSettings: () => Promise<AppSettings | null>;
      saveSettings: (settings: AppSettings) => Promise<boolean>;
      getLauncherVersion: () => Promise<{ version: string; buildDate: string }>;
      // RunningHub API
      generateRHWorkflow: (config: RunningHubConfig) => Promise<WorkflowGenerationResult>;
      saveRHWorkflow: (workflow: any, filename: string) => Promise<{ success: boolean; path?: string; message: string }>;
      loadRHConfig: () => Promise<RunningHubConfig | null>;
      saveRHConfig: (config: RunningHubConfig) => Promise<boolean>;
      getRHAccountStatus: (apiKey: string) => Promise<{ success: boolean; data?: { remainCoins: string; currentTaskCounts: string; remainMoney: string; currency: string; apiType: string }; message?: string }>;
      cancelRHTask: (apiKey: string, taskId: string) => Promise<{ success: boolean; message?: string }>;
      getRHTaskStatus: (apiKey: string, taskId: string) => Promise<{ success: boolean; code?: number; msg?: string; data?: string; message?: string }>;
      getRHTaskOutputs: (apiKey: string, taskId: string) => Promise<{ success: boolean; data?: Array<{ fileUrl: string; fileType: string; taskCostTime: string; nodeId: string; consumeCoins: string }>; message?: string }>;
      onRHTaskDetected: (callback: (event: any, taskId: string) => void) => void;
      removeRHTaskListener: (callback: (event: any, taskId: string) => void) => void;
      onLog: (callback: (event: any, log: { message: string, type: 'info' | 'error' | 'system' }) => void) => void;
      removeLogListener: (callback: (event: any, log: { message: string, type: 'info' | 'error' | 'system' }) => void) => void;
      // PS Plugin Auto-Update
      updatePSPlugin: (paths: { psPluginPath: string }) => Promise<{ success: boolean; message?: string }>;

      // Window controls
      minimizeWindow: () => Promise<void>;
      maximizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
    }
  }
}