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
  useGitHubProxy: boolean; // Deprecated, keep for migration

  // Network Settings
  useGithubMirror: boolean;
  githubMirrorUrl: string;

  usePypiMirror: boolean;
  pypiMirrorUrl: string;

  useHfMirror: boolean;
  hfMirrorUrl: string;
  modelsPath?: string;  // Shared models directory path
  psPluginPath?: string; // Legacy value retained for compatibility; not used by PS Bridge.
}

export type TabView = 'dashboard' | 'console' | 'versions' | 'settings' | 'about';

export interface PSBridgeProgress {
  stage: 'checking' | 'resolving' | 'downloading' | 'extracting' | 'dependencies' | 'validating' | 'installing' | 'complete' | 'failed';
  percent?: number;
}

export interface PSBridgeResult {
  success: boolean;
  code: string;
  message?: string;
  version?: string;
  commit?: string;
  restartRequired?: boolean;
  backupPath?: string;
  retainedPath?: string;
}

export interface PSBridgeStatus {
  state: 'notInstalled' | 'installed' | 'blocked' | 'busy';
  code: string;
  canUpdate: boolean;
  installPath: string;
  repositoryUrl: string;
  version?: string;
  commit?: string;
  message?: string;
  progress?: PSBridgeProgress;
  lastResult?: PSBridgeResult;
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
      createModelSymlink: (sourcePath: string) => Promise<{ success: boolean; message: string; error?: string }>;
      loadSettings: () => Promise<AppSettings | null>;
      saveSettings: (settings: AppSettings) => Promise<boolean>;
      getLauncherVersion: () => Promise<{ version: string; buildDate: string }>;
      onLog: (callback: (event: any, log: { message: string, type: 'info' | 'error' | 'system' }) => void) => void;
      removeLogListener: (callback: (event: any, log: { message: string, type: 'info' | 'error' | 'system' }) => void) => void;
      // PS Bridge node installation
      getPSBridgeStatus: () => Promise<PSBridgeStatus>;
      updatePSBridge: () => Promise<PSBridgeResult>;
      openPSBridgeDirectory: () => Promise<{ success: boolean; message?: string }>;
      onPSBridgeProgress: (callback: (progress: PSBridgeProgress) => void) => () => void;

      // Window controls
      minimizeWindow: () => Promise<void>;
      maximizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
    }
  }
}
