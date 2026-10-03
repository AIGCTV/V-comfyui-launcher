const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, exec, execFile } = require('child_process');

// Import license and update services (reserved interfaces for future expansion)
const licenseService = require('./license-service.cjs');
const updateService = require('./update-service.cjs');

/**
 * Get the launcher directory path
 * - Development: launcher/electron -> launcher
 * - Packaged NSIS: win-unpacked/resources -> win-unpacked (use process.resourcesPath)
 * - Packaged Portable: uses PORTABLE_EXECUTABLE_DIR environment variable
 */
function getLauncherDir() {
  if (app.isPackaged) {
    // For portable exe, Electron sets PORTABLE_EXECUTABLE_DIR to the actual exe location
    // This is more reliable than app.getPath('exe') which can return the temp extraction path
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    if (portableDir) {
      console.log('[Path] Using PORTABLE_EXECUTABLE_DIR:', portableDir);
      return portableDir;
    }

    // Fallback for NSIS installer or if PORTABLE_EXECUTABLE_DIR is not set
    const exePath = app.getPath('exe');
    console.log('[Path] Using exe path:', path.dirname(exePath));
    return path.dirname(exePath);
  } else {
    // In development, __dirname is launcher/electron
    return path.join(__dirname, '..');
  }
}


// 缓存 ComfyUI 目录路径，避免重复检测和日志输出
let _cachedComfyDir = null;

/**
 * Get the ComfyUI_windows_portable root directory
 * Auto-detect whether exe is in root directory or launcher subdirectory
 * - If exe is in launcher subdir: launcher -> ComfyUI_windows_portable
 * - If exe is in root directory: ComfyUI_windows_portable (same as getLauncherDir)
 * 
 * 使用缓存机制，只在首次调用时执行检测
 */
function getComfyDir() {
  // 如果已缓存，直接返回
  if (_cachedComfyDir) {
    return _cachedComfyDir;
  }

  const fs = require('fs');
  const launcherDir = getLauncherDir();
  const parentDir = path.dirname(launcherDir);

  console.log('[Path] Detecting ComfyUI location...');
  console.log('[Path] Launcher dir:', launcherDir);
  console.log('[Path] Parent dir:', parentDir);

  // Check if we're in a "launcher" subdirectory by looking for ComfyUI folder
  const comfyUIInParent = path.join(parentDir, 'ComfyUI');
  const comfyUIInCurrent = path.join(launcherDir, 'ComfyUI');

  // If ComfyUI exists in parent directory, we're in launcher subdir
  if (fs.existsSync(comfyUIInParent)) {
    console.log('[Path] Found ComfyUI in parent dir, using:', parentDir);
    _cachedComfyDir = parentDir;
    return _cachedComfyDir;
  }

  // If ComfyUI exists in current directory, exe is in root
  if (fs.existsSync(comfyUIInCurrent)) {
    console.log('[Path] Found ComfyUI in current dir, using:', launcherDir);
    _cachedComfyDir = launcherDir;
    return _cachedComfyDir;
  }

  // Fallback: assume launcher subdir structure
  console.warn('[Path] Could not detect ComfyUI location, assuming launcher subdirectory structure');
  _cachedComfyDir = parentDir;
  return _cachedComfyDir;
}

// Keep a global reference of the window object and ComfyUI process
let mainWindow;
let comfyProcess = null;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    backgroundColor: '#0a0e1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: path.join(__dirname, '../public/icon.ico'),
    title: 'AIGCTV启动器'
  });

  // Load the app
  // Use app.isPackaged to detect if running from packaged app (more reliable than NODE_ENV)
  const isDev = !app.isPackaged;

  console.log('[Main] isDev:', isDev);
  console.log('[Main] __dirname:', __dirname);

  if (isDev) {
    // Development mode: load from Vite dev server
    const devServerUrl = 'http://127.0.0.1:5174';

    mainWindow.loadURL(devServerUrl).catch(err => {
      console.error('Failed to load dev server:', err);
      console.log('Make sure Vite dev server is running at http://127.0.0.1:5174');
    });

    // Open DevTools in development (disabled - use Ctrl+Shift+I to open manually)
    // mainWindow.webContents.openDevTools();
  } else {
    // Production mode: load from built files
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log('[Main] Loading production file:', indexPath);
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('[Main] Failed to load index.html:', err);
    });
  }

  // Finish the node transaction before allowing the launcher window to close.
  mainWindow.on('close', event => {
    if (psBridgeService.isBusy()) {
      event.preventDefault();
      sendLog('PS Bridge 节点正在安装或更新，请等待完成后再关闭启动器。', 'system');
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    // Kill ComfyUI process if running (but NOT browser)
    if (comfyProcess) {
      console.log('Window closing, killing ComfyUI process...');
      const pid = comfyProcess.pid;

      if (process.platform === 'win32') {
        // Kill ONLY the specific python process, NOT the entire tree (which could include browser)
        try {
          // First kill just this process (no /t flag to avoid killing browser)
          exec(`taskkill /pid ${pid} /f`, (error) => {
            if (error) console.error('Failed to kill on close:', error);
          });

          // Cleanup related Python processes by command line filter
          setTimeout(() => {
            const comfyDir = getComfyDir();
            exec(`wmic process where "name='python.exe' and commandline like '%${comfyDir.replace(/\\/g, '\\\\')}%'" delete`, () => { });
          }, 500);
        } catch (e) {
          console.error('Cleanup error:', e);
        }
      } else {
        comfyProcess.kill('SIGKILL');
      }

      comfyProcess = null;
    }
    mainWindow = null;
  });

  // Handle navigation errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  // Handle external links - open in system default browser
  const { shell } = require('electron');

  // Handle window.open() and target="_blank" links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[Main] External link clicked:', url);
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' }; // Prevent Electron from opening new window
  });

  // Handle navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow navigation to dev server or local files
    if ((isDev && new URL(url).origin === 'http://127.0.0.1:5174') || url.startsWith('file://')) {
      return;
    }
    // Open external URLs in default browser
    if (url.startsWith('http://') || url.startsWith('https://')) {
      console.log('[Main] Navigating to external URL:', url);
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

// Window control handlers
ipcMain.handle('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('close-window', () => {
  if (mainWindow) mainWindow.close();
});

// Select directory dialog
ipcMain.handle('select-directory', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Select file dialog
ipcMain.handle('select-file', async (event, filters) => {
  const { dialog } = require('electron');
  const options = {
    properties: ['openFile']
  };
  if (filters && filters.length > 0) {
    options.filters = filters;
  }
  const result = await dialog.showOpenDialog(mainWindow, options);
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// IPC Handlers

// Start ComfyUI
ipcMain.handle('start-comfy', async (event, settings, mode) => {
  if (await psBridgeService.isInstalling()) {
    throw new Error('PS Bridge 节点正在安装或更新，请等待完成后再启动 ComfyUI。');
  }
  if (comfyProcess) {
    sendLog('ComfyUI 已在运行中', 'error');
    return;
  }

  try {
    // Get ComfyUI_windows_portable root directory
    const comfyDir = getComfyDir();
    const fs = require('fs');
    const configPath = path.join(getLauncherDir(), 'launcher-settings.json');

    // Determine Python path: empty = use portable, otherwise custom
    // Determine Python and Git paths
    let pythonPath;
    let customPythonPath = '';
    let customGitPath = ''; // Added: Read git path

    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        customPythonPath = config.pythonPath || '';
        customGitPath = config.gitPath || ''; // Added: Read from config
      }
    } catch (e) {
      console.error('Failed to load options from config:', e);
    }

    if (!customPythonPath) {
      // Empty path = use portable python
      pythonPath = path.join(comfyDir, 'python_embeded', 'python.exe');
      sendLog('使用便携包内置 Python', 'info');
    } else {
      // Custom python path provided
      pythonPath = customPythonPath;
      sendLog(`使用自定义 Python: ${pythonPath}`, 'info');
    }

    // Determine Git executable path
    let gitExePath;
    if (!customGitPath) {
      // Use portable git
      gitExePath = path.join(comfyDir, 'git', 'cmd', 'git.exe');
      // Only log if we are reasonably sure it exists or if we want to confirm default behavior
      // sendLog(`使用便携包内置 Git: ${gitExePath}`, 'info');
    } else {
      gitExePath = customGitPath;
      sendLog(`使用自定义 Git: ${gitExePath}`, 'info');
    }

    const mainPyPath = path.join(comfyDir, 'ComfyUI', 'main.py');

    sendLog(`正在启动 ComfyUI (${mode.toUpperCase()} 模式)...`, 'system');
    sendLog(`工作目录: ${comfyDir}`, 'info');

    // Build command arguments
    // Base args: -s main.py --windows-standalone-build
    let args = ['-s', mainPyPath, '--windows-standalone-build'];

    // Add CPU mode flag if needed
    if (mode.toLowerCase() === 'cpu') {
      args.push('--cpu');
      sendLog('模式: CPU (添加 --cpu 参数)', 'info');
    }

    // Load saved settings to get customArgs
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.customArgs && config.customArgs.trim()) {
          // Split customArgs by space and add each as separate argument
          const customArgsList = config.customArgs.trim().split(/\s+/);
          args = args.concat(customArgsList);
          sendLog(`自定义参数: ${config.customArgs.trim()}`, 'info');
        }
      }
    } catch (e) {
      console.error('Failed to load customArgs:', e);
    }

    sendLog(`完整命令: ${pythonPath} ${args.join(' ')}`, 'info');

    // Prepare environment variables
    const typeEnv = {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      // CRITICAL: Tell gitpython where to find git
      GIT_PYTHON_GIT_EXECUTABLE: gitExePath
    };

    // Also update PATH to include the git directory so 'git' command works in subprocesses
    if (gitExePath) {
      const gitDir = path.dirname(gitExePath); // e.g. .../git/cmd
      // Prepend to PATH
      typeEnv.PATH = `${gitDir};${typeEnv.PATH || ''}`;
    }

    // Inject Network Mirrors
    // Inject Network Mirrors (Robust)
    const pypiUrl = settings.pypiMirrorUrl || 'https://pypi.tuna.tsinghua.edu.cn/simple';
    if (settings.usePypiMirror) {
      typeEnv['PIP_INDEX_URL'] = pypiUrl;
      sendLog(`[Env] 注入 PIP_INDEX_URL: ${pypiUrl}`, 'info');
    }
    const hfUrl = settings.hfMirrorUrl || 'https://hf-mirror.com';
    if (settings.useHfMirror) {
      typeEnv['HF_ENDPOINT'] = hfUrl;
      sendLog(`[Env] 注入 HF_ENDPOINT: ${hfUrl}`, 'info');
    }

    // Spawn Python directly with UTF-8 encoding environment
    comfyProcess = spawn(pythonPath, args, {
      cwd: comfyDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: typeEnv
    });

    // Session-based deduplication: track all messages sent during this ComfyUI session
    // This prevents duplicates regardless of timing (ComfyUI outputs VRAM info twice during startup)
    const sentMessages = new Set();

    const sendDedupedLog = (message, type) => {
      // Skip if this exact message was already sent in this session
      if (sentMessages.has(message)) {
        return;
      }

      sentMessages.add(message);
      sendLog(message, type);

    };

    // Handle stdout
    comfyProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        const message = line.trim();
        if (message) {
          sendDedupedLog(message, 'info');
        }
      });
    });

    // Handle stderr
    comfyProcess.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        const message = line.trim();
        if (message) {
          sendDedupedLog(message, 'info');  // Changed from 'error' to 'info' for proper deduplication
        }
      });
    });

    // Handle process exit
    comfyProcess.on('close', (code) => {
      sendLog(`ComfyUI 进程已退出，退出码: ${code}`, 'system');
      comfyProcess = null;
    });

    // Handle process error
    comfyProcess.on('error', (err) => {
      sendLog(`启动失败: ${err.message}`, 'error');
      comfyProcess = null;
    });

  } catch (error) {
    sendLog(`启动出错: ${error.message}`, 'error');
    throw error;
  }
});

// Stop ComfyUI
ipcMain.handle('stop-comfy', async () => {
  if (!comfyProcess) {
    sendLog('ComfyUI 未在运行', 'error');
    return;
  }

  try {
    sendLog('正在停止 ComfyUI...', 'system');

    const pid = comfyProcess.pid;

    // Kill the ComfyUI process (but NOT browser)
    if (process.platform === 'win32') {
      // Kill ONLY the specific python process, NOT the entire tree (to avoid killing browser)
      try {
        sendLog(`终止 ComfyUI 进程 (PID: ${pid})...`, 'info');
        await new Promise((resolve, reject) => {
          exec(`taskkill /pid ${pid} /f`, (error, stdout, stderr) => {
            if (error) {
              console.error('Taskkill error:', error);
              // Don't reject, continue to Python cleanup
            }
            if (stdout) console.log('Taskkill output:', stdout);
            resolve();
          });
        });
      } catch (e) {
        console.error('Failed to kill process:', e);
      }

      // Then, kill any remaining Python processes related to ComfyUI
      try {
        sendLog('清理残留 Python 进程...', 'info');
        await new Promise((resolve) => {
          // Kill python processes in ComfyUI directory
          exec('taskkill /f /im python.exe /fi "WINDOWTITLE eq *ComfyUI*"', (error) => {
            // Ignore errors, process might not exist
            resolve();
          });
        });

        // Also try to kill python_embeded processes
        await new Promise((resolve) => {
          const comfyDir = getComfyDir();
          exec(`wmic process where "name='python.exe' and commandline like '%${comfyDir.replace(/\\/g, '\\\\')}%'" delete`, (error) => {
            // Ignore errors
            resolve();
          });
        });
      } catch (e) {
        console.error('Failed to cleanup Python processes:', e);
      }
    } else {
      // Unix-like systems
      try {
        comfyProcess.kill('SIGTERM');
        // Wait a bit, then force kill if still running
        setTimeout(() => {
          try {
            process.kill(pid, 0); // Check if process still exists
            comfyProcess.kill('SIGKILL');
          } catch (e) {
            // Process already dead
          }
        }, 2000);
      } catch (e) {
        console.error('Failed to kill process:', e);
      }
    }

    comfyProcess = null;
    sendLog('ComfyUI 已停止', 'system');
    sendLog('所有相关进程已清理', 'info');
  } catch (error) {
    sendLog(`停止失败: ${error.message}`, 'error');
    comfyProcess = null; // Reset anyway
    throw error;
  }
});

// Open terminal
ipcMain.handle('open-terminal', async (event, settings) => {
  console.log('[Terminal] Opening with Settings:', JSON.stringify(settings));
  try {
    const launcherDir = getLauncherDir();
    const comfyDir = getComfyDir();
    const tempDir = app.getPath('temp');
    const batchPath = path.join(tempDir, 'launch_terminal.bat');

    let scriptContent = '@echo off\n';
    scriptContent += `title ComfyUI Terminal\n`;

    // CRITICAL: Disable Conda completely
    scriptContent += `set "CONDA_SHLVL="\n`;
    scriptContent += `set "CONDA_PROMPT_MODIFIER="\n`;
    scriptContent += `set "CONDA_EXE="\n`;
    scriptContent += `set "CONDA_PREFIX="\n`;
    scriptContent += `set "CONDA_PYTHON_EXE="\n`;
    scriptContent += `set "CONDA_DEFAULT_ENV="\n`;

    // Set up environment based on pythonPath (empty = use portable)
    const customPythonPath = settings.pythonPath || '';
    if (!customPythonPath) {
      // Empty path = use portable python
      const portablePythonDir = path.join(comfyDir, 'python_embeded');

      // Set PYTHONHOME to portable python directory
      scriptContent += `set "PYTHONHOME=${portablePythonDir}"\n`;

      // Set PATH with portable Python FIRST (highest priority)
      scriptContent += `set "PATH=${portablePythonDir};${portablePythonDir}\\Scripts;${portablePythonDir}\\Library\\bin;%SystemRoot%\\system32;%SystemRoot%;%SystemRoot%\\System32\\Wbem"\n`;

      scriptContent += `echo ========================================\n`;
      scriptContent += `echo ComfyUI Portable Environment Activated\n`;
      scriptContent += `echo ========================================\n`;
      scriptContent += `echo Python: ${portablePythonDir}\n`;
    } else {
      // Custom python path provided
      let pythonDir = customPythonPath;
      if (path.extname(customPythonPath).toLowerCase() === '.exe') {
        pythonDir = path.dirname(customPythonPath);
      }

      scriptContent += `set "PYTHONHOME=${pythonDir}"\n`;
      scriptContent += `set "PATH=${pythonDir};${pythonDir}\\Scripts;${pythonDir}\\Library\\bin;%SystemRoot%\\system32;%SystemRoot%;%SystemRoot%\\System32\\Wbem"\n`;

      scriptContent += `echo ========================================\n`;
      scriptContent += `echo Using Custom Python\n`;
      scriptContent += `echo ========================================\n`;
      scriptContent += `echo Python: ${pythonDir}\n`;
    }

    // Set up Git based on gitPath (empty = use portable)
    const customGitPath = settings.gitPath || '';
    if (!customGitPath) {
      // Empty = use portable git
      const portableGitDir = path.join(comfyDir, 'git', 'cmd');
      scriptContent += `set "PATH=%PATH%;${portableGitDir}"\n`;
      scriptContent += `echo Git: ${portableGitDir}\n`;
    } else if (customGitPath) {
      let gitDir = customGitPath;
      if (path.extname(customGitPath).toLowerCase() === '.exe') {
        gitDir = path.dirname(customGitPath);
      }
      scriptContent += `set "PATH=%PATH%;${gitDir}"\n`;
      scriptContent += `echo Git: ${gitDir}\n`;
    }

    // Inject Network Mirrors
    // Inject Network Mirrors
    const pypiUrl = settings.pypiMirrorUrl || 'https://pypi.tuna.tsinghua.edu.cn/simple';
    if (settings.usePypiMirror) {
      scriptContent += `set "PIP_INDEX_URL=${pypiUrl}"\n`;
      scriptContent += `echo [Env] PIP Mirror Activated: ${pypiUrl}\n`;
    }
    const hfUrl = settings.hfMirrorUrl || 'https://hf-mirror.com';
    if (settings.useHfMirror) {
      scriptContent += `set "HF_ENDPOINT=${hfUrl}"\n`;
      scriptContent += `echo [Env] HuggingFace Mirror Activated: ${hfUrl}\n`;
    }

    scriptContent += `echo ========================================\n`;
    scriptContent += `echo.\n`;

    // Change to ComfyUI directory
    scriptContent += `cd /d "${comfyDir}"\n`;
    scriptContent += `echo Working Directory: %CD%\n`;
    scriptContent += `echo.\n`;

    // Verify environment
    scriptContent += `python --version\n`;
    scriptContent += `python -m pip --version\n`;
    scriptContent += `git --version\n`;
    scriptContent += `echo.\n`;

    // Create doskey alias for pip
    scriptContent += `echo Creating command aliases...\n`;
    scriptContent += `doskey pip=python -m pip $*\n`;
    scriptContent += `echo.\n`;
    scriptContent += `echo ========================================\n`;
    scriptContent += `echo IMPORTANT: Use these commands:\n`;
    scriptContent += `echo   - python       (works directly)\n`;
    scriptContent += `echo   - pip          (aliased to: python -m pip)\n`;
    scriptContent += `echo   - git          (works directly)\n`;
    scriptContent += `echo ========================================\n`;
    scriptContent += `echo.\n`;

    // Stay in cmd.exe (not PowerShell to avoid profile loading)
    scriptContent += `cmd /k\n`;

    const fs = require('fs');
    fs.writeFileSync(batchPath, scriptContent);

    // Spawn the batch file in a new window using 'start'
    spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/c', batchPath], {
      detached: true,
      stdio: 'ignore'
    }).unref();

    sendLog('已打开终端窗口', 'system');
  } catch (error) {
    sendLog(`打开终端失败: ${error.message}`, 'error');
    throw error;
  }
});

// Git commands
ipcMain.handle('git-command', async (event, command, settings) => {
  return new Promise(async (resolve, reject) => {
    const fs = require('fs');
    const comfyDir = path.join(getComfyDir(), 'ComfyUI');
    const launcherDir = getLauncherDir();

    // Determine git executable path: empty = use portable, otherwise custom
    let gitExe;
    const customGitPath = settings.gitPath || '';

    if (!customGitPath) {
      // Empty path = use portable git from ComfyUI_windows_portable/git
      gitExe = path.join(getComfyDir(), 'git', 'cmd', 'git.exe');
      // console.log('[Git Command] Using portable git:', gitExe);
    } else {
      // Custom git path provided
      gitExe = customGitPath;
      // console.log('[Git Command] Using custom git:', gitExe);
    }

    const env = { ...process.env };

    // Console Spam Reduction: Only log command base, not full paths
    // console.log(`[Git Command] Executing: ${gitExe} ${command}`);
    // console.log(`[Git Command] Working directory: ${comfyDir}`);
    // console.log(`[Git Command] Proxy enabled: ${settings.useGitHubProxy || false}`);

    // Check if git.exe exists
    if (!fs.existsSync(gitExe)) {
      const errMsg = `Git 可执行文件不存在: ${gitExe}`;
      console.error(`[Git Command] ${errMsg}`);
      reject(new Error(errMsg));
      return;
    }

    // Check if working directory (ComfyUI) exists
    if (!fs.existsSync(comfyDir)) {
      const errMsg = `ComfyUI 目录不存在: ${comfyDir}`;
      console.error(`[Git Command] ${errMsg}`);
      reject(new Error(errMsg));
      return;
    }

    // If proxy is enabled and command is fetch or pull, use ghproxy URL rewrite approach
    const useGitMirror = settings.useGithubMirror || settings.useGitHubProxy;
    const gitMirrorUrl = (settings.githubMirrorUrl || 'https://ghproxy.net/').replace(/\/$/, '');
    const needsProxy = useGitMirror && (command.includes('fetch') || command.includes('pull') || command.includes('clone'));

    const runGitCommand = (args) => {
      return new Promise((res, rej) => {
        // console.log(`[Git Command] Running: ${gitExe} ${args.join(' ')}`);
        // console.log(`[Git Command] CWD: ${comfyDir}`);

        execFile(gitExe, args, {
          cwd: comfyDir,
          env: env,
          maxBuffer: 1024 * 1024 * 10
        }, (error, stdout, stderr) => {
          if (error) {
            const errorMsg = `Command failed (exit code ${error.code}): ${stderr || stdout || error.message}`;
            console.error(`[Git Command] Error: ${errorMsg}`);
            rej(new Error(errorMsg));
          } else {
            res(stdout.trim());
          }
        });
      });
    };

    try {
      if (needsProxy) {
        // Get original remote URL
        let originalUrl = '';
        try {
          originalUrl = await runGitCommand(['remote', 'get-url', 'origin']);
          // console.log(`[Git Proxy] Original URL: ${originalUrl}`);
        } catch (e) {
          // console.log(`[Git Proxy] Could not get remote URL: ${e.message}`);
        }

        // Only modify if it's a GitHub URL
        if (originalUrl && originalUrl.includes('github.com')) {
          // Create proxied URL
          const proxiedUrl = `${gitMirrorUrl}/${originalUrl}`;
          // console.log(`[Git Proxy] Setting proxied URL: ${proxiedUrl}`);

          try {
            // Temporarily change remote to proxied URL
            await runGitCommand(['remote', 'set-url', 'origin', proxiedUrl]);

            // Run the actual command
            const args = command.split(' ');
            const result = await runGitCommand(args);

            // Restore original URL
            await runGitCommand(['remote', 'set-url', 'origin', originalUrl]);
            // console.log(`[Git Proxy] Restored original URL`);

            // console.log(`[Git Command] Success: ${result.substring(0, 100)}`);
            resolve(result);
            return;
          } catch (cmdError) {
            // Restore original URL even on error
            try {
              await runGitCommand(['remote', 'set-url', 'origin', originalUrl]);
            } catch (restoreError) {
              console.error(`[Git Proxy] Failed to restore URL: ${restoreError.message}`);
            }
            throw cmdError;
          }
        }
      }

      // Non-proxy path or non-fetch commands
      const args = command.split(' ');
      const result = await runGitCommand(args);
      // console.log(`[Git Command] Success: ${result.substring(0, 100)}`);
      resolve(result);
    } catch (error) {
      console.error(`[Git Command] Error:`, error);
      reject(error);
    }
  });
});

// Open directory in file explorer
ipcMain.handle('open-directory', async (event, relativePath) => {
  try {
    const comfyDir = getComfyDir();
    const targetPath = relativePath ? path.join(comfyDir, relativePath) : comfyDir;
    const fs = require('fs');

    console.log(`Opening directory: ${targetPath}`);

    // Check if directory exists first
    if (!fs.existsSync(targetPath)) {
      sendLog(`目录不存在: ${targetPath}`, 'error');
      return;
    }

    if (process.platform === 'win32') {
      // Use explorer to open the directory
      // Note: explorer.exe often returns exit code 1 even on success, so we don't check error
      exec(`explorer "${targetPath}"`);
    } else if (process.platform === 'darwin') {
      exec(`open "${targetPath}"`);
    } else {
      exec(`xdg-open "${targetPath}"`);
    }
  } catch (error) {
    console.error('Failed to open directory:', error);
    sendLog(`打开目录失败: ${error.message}`, 'error');
    throw error;
  }
});

// Create model symlink handler
ipcMain.handle('create-model-symlink', async (event, sourcePath) => {
  const fs = require('fs');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  try {
    const comfyDir = path.join(getComfyDir(), 'ComfyUI');
    const targetPath = path.join(comfyDir, 'models');

    console.log(`[Model Symlink] Source: ${sourcePath}`);
    console.log(`[Model Symlink] Target: ${targetPath}`);

    // Check if source path exists
    if (!fs.existsSync(sourcePath)) {
      return {
        success: false,
        message: 'settings.messages.sourceDirNotExist'
      };
    }

    // Check if target already exists
    if (fs.existsSync(targetPath)) {
      // Check if it's already a symlink
      const stats = fs.lstatSync(targetPath);
      if (stats.isSymbolicLink()) {
        // Remove existing symlink
        fs.unlinkSync(targetPath);
        console.log('[Model Symlink] Removed existing symlink');
      } else {
        // It's a real directory
        return {
          success: false,
          message: 'settings.messages.targetDirExists'
        };
      }
    }

    // Create symlink using mklink
    const command = `mklink /D "${targetPath}" "${sourcePath}"`;
    console.log(`[Model Symlink] Executing: ${command}`);

    try {
      // Try standard execution first (works if Developer Mode is enabled or already Admin)
      await execAsync(command, { shell: 'cmd.exe' });
    } catch (stdErr) {
      console.log('[Model Symlink] Standard creation failed, trying elevation...');

      // Fallback to PowerShell RunAs for UAC prompt
      // We need to escape quotes for the nested command string
      // Command structure: Start-Process cmd -ArgumentList '/c mklink /D "Target" "Source"' -Verb RunAs -WindowStyle Hidden -Wait

      const psTarget = targetPath.replace(/"/g, '`"');
      const psSource = sourcePath.replace(/"/g, '`"');
      const psCommand = `Start-Process cmd -ArgumentList '/c mklink /D "${psTarget}" "${psSource}"' -Verb RunAs -WindowStyle Hidden -Wait`;

      console.log(`[Model Symlink] Elevating: ${psCommand}`);
      await execAsync(psCommand, { shell: 'powershell.exe' });
    }

    // Verify if symlink was actually created
    if (!fs.existsSync(targetPath)) {
      throw new Error('创建失败或用户取消了授权。请尝试以管理员身份运行启动器。');
    }

    sendLog(`模型映射创建成功: ${sourcePath} -> ${targetPath}`, 'system');

    return {
      success: true,
      message: 'settings.messages.symlinkCreated'
    };

  } catch (error) {
    console.error('[Model Symlink] Error:', error);
    // Decode error message if possible or provide generic advice
    const msg = error.message.includes('Command failed')
      ? '权限不足，请尝试以管理员身份运行或在弹出的窗口中允许更改'
      : error.message;

    sendLog(`模型映射创建失败: ${msg}`, 'error');

    return {
      success: false,
      message: 'settings.messages.symlinkCreateFailed',
      error: msg
    };
  }
});

// Helper function to send logs to renderer
function sendLog(message, type = 'info') {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('log', { message, type });
  }
}

// Open external URL
ipcMain.handle('open-url', async (event, url) => {
  const { shell } = require('electron');
  // Check if URL is valid to prevent security issues? 
  // For now trust the app is only opening safe links from UI.
  if (url && (url.startsWith('http') || url.startsWith('https'))) {
    await shell.openExternal(url);
  }
});

// Config persistence
const configPath = path.join(getLauncherDir(), 'launcher-settings.json');

// Default settings
const defaultSettings = {
  pythonPath: '',
  gitPath: '',
  customArgs: '',
  useGitHubProxy: false,
  modelsPath: '',
  psPluginPath: '',
  // Network Settings Defaults
  useGithubMirror: false,
  githubMirrorUrl: 'https://ghproxy.net/',
  usePypiMirror: false,
  pypiMirrorUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple',
  useHfMirror: false,
  hfMirrorUrl: 'https://hf-mirror.com'
};

// Helper: Get settings with defaults
function getSettings() {
  const fs = require('fs');
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return { ...defaultSettings, ...JSON.parse(data) };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return defaultSettings;
}

ipcMain.handle('load-settings', async () => {
  return getSettings();
});

ipcMain.handle('save-settings', async (event, settings) => {
  const fs = require('fs');
  try {
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Failed to save settings:', e);
    return false;
  }
});

// Run update script after version switch
ipcMain.handle('run-update-script', async () => {
  const fs = require('fs');
  const comfyDir = getComfyDir();
  const updateBatPath = path.join(comfyDir, 'update', 'update_comfyui.bat');

  console.log('[Update Script] Checking for:', updateBatPath);

  if (!fs.existsSync(updateBatPath)) {
    console.log('[Update Script] update_comfyui.bat not found');
    return { success: false, message: '更新脚本不存在: ' + updateBatPath };
  }

  return new Promise((resolve) => {
    console.log('[Update Script] Executing:', updateBatPath);

    // Execute the bat file and wait for completion
    const updateProcess = spawn('cmd.exe', ['/c', updateBatPath], {
      cwd: path.join(comfyDir, 'update'),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let output = '';
    let errorOutput = '';

    updateProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('[Update Script] stdout:', text.trim());
      sendLog(text.trim(), 'info');
    });

    updateProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.log('[Update Script] stderr:', text.trim());
      sendLog(text.trim(), 'error');
    });

    updateProcess.on('close', (code) => {
      console.log('[Update Script] Process exited with code:', code);
      if (code === 0) {
        sendLog('更新脚本执行完成', 'system');
        resolve({ success: true, message: '更新脚本执行成功', output });
      } else {
        sendLog(`更新脚本执行失败，退出码: ${code}`, 'error');
        resolve({ success: false, message: `更新脚本执行失败，退出码: ${code}`, error: errorOutput });
      }
    });

    updateProcess.on('error', (err) => {
      console.error('[Update Script] Error:', err);
      sendLog(`更新脚本执行出错: ${err.message}`, 'error');
      resolve({ success: false, message: err.message });
    });
  });
});

// App lifecycle
app.whenReady().then(() => {
  // Initialize license service (reserved for future use)
  try {
    licenseService.initLicenseService();
    console.log('[Main] License service initialized');
  } catch (e) {
    console.error('[Main] Failed to init license service:', e);
  }

  // Initialize update service (reserved for future use)
  try {
    updateService.initUpdateService();
    console.log('[Main] Update service initialized');
  } catch (e) {
    console.error('[Main] Failed to init update service:', e);
  }

  createWindow();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// ============================================
// License Service IPC Handlers (Reserved)
// ============================================
ipcMain.handle('license-get-machine-id', async () => {
  return licenseService.getMachineId();
});

ipcMain.handle('license-get-status', async () => {
  return licenseService.getLicenseStatus();
});

ipcMain.handle('license-activate', async (event, licenseKey) => {
  return await licenseService.activateLicense(licenseKey);
});

ipcMain.handle('license-check-feature', async (event, feature) => {
  return licenseService.hasFeatureAccess(feature);
});

// ============================================
// Update Service IPC Handlers (Reserved)
// ============================================
ipcMain.handle('update-check', async () => {
  return await updateService.checkForUpdates();
});

ipcMain.handle('update-get-status', async () => {
  return updateService.getUpdateStatus();
});

ipcMain.handle('update-get-version', async () => {
  return updateService.getCurrentVersion();
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // Kill ComfyUI process if running (but NOT browser)
  if (comfyProcess && comfyProcess.pid) {
    console.log('Window closing, killing ComfyUI process...');
    try {
      // On Windows, kill ONLY the python process, NOT the entire tree (to avoid killing browser)
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        try {
          // /F = force, /PID = process ID (NO /T flag to avoid killing browser)
          execSync(`taskkill /F /PID ${comfyProcess.pid}`, { stdio: 'ignore' });
          console.log('ComfyUI process terminated successfully');

          // Also cleanup related python processes by command line filter
          const comfyDir = getComfyDir();
          execSync(`wmic process where "name='python.exe' and commandline like '%${comfyDir.replace(/\\/g, '\\\\\\\\')}%'" delete`, { stdio: 'ignore' });
        } catch (e) {
          // Process might already be dead, ignore error
          console.log('taskkill completed (process may have already exited)');
        }
      } else {
        // On other platforms, try SIGKILL
        comfyProcess.kill('SIGKILL');
      }
    } catch (e) {
      console.log('Error killing ComfyUI process:', e);
    }
    comfyProcess = null;
  }

  // On macOS, keep app active until user quits explicitly
  if (process.platform !== 'darwin') {
    app.quit();
    // Force exit to terminate all child processes (concurrently, vite, etc.)
    setTimeout(() => {
      process.exit(0);
    }, 500);
  }
});

// Get launcher version from package.json and build-info.json
ipcMain.handle('get-launcher-version', async () => {
  try {
    const fs = require('fs');

    // Try to read build-info.json first (generated during build)
    const buildInfoPath = path.join(__dirname, '../build-info.json');
    if (fs.existsSync(buildInfoPath)) {
      const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf-8'));
      console.log('[Launcher Version] From build-info.json:', buildInfo);
      return {
        version: buildInfo.version,
        buildDate: buildInfo.buildDate
      };
    }

    // Fallback: read package.json and use file mtime
    console.log('[Launcher Version] build-info.json not found, using package.json fallback');
    const packageJsonPath = path.join(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    // Get package.json file stats for build date
    const stats = fs.statSync(packageJsonPath);
    const buildDate = stats.mtime;
    const formattedDate = buildDate.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');

    return {
      version: packageJson.version,
      buildDate: formattedDate
    };
  } catch (error) {
    console.error('Failed to read launcher version:', error);
    return {
      version: app.getVersion(),
      buildDate: ''
    };
  }
});

// PS Bridge node installation (public main source snapshots only).
const { createPSBridgeService } = require('./ps-bridge-service.cjs');
const psBridgeService = createPSBridgeService({
  getRoot: getComfyDir,
  getSettings,
  isComfyRunning: () => Boolean(comfyProcess),
  log: message => sendLog(message, 'system'),
  onProgress: progress => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('ps-bridge-progress', progress);
  },
});
ipcMain.handle('get-ps-bridge-status', () => psBridgeService.getStatus());
ipcMain.handle('update-ps-bridge', () => psBridgeService.update());
ipcMain.handle('open-ps-bridge-directory', async () => {
  try {
    const message = await require('electron').shell.openPath(await psBridgeService.directoryToOpen());
    return { success: !message, message };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// Handle app quit
app.on('before-quit', event => {
  if (psBridgeService.isBusy()) { event.preventDefault(); return; }
  if (comfyProcess) {
    comfyProcess.kill();
    comfyProcess = null;
  }
});
