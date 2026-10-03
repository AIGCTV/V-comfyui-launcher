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
    onLog: (callback) => ipcRenderer.on('log', callback),
    removeLogListener: (callback) => ipcRenderer.removeListener('log', callback),
    // PS Bridge node installation
    getPSBridgeStatus: () => ipcRenderer.invoke('get-ps-bridge-status'),
    updatePSBridge: () => ipcRenderer.invoke('update-ps-bridge'),
    openPSBridgeDirectory: () => ipcRenderer.invoke('open-ps-bridge-directory'),
    onPSBridgeProgress: (callback) => {
        const listener = (_event, progress) => callback(progress);
        ipcRenderer.on('ps-bridge-progress', listener);
        return () => ipcRenderer.removeListener('ps-bridge-progress', listener);
    },

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
