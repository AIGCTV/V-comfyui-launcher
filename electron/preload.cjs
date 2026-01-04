const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    startComfy: (settings, mode) => ipcRenderer.invoke('start-comfy', settings, mode),
    stopComfy: () => ipcRenderer.invoke('stop-comfy'),
    openTerminal: (settings) => ipcRenderer.invoke('open-terminal', settings),
    openDirectory: (relativePath) => ipcRenderer.invoke('open-directory', relativePath),
    gitCommand: (command, settings) => ipcRenderer.invoke('git-command', command, settings),
    openUrl: (url) => ipcRenderer.invoke('open-url', url),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    selectFile: (filters) => ipcRenderer.invoke('select-file', filters),
    createModelSymlink: (sourcePath) => ipcRenderer.invoke('create-model-symlink', sourcePath),
    loadSettings: () => ipcRenderer.invoke('load-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    getLauncherVersion: () => ipcRenderer.invoke('get-launcher-version'),
    // RunningHub API
    generateRHWorkflow: (config) => ipcRenderer.invoke('generate-rh-workflow', config),
    saveRHWorkflow: (workflow, filename) => ipcRenderer.invoke('save-rh-workflow', workflow, filename),
    loadRHConfig: () => ipcRenderer.invoke('load-rh-config'),
    saveRHConfig: (config) => ipcRenderer.invoke('save-rh-config', config),
    getRHAccountStatus: (apiKey) => ipcRenderer.invoke('get-rh-account-status', apiKey),
    cancelRHTask: (apiKey, taskId) => ipcRenderer.invoke('cancel-rh-task', apiKey, taskId),
    getRHTaskStatus: (apiKey, taskId) => ipcRenderer.invoke('get-rh-task-status', apiKey, taskId),
    getRHTaskOutputs: (apiKey, taskId) => ipcRenderer.invoke('get-rh-task-outputs', apiKey, taskId),
    onRHTaskDetected: (callback) => ipcRenderer.on('rh-task-detected', callback),
    removeRHTaskListener: (callback) => ipcRenderer.removeListener('rh-task-detected', callback),
    onLog: (callback) => ipcRenderer.on('log', callback),
    removeLogListener: (callback) => ipcRenderer.removeListener('log', callback),
    // PS Plugin Auto-Update
    updatePSPlugin: (paths) => ipcRenderer.invoke('update-ps-plugin', paths),

    // Window Controls
    minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
    maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
    closeWindow: () => ipcRenderer.invoke('close-window'),

    // ============================================
    // License API (Reserved for future use)
    // ============================================
    licenseGetMachineId: () => ipcRenderer.invoke('license-get-machine-id'),
    licenseGetStatus: () => ipcRenderer.invoke('license-get-status'),
    licenseActivate: (licenseKey) => ipcRenderer.invoke('license-activate', licenseKey),
    licenseCheckFeature: (feature) => ipcRenderer.invoke('license-check-feature', feature),

    // ============================================
    // Update API (Reserved for future use)
    // ============================================
    updateCheck: () => ipcRenderer.invoke('update-check'),
    updateGetStatus: () => ipcRenderer.invoke('update-get-status'),
    updateGetVersion: () => ipcRenderer.invoke('update-get-version'),

    // Run update script after version switch
    runUpdateScript: () => ipcRenderer.invoke('run-update-script')
});
