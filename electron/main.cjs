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
    const devServerUrl = 'http://localhost:5173';

    mainWindow.loadURL(devServerUrl).catch(err => {
      console.error('Failed to load dev server:', err);
      console.log('Make sure Vite dev server is running on port 5173');
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
    if (url.startsWith('http://localhost') || url.startsWith('file://')) {
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
  if (comfyProcess) {
    sendLog('ComfyUI 已在运行中', 'error');
    return;
  }

  try {
    // Get ComfyUI_windows_portable root directory
    const comfyDir = getComfyDir();
    const fs = require('fs');
    const configPath = path.join(getLauncherDir(), 'launcher-config.json');

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

    // Track last detected taskId to avoid duplicate notifications
    let lastDetectedTaskId = null;

    const sendDedupedLog = (message, type) => {
      // Skip if this exact message was already sent in this session
      if (sentMessages.has(message)) {
        return;
      }

      sentMessages.add(message);
      sendLog(message, type);

      // Detect RunningHub taskId from ComfyUI output
      // Exact patterns from logs:
      // - "taskId": "2000879469520945153",
      // - Task created, taskId: 2000879469520945153, Initial Status: RUNNING

      // Debug: Check if message contains "taskId" at all
      if (message.toLowerCase().includes('taskid')) {
        sendLog('[RH-DEBUG] 检测到taskId关键字: ' + message.substring(0, 100), 'system');
      }

      const taskIdPatterns = [
        // Strictly match "Task created" as per user request to avoid early JSON matches
        /Task created,?\s*taskId:\s*(\d{19,})/i,     // Task created, taskId: xxx
      ];

      for (const pattern of taskIdPatterns) {
        const match = message.match(pattern);
        if (match) {
          const taskId = match[1];
          sendLog('[RH-DEBUG] 正则匹配成功! TaskId: ' + taskId + ' 上一个: ' + lastDetectedTaskId, 'system');
          // Only notify if this is a NEW taskId
          if (taskId !== lastDetectedTaskId) {
            lastDetectedTaskId = taskId;
            sendLog('[RH-DEBUG] 新任务ID检测到, 发送IPC事件: ' + taskId, 'system');
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('rh-task-detected', taskId);
              sendLog('[RH-DEBUG] IPC事件发送成功!', 'system');
            } else {
              sendLog('[RH-DEBUG] 错误: mainWindow不可用!', 'error');
            }
          } else {
            sendLog('[RH-DEBUG] 相同taskId, 跳过IPC', 'system');
          }
          break;
        }
      }
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

// Update Photoshop plugin
ipcMain.handle('update-photoshop', async (event, settings) => {
  try {
    const comfyDir = getComfyDir();
    const psPluginDir = path.join(comfyDir, 'custom_nodes', 'ComfyUI-Photoshop');

    sendLog('正在更新 AIGC_PS 插件...', 'system');

    // Git pull in plugin directory
    const gitProcess = spawn('git', ['pull'], {
      cwd: psPluginDir,
      shell: true
    });

    gitProcess.stdout.on('data', (data) => {
      sendLog(data.toString().trim(), 'info');
    });

    gitProcess.stderr.on('data', (data) => {
      sendLog(data.toString().trim(), 'error');
    });

    gitProcess.on('close', (code) => {
      if (code === 0) {
        sendLog('插件更新完成', 'system');
      } else {
        sendLog('插件更新失败', 'error');
      }
    });

  } catch (error) {
    sendLog(`更新失败: ${error.message}`, 'error');
    throw error;
  }
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
const configPath = path.join(getLauncherDir(), 'launcher-config.json');

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

// RunningHub config persistence
const rhConfigPath = path.join(getLauncherDir(), 'rh-config.json');

ipcMain.handle('load-rh-config', async () => {
  const fs = require('fs');
  try {
    if (fs.existsSync(rhConfigPath)) {
      const data = fs.readFileSync(rhConfigPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load RH config:', e);
  }
  return null;
});

ipcMain.handle('save-rh-config', async (event, config) => {
  const fs = require('fs');
  try {
    fs.writeFileSync(rhConfigPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Failed to save RH config:', e);
    return false;
  }
});

// Generate RunningHub workflow
ipcMain.handle('generate-rh-workflow', async (event, config) => {
  const fs = require('fs');
  const https = require('https');
  const http = require('http');

  try {
    const { apiKey, webappId, baseUrl = 'https://www.runninghub.cn' } = config;

    console.log('[RunningHub] Generating workflow for webapp:', webappId);
    sendLog(`正在获取工作流 ${webappId} 的参数信息...`, 'system');

    // Step 1: Fetch nodeInfoList from RunningHub API
    const apiUrl = `${baseUrl}/api/webapp/apiCallDemo?apiKey=${encodeURIComponent(apiKey)}&webappId=${encodeURIComponent(webappId)}`;

    const fetchNodeInfo = () => {
      return new Promise((resolve, reject) => {
        const urlObj = new URL(apiUrl);
        const protocol = urlObj.protocol === 'https:' ? https : http;

        const req = protocol.get(apiUrl, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              resolve(result);
            } catch (e) {
              reject(new Error('解析 API 响应失败'));
            }
          });
        });

        req.on('error', (e) => reject(new Error(`API 请求失败: ${e.message}`)));
        req.setTimeout(30000, () => {
          req.destroy();
          reject(new Error('API 请求超时'));
        });
      });
    };

    const apiResponse = await fetchNodeInfo();

    if (apiResponse.code !== 0) {
      throw new Error(apiResponse.msg || '获取工作流信息失败');
    }

    const { nodeInfoList, webappName } = apiResponse.data;

    if (!nodeInfoList || nodeInfoList.length === 0) {
      throw new Error('该工作流没有可配置的参数');
    }

    console.log('[RunningHub] Fetched nodeInfoList with', nodeInfoList.length, 'parameters');
    sendLog(`找到 ${nodeInfoList.length} 个可配置参数，正在生成本地工作流...`, 'system');

    // Generate a proper UUID v4
    const crypto = require('crypto');
    const workflowId = crypto.randomUUID();

    // ========== DYNAMIC WORKFLOW GENERATION ==========
    // Analyze nodeInfoList to determine what nodes to create
    const imageFields = nodeInfoList.filter(f => f.fieldType === 'IMAGE');
    const textFields = nodeInfoList.filter(f => f.fieldName?.toLowerCase() === 'text' || f.fieldName?.toLowerCase() === 'prompt');

    // Numeric fields classification based on VALUE:
    // - Value between 0 and 1 (exclusive of 1): Float nodes
    // - Value >= 1 (integer values like 1920, 1080): Int nodes
    // - Mixed values like "2k", "4k" (number + text): String nodes
    // - Other exposed API params: Direct value fill
    // Exclude IMAGE and TEXT fields from numeric processing
    const excludedFieldTypes = ['IMAGE'];
    const excludedFieldNames = ['text', 'prompt'];

    // Helper function to check if a value is pure numeric (integer or float)
    const isPureNumeric = (value) => {
      if (typeof value !== 'string' && typeof value !== 'number') return false;
      const str = String(value).trim();
      return /^-?\d+(\.\d+)?$/.test(str);
    };

    // Helper function to check if a value is mixed (number + text, like "2k", "4k", "1080p")
    const isMixedNumericText = (value) => {
      if (typeof value !== 'string' && typeof value !== 'number') return false;
      const str = String(value).trim();
      // Match patterns like: 2k, 4k, 1080p, 720p, 8k, etc.
      return /^\d+[a-zA-Z]+$/.test(str) || /^[a-zA-Z]+\d+$/.test(str);
    };

    const potentialNumericFields = nodeInfoList.filter(f => {
      if (excludedFieldTypes.includes(f.fieldType)) return false;
      if (excludedFieldNames.includes(f.fieldName?.toLowerCase())) return false;
      return isPureNumeric(f.fieldValue);
    });

    // Float fields: 0 <= value < 1 (pure numeric only)
    const floatFields = potentialNumericFields.filter(f => {
      const val = parseFloat(f.fieldValue);
      return val >= 0 && val < 1;
    });

    // Int fields: value >= 1 (pure numeric only, including values like 1920, 1080)
    const intFields = potentialNumericFields.filter(f => {
      const val = parseFloat(f.fieldValue);
      return val >= 1;
    });

    // Mixed fields: number + text like "2k", "4k", "1080p" - use String nodes
    const mixedStringFields = nodeInfoList.filter(f => {
      if (excludedFieldTypes.includes(f.fieldType)) return false;
      if (excludedFieldNames.includes(f.fieldName?.toLowerCase())) return false;
      return isMixedNumericText(f.fieldValue);
    });

    // Direct value fields: exposed API params that don't fit above categories
    // These will have their fieldValue filled directly in RH_NodeInfoListNode
    const directValueFields = nodeInfoList.filter(f => {
      if (excludedFieldTypes.includes(f.fieldType)) return false;
      if (excludedFieldNames.includes(f.fieldName?.toLowerCase())) return false;
      // Not pure numeric and not mixed
      if (isPureNumeric(f.fieldValue)) return false;
      if (isMixedNumericText(f.fieldValue)) return false;
      // Has a fieldValue that we can use directly
      return f.fieldValue !== undefined && f.fieldValue !== null && f.fieldValue !== '';
    });

    const isDualImageMode = imageFields.length >= 2;

    console.log('[RunningHub] Field analysis:', {
      imageFields: imageFields.length,
      textFields: textFields.length,
      floatFields: floatFields.map(f => ({ name: f.fieldName, value: f.fieldValue })),
      intFields: intFields.map(f => ({ name: f.fieldName, value: f.fieldValue })),
      mixedStringFields: mixedStringFields.map(f => ({ name: f.fieldName, value: f.fieldValue })),
      directValueFields: directValueFields.map(f => ({ name: f.fieldName, value: f.fieldValue })),
      isDualImageMode
    });

    // Build workflow dynamically
    let nodeId = 1;
    let linkId = 1;
    const nodes = [];
    const links = [];
    const baseX = 50, baseY = 50, colWidth = 350;  // Increased column width
    let leftColY = baseY + 100;  // Cumulative Y for left column (input nodes)

    // ========== API-KEY Node ==========
    const apiKeyNodeId = nodeId++;
    const apiKeyLink = linkId++;
    nodes.push({
      "id": apiKeyNodeId, "type": "PrimitiveString", "pos": [baseX, baseY], "size": [300, 58],
      "flags": {}, "order": 0, "mode": 0, "inputs": [],
      "outputs": [{ "name": "STRING", "type": "STRING", "links": [apiKeyLink] }],
      "title": "API-KEY", "properties": { "Node name for S&R": "PrimitiveString" },
      "widgets_values": [apiKey], "color": "#322", "bgcolor": "#533"
    });

    // ========== RH_SettingsNode ==========
    const settingsNodeId = nodeId++;
    const settingsOutputLinks = [];
    nodes.push({
      "id": settingsNodeId, "type": "RH_SettingsNode", "pos": [baseX + colWidth, baseY], "size": [315, 106],
      "flags": {}, "order": 1, "mode": 0,
      "inputs": [{ "name": "apiKey", "type": "STRING", "widget": { "name": "apiKey" }, "link": apiKeyLink }],
      "outputs": [{ "label": "STRUCT", "name": "STRUCT", "type": "STRUCT", "links": settingsOutputLinks }],
      "properties": { "cnr_id": "ComfyUI_RH_APICall", "Node name for S&R": "RH_SettingsNode" },
      "widgets_values": [baseUrl, "", webappId]
    });
    links.push([apiKeyLink, apiKeyNodeId, 0, settingsNodeId, 0, "STRING"]);

    // ========== PS Image + Uploader Nodes ==========
    const uploaderNodes = [];
    for (let i = 0; i < imageFields.length && i < 2; i++) {
      const psNodeId = nodeId++;
      const rgbLink = linkId++;
      const title = i === 0 ? "MAIN DOC" : "IMAGE2";
      nodes.push({
        "id": psNodeId, "type": "🔹Photoshop Images", "pos": [baseX - 300, leftColY], "size": [160, 160],
        "flags": {}, "order": 2 + i, "mode": 0, "inputs": [],
        "outputs": [
          { "name": "RGB", "type": "IMAGE", "links": [rgbLink] },
          { "name": "ALPHA", "type": "MASK", "links": null },
          { "color_off": "#81c784", "color_on": "#81c784", "label": "SELECTION", "name": "SELECTION", "type": "MASK", "links": [] },
          { "name": "W", "type": "INT", "links": null }, { "name": "H", "type": "INT", "links": null }
        ],
        "title": title, "properties": { "Node name for S&R": "🔹Photoshop Images" },
        "widgets_values": [title], "color": "#000000", "bgcolor": "#1A1E24", "shape": 2
      });

      const uploaderNodeId = nodeId++;
      const uploaderConfigLink = linkId++;
      const filenameLink = linkId++;
      settingsOutputLinks.push(uploaderConfigLink);
      nodes.push({
        "id": uploaderNodeId, "type": "RH_ImageUploaderNode", "pos": [baseX, leftColY + 50], "size": [229, 46],
        "flags": {}, "order": 4 + i, "mode": 0,
        "inputs": [
          { "label": "apiConfig", "name": "apiConfig", "type": "STRUCT", "link": uploaderConfigLink },
          { "label": "image", "name": "image", "type": "IMAGE", "link": rgbLink }
        ],
        "outputs": [{ "label": "filename", "name": "filename", "type": "STRING", "slot_index": 0, "links": [filenameLink] }],
        "properties": { "cnr_id": "ComfyUI_RH_APICall", "Node name for S&R": "RH_ImageUploaderNode" },
        "widgets_values": []
      });
      links.push([uploaderConfigLink, settingsNodeId, 0, uploaderNodeId, 0, "STRUCT"]);
      links.push([rgbLink, psNodeId, 0, uploaderNodeId, 1, "IMAGE"]);
      uploaderNodes.push({ nodeId: uploaderNodeId, filenameLink, field: imageFields[i] });
      leftColY += 200;  // Move down for next set of nodes (increased spacing)
    }

    // ========== PS Strings Nodes (text/prompt) ==========
    const stringNodes = [];
    textFields.forEach((field, i) => {
      const strNodeId = nodeId++;
      const strLink = linkId++;
      nodes.push({
        "id": strNodeId, "type": "🔹Photoshop Strings", "pos": [baseX - 300, leftColY], "size": [200, 75],
        "flags": {}, "order": 10 + i, "mode": 0, "inputs": [],
        "outputs": [{ "name": " ", "type": "STRING", "links": [strLink], "slot_index": 0 }],
        "title": "+ PROMPT", "properties": { "Node name for S&R": "🔹Photoshop Strings" },
        "widgets_values": ["", ""], "color": "#000000", "bgcolor": "#1A1E24", "shape": 2
      });
      stringNodes.push({ nodeId: strNodeId, link: strLink, field });
      leftColY += 110;  // Move down (increased spacing)
    });

    // ========== PS Floats + ShowAny (denoise/strength_model) ==========
    const floatNodes = [];
    floatFields.forEach((field, i) => {
      const floatNodeId = nodeId++;
      const floatLink = linkId++;
      nodes.push({
        "id": floatNodeId, "type": "🔹Floats", "pos": [baseX - 300, leftColY], "size": [130, 45],
        "flags": {}, "order": 15 + i, "mode": 0, "inputs": [],
        "outputs": [{ "name": " ", "type": "FLOAT", "links": [floatLink] }],
        "title": field.description || field.fieldName,
        "properties": { "Node name for S&R": "🔹Floats", "slidermin": 0, "slidermax": 1, "sliderstep": 0.01 },
        "widgets_values": [parseFloat(field.fieldValue) || 0.5, ""], "color": "#000000", "bgcolor": "#1A1E24", "shape": 2
      });
      const showAnyId = nodeId++;
      const showAnyLink = linkId++;
      nodes.push({
        "id": showAnyId, "type": "easy showAnything", "pos": [baseX - 150, leftColY], "size": [150, 60],
        "flags": {}, "order": 16 + i, "mode": 0,
        "inputs": [{ "name": "anything", "shape": 7, "type": "*", "link": floatLink }],
        "outputs": [{ "name": "output", "type": "*", "links": [showAnyLink] }],
        "properties": { "Node name for S&R": "easy showAnything" },
        "widgets_values": [String(field.fieldValue) || "0.5"]
      });
      links.push([floatLink, floatNodeId, 0, showAnyId, 0, "*"]);
      floatNodes.push({ showAnyId, link: showAnyLink, field });
      leftColY += 100;  // Move down (increased spacing)
    });

    // ========== Int + ShowAny (value >= 1) ==========
    const intNodes = [];
    intFields.forEach((field, i) => {
      const intNodeId = nodeId++;
      const intLink = linkId++;
      nodes.push({
        "id": intNodeId, "type": "easy int", "pos": [baseX - 300, leftColY], "size": [200, 58],
        "flags": {}, "order": 20 + i, "mode": 0, "inputs": [],
        "outputs": [{ "name": "int", "type": "INT", "links": [intLink] }],
        "properties": { "Node name for S&R": "easy int" },
        "widgets_values": [parseInt(field.fieldValue) || 1024], "color": "#322", "bgcolor": "#533"
      });
      const showAnyId = nodeId++;
      const showAnyLink = linkId++;
      nodes.push({
        "id": showAnyId, "type": "easy showAnything", "pos": [baseX - 80, leftColY], "size": [150, 60],
        "flags": {}, "order": 21 + i, "mode": 0,
        "inputs": [{ "name": "anything", "shape": 7, "type": "*", "link": intLink }],
        "outputs": [{ "name": "output", "type": "*", "links": [showAnyLink] }],
        "properties": { "Node name for S&R": "easy showAnything" },
        "widgets_values": [String(field.fieldValue) || "1024"]
      });
      links.push([intLink, intNodeId, 0, showAnyId, 0, "*"]);
      intNodes.push({ showAnyId, link: showAnyLink, field });
      leftColY += 100;  // Move down (increased spacing)
    });

    // ========== Mixed String Nodes (values like "2k", "4k", "1080p") ==========
    const mixedStringNodes = [];
    mixedStringFields.forEach((field, i) => {
      const strNodeId = nodeId++;
      const strLink = linkId++;
      nodes.push({
        "id": strNodeId, "type": "easy string", "pos": [baseX - 300, leftColY], "size": [200, 78],
        "flags": {}, "order": 25 + i, "mode": 0, "inputs": [],
        "outputs": [{ "name": "string", "type": "STRING", "links": [strLink] }],
        "title": field.description || field.fieldName,
        "properties": { "Node name for S&R": "easy string" },
        "widgets_values": [String(field.fieldValue) || "2k"], "color": "#233", "bgcolor": "#355"
      });
      mixedStringNodes.push({ nodeId: strNodeId, link: strLink, field });
      leftColY += 100;  // Move down (increased spacing)
    });

    // ========== RH_NodeInfoListNode Chain ==========
    let prevInfoNodeId = null, prevInfoLink = null, lastInfoLink = null;
    nodeInfoList.forEach((field, idx) => {
      const infoNodeId = nodeId++;
      const infoLink = linkId++;
      let fieldValueLink = null;
      let directFieldValue = "";  // For direct value fill when no node is connected

      if (field.fieldType === 'IMAGE') {
        const ui = uploaderNodes.find(u => u.field === field);
        if (ui) fieldValueLink = ui.filenameLink;
      } else if (field.fieldName?.toLowerCase() === 'text' || field.fieldName?.toLowerCase() === 'prompt') {
        const si = stringNodes.find(s => s.field === field);
        if (si) fieldValueLink = si.link;
      } else {
        // Check float nodes (pure numeric 0-1)
        const fi = floatNodes.find(f => f.field === field);
        if (fi) {
          fieldValueLink = fi.link;
        } else {
          // Check int nodes (pure numeric >= 1)
          const vi = intNodes.find(v => v.field === field);
          if (vi) {
            fieldValueLink = vi.link;
          } else {
            // Check mixed string nodes (like "2k", "4k")
            const mi = mixedStringNodes.find(m => m.field === field);
            if (mi) {
              fieldValueLink = mi.link;
            } else {
              // Check if this is a direct value field (exposed API param)
              const di = directValueFields.find(d => d === field);
              if (di) {
                // No node connection, fill fieldValue directly
                directFieldValue = String(field.fieldValue || "");
              }
            }
          }
        }
      }

      nodes.push({
        "id": infoNodeId, "type": "RH_NodeInfoListNode", "pos": [baseX + colWidth, baseY + 180 + idx * 200], "size": [330, 126],
        "flags": {}, "order": 30 + idx, "mode": 0,
        "inputs": [
          { "label": "previousNodeInfoList", "name": "previousNodeInfoList", "shape": 7, "type": "ARRAY", "link": prevInfoLink },
          { "label": "fieldValue", "name": "fieldValue", "type": "STRING", "widget": { "name": "fieldValue" }, "link": fieldValueLink }
        ],
        "outputs": [{ "label": "ARRAY", "name": "ARRAY", "type": "ARRAY", "links": [infoLink] }],
        "title": field.description || field.fieldName,
        "properties": { "cnr_id": "ComfyUI_RH_APICall", "Node name for S&R": "RH_NodeInfoListNode" },
        "widgets_values": [parseInt(field.nodeId) || 1, field.fieldName || "image", directFieldValue]
      });

      if (prevInfoNodeId) links.push([prevInfoLink, prevInfoNodeId, 0, infoNodeId, 0, "ARRAY"]);
      if (fieldValueLink) {
        if (field.fieldType === 'IMAGE') {
          const ui = uploaderNodes.find(u => u.field === field);
          if (ui) links.push([fieldValueLink, ui.nodeId, 0, infoNodeId, 1, "STRING"]);
        } else if (field.fieldName?.toLowerCase() === 'text' || field.fieldName?.toLowerCase() === 'prompt') {
          const si = stringNodes.find(s => s.field === field);
          if (si) links.push([fieldValueLink, si.nodeId, 0, infoNodeId, 1, "STRING"]);
        } else {
          // Check float nodes
          const fi = floatNodes.find(f => f.field === field);
          if (fi) {
            links.push([fieldValueLink, fi.showAnyId, 0, infoNodeId, 1, "*"]);
          } else {
            // Check int nodes
            const vi = intNodes.find(v => v.field === field);
            if (vi) {
              links.push([fieldValueLink, vi.showAnyId, 0, infoNodeId, 1, "*"]);
            } else {
              // Check mixed string nodes
              const mi = mixedStringNodes.find(m => m.field === field);
              if (mi) {
                links.push([fieldValueLink, mi.nodeId, 0, infoNodeId, 1, "STRING"]);
              }
            }
          }
        }
      }
      prevInfoNodeId = infoNodeId; prevInfoLink = infoLink; lastInfoLink = infoLink;
    });


    // ========== RH_ExecuteNode ==========
    const execNodeId = nodeId++;
    const execConfigLink = linkId++;
    const execOutputLink = linkId++;
    settingsOutputLinks.push(execConfigLink);
    nodes.push({
      "id": execNodeId, "type": "RH_ExecuteNode", "pos": [baseX + colWidth * 2 + 50, baseY], "size": [315, 310],
      "flags": {}, "order": 50, "mode": 0,
      "inputs": [
        { "label": "apiConfig", "name": "apiConfig", "type": "STRUCT", "link": execConfigLink },
        { "label": "nodeInfoList", "name": "nodeInfoList", "shape": 7, "type": "ARRAY", "link": lastInfoLink }
      ],
      "outputs": [
        { "label": "images", "name": "images", "type": "IMAGE", "links": [execOutputLink] },
        { "label": "video_frames", "name": "video_frames", "type": "IMAGE", "links": [] },
        { "label": "latent", "name": "latent", "type": "LATENT", "links": [] },
        { "label": "text", "name": "text", "type": "STRING", "links": [] },
        { "label": "audio", "name": "audio", "type": "AUDIO", "links": [] },
        { "name": "video1", "type": "VIDEO", "links": null }, { "name": "video2", "type": "VIDEO", "links": null },
        { "name": "video3", "type": "VIDEO", "links": null }, { "name": "video4", "type": "VIDEO", "links": null },
        { "name": "video5", "type": "VIDEO", "links": null }
      ],
      "properties": { "cnr_id": "ComfyUI_RH_APICall", "Node name for S&R": "RH_ExecuteNode" },
      "widgets_values": [600, 3, true, false]
    });
    links.push([execConfigLink, settingsNodeId, 0, execNodeId, 0, "STRUCT"]);
    if (prevInfoNodeId) links.push([lastInfoLink, prevInfoNodeId, 0, execNodeId, 1, "ARRAY"]);

    // ========== SendTo Photoshop ==========
    const sendPsId = nodeId++;
    nodes.push({
      "id": sendPsId, "type": "🔹SendTo Photoshop Plugin", "pos": [baseX + colWidth * 3 + 100, baseY], "size": [160, 160],
      "flags": {}, "order": 51, "mode": 0,
      "inputs": [{ "name": "RGB", "type": "IMAGE", "link": execOutputLink }, { "name": "ALPHA", "shape": 7, "type": "MASK", "link": null }],
      "outputs": [], "title": "Send to PS", "properties": { "Node name for S&R": "🔹SendTo Photoshop Plugin" },
      "widgets_values": [""], "color": "#000000", "bgcolor": "#1A1E24", "shape": 2
    });
    links.push([execOutputLink, execNodeId, 0, sendPsId, 0, "IMAGE"]);

    // Update settings output links
    nodes.find(n => n.id === settingsNodeId).outputs[0].links = [...settingsOutputLinks];

    // Calculate group bounding box to fit ALL nodes (including Int/Float nodes)
    const minX = Math.min(...nodes.map(n => n.pos[0]));
    const maxX = Math.max(...nodes.map(n => n.pos[0] + n.size[0]));
    const minY = Math.min(...nodes.map(n => n.pos[1]));
    const maxY = Math.max(...nodes.map(n => n.pos[1] + n.size[1]));
    const padding = 50;
    const groupBounding = [
      minX - padding,
      minY - padding - 60,  // Extra space for group title
      maxX - minX + padding * 2,
      maxY - minY + padding * 2 + 60
    ];
    console.log('[RunningHub] Group bounding calculated:', groupBounding);

    const workflow = {
      "id": workflowId, "revision": 0, "last_node_id": nodeId - 1, "last_link_id": linkId - 1,
      "nodes": nodes, "links": links,
      "groups": [{ "id": 1, "title": `AIGCTV - ${webappName || webappId}`, "bounding": groupBounding, "color": "#3f789e", "font_size": 50, "flags": {} }],
      "config": {}, "extra": { "ds": { "scale": 0.5, "offset": [500, 500] }, "workflowRendererVersion": "LG", "frontendVersion": "1.33.13" }, "version": 0.4
    };



    // Save to ComfyUI workflows directory
    const comfyDir = path.join(getComfyDir(), 'ComfyUI');
    const workflowsDir = path.join(comfyDir, 'user', 'default', 'workflows');

    // Ensure directory exists
    if (!fs.existsSync(workflowsDir)) {
      fs.mkdirSync(workflowsDir, { recursive: true });
    }

    // Create filename using webappName if available
    const safeName = (webappName || webappId).replace(/[<>:"/\\|?*]/g, '_').substring(0, 30);
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = `${dateStr}_RH_${safeName}.json`;
    const savePath = path.join(workflowsDir, filename);

    fs.writeFileSync(savePath, JSON.stringify(workflow, null, 2), 'utf-8');

    console.log('[RunningHub] Workflow saved to:', savePath);
    sendLog(`工作流已保存: ${filename}`, 'system');

    // Return with additional info
    return {
      success: true,
      workflow: workflow,
      nodeInfoList: nodeInfoList,
      webappName: webappName || webappId,
      message: `工作流 "${webappName || webappId}" 生成成功!\n包含 ${nodeInfoList.length} 个可配置参数`,
      savedPath: savePath
    };

  } catch (error) {
    console.error('[RunningHub] Error:', error);
    sendLog(`工作流生成失败: ${error.message}`, 'error');
    return {
      success: false,
      message: `生成失败: ${error.message}`
    };
  }
});

// Save RunningHub workflow to file
ipcMain.handle('save-rh-workflow', async (event, workflow, filename) => {
  const fs = require('fs');

  try {
    const comfyDir = path.join(getComfyDir(), 'ComfyUI');
    const workflowsDir = path.join(comfyDir, 'user', 'default', 'workflows');

    if (!fs.existsSync(workflowsDir)) {
      fs.mkdirSync(workflowsDir, { recursive: true });
    }

    const savePath = path.join(workflowsDir, filename);
    fs.writeFileSync(savePath, JSON.stringify(workflow, null, 2), 'utf-8');

    return { success: true, path: savePath, message: '保存成功' };
  } catch (error) {
    return { success: false, message: `保存失败: ${error.message}` };
  }
});

// Get RunningHub account status (coins, wallet balance)
ipcMain.handle('get-rh-account-status', async (event, apiKey) => {
  try {
    const response = await fetch('https://www.runninghub.cn/uc/openapi/accountStatus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: apiKey })
    });
    const result = await response.json();
    if (result.code === 0) {
      return { success: true, data: result.data };
    }
    return { success: false, message: result.msg || '获取账户信息失败' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// Cancel RunningHub task
ipcMain.handle('cancel-rh-task', async (event, apiKey, taskId) => {
  try {
    const response = await fetch('https://www.runninghub.cn/task/openapi/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, taskId })
    });
    const result = await response.json();
    if (result.code === 0) {
      return { success: true, message: '任务已取消' };
    }
    return { success: false, message: result.msg || '取消任务失败' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// Get RunningHub task status
ipcMain.handle('get-rh-task-status', async (event, apiKey, taskId) => {
  try {
    const response = await fetch('https://www.runninghub.cn/task/openapi/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, taskId })
    });
    const result = await response.json();
    console.log('[RunningHub Status API] taskId:', taskId, 'Response:', JSON.stringify(result));
    return { success: true, code: result.code, msg: result.msg, data: result.data };
  } catch (error) {
    console.log('[RunningHub Status API] Error:', error.message);
    return { success: false, message: error.message };
  }
});

// Get RunningHub task outputs/results
ipcMain.handle('get-rh-task-outputs', async (event, apiKey, taskId) => {
  try {
    const response = await fetch('https://www.runninghub.cn/task/openapi/outputs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, taskId })
    });
    const result = await response.json();
    if (result.code === 0) {
      return { success: true, data: result.data };
    }
    return { success: false, message: result.msg || '获取任务结果失败' };
  } catch (error) {
    return { success: false, message: error.message };
  }
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
      version: '1.0.1',
      buildDate: '2025-12-26 00:00:00'
    };
  }
});

// PS Plugin Auto-Update IPC Handlers
const https = require('https');
const fs = require('fs');
// Note: Using execFile to call 7z.exe directly instead of node-7z-archive (ESM compatibility issue)


// Auto-update PS plugin

ipcMain.handle('update-ps-plugin', async (event, { psPluginPath }) => {
  // Validate PS plugin path
  if (!psPluginPath || psPluginPath.trim() === '') {
    return { success: false, message: '请先设置 Photoshop 插件目录' };
  }

  // Auto-compute ComfyUI custom_nodes path from portable package root
  const comfyUIPath = path.join(getComfyDir(), 'ComfyUI', 'custom_nodes');
  console.log('[PS Plugin] Auto-computed ComfyUI path:', comfyUIPath);

  try {
    //  Step 1: Get latest release info
    const updateInfo = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/AIGCTV/comfyui-photoshop-fix/releases/latest',
        method: 'GET',
        headers: {
          'User-Agent': 'ComfyUI-Launcher',
          'Accept': 'application/vnd.github.v3+json'
        }
      };


      https.get(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error('解析版本信息失败'));
          }
        });
      }).on('error', reject);
    });

    if (!updateInfo.assets || updateInfo.assets.length === 0) {
      return { success: false, message: '未找到下载文件' };
    }

    // 优先查找 .7z，其次查找 .zip
    let asset = updateInfo.assets.find(a => a.name.endsWith('.7z'));
    let archiveType = '7z';
    if (!asset) {
      asset = updateInfo.assets.find(a => a.name.endsWith('.zip'));
      archiveType = 'zip';
    }
    if (!asset) {
      return { success: false, message: '未找到压缩包 (.7z 或 .zip)' };
    }
    console.log('[PS Plugin] Found archive:', asset.name, 'Type:', archiveType);

    // Step 2: Download the 7z file (with redirect handling)
    const tempDir = path.join(app.getPath('temp'), 'ps-plugin-update');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const downloadPath = path.join(tempDir, asset.name);
    let downloadUrl = asset.browser_download_url;

    // Apply GitHub Mirror if enabled
    const settings = getSettings(); // Read latest settings
    const useMirror = settings.useGithubMirror || settings.useGitHubProxy;
    if (useMirror) {
      const mirrorUrl = (settings.githubMirrorUrl || 'https://ghproxy.net/').replace(/\/$/, '');
      downloadUrl = `${mirrorUrl}/${downloadUrl}`;
      console.log('[PS Plugin] Using mirror download:', downloadUrl);
    }

    // Helper function to follow redirects
    const downloadWithRedirects = (url, destPath, maxRedirects = 5) => {
      return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) {
          reject(new Error('Too many redirects'));
          return;
        }

        const protocol = url.startsWith('https') ? https : require('http');
        console.log('[PS Plugin] Downloading from:', url);

        protocol.get(url, (response) => {
          // Handle redirects (301, 302, 303, 307, 308)
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            console.log('[PS Plugin] Following redirect to:', response.headers.location);
            downloadWithRedirects(response.headers.location, destPath, maxRedirects - 1)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Download failed with status: ${response.statusCode}`));
            return;
          }

          const file = fs.createWriteStream(destPath);
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            console.log('[PS Plugin] Download complete:', destPath);
            resolve();
          });
          file.on('error', (err) => {
            fs.unlinkSync(destPath);
            reject(err);
          });
        }).on('error', (err) => {
          reject(err);
        });
      });
    };

    await downloadWithRedirects(downloadUrl, downloadPath);


    // Step 3: Extract 7z file using bundled 7za.exe
    const extractPath = path.join(tempDir, 'extracted');
    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }

    // 获取 7za.exe 路径 - 需要处理开发环境 vs 打包环境
    // 注意：使用的是 node-7z-archive 包，二进制文件在 binaries/win32/ 目录下
    let sevenZipPath;
    if (app.isPackaged) {
      // 打包后，node-7z-archive 的 binaries 在 resources/app.asar.unpacked/node_modules 下
      sevenZipPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'node-7z-archive', 'binaries', 'win32', '7za.exe');
    } else {
      // 开发环境，直接使用 node_modules
      sevenZipPath = path.join(__dirname, '..', 'node_modules', 'node-7z-archive', 'binaries', 'win32', '7za.exe');
    }
    console.log('[PS Plugin] Using 7z path:', sevenZipPath);

    // 验证 7za.exe 是否存在
    if (!fs.existsSync(sevenZipPath)) {
      console.error('[PS Plugin] 7za.exe not found at:', sevenZipPath);
      return { success: false, message: `7za.exe 未找到，请检查安装完整性: ${sevenZipPath}` };
    }

    await new Promise((resolve, reject) => {
      execFile(sevenZipPath, ['x', downloadPath, `-o${extractPath}`, '-y'], (error, stdout, stderr) => {
        if (error) {
          console.error('[PS Plugin] 7z extraction error:', stderr);
          reject(new Error('解压失败: ' + (stderr || error.message)));
        } else {
          console.log('[PS Plugin] 7z extraction complete');
          resolve();
        }
      });
    });



    // Step 4: Check extracted contents and source paths
    console.log('[PS Plugin] Checking extracted contents...');
    const extractedContents = fs.readdirSync(extractPath);
    console.log('[PS Plugin] Extracted folder contents:', extractedContents);

    // Based on actual 7z structure:
    // - comfyui-photoshop/ (ComfyUI node - goes to custom_nodes)
    // - comfyui-photoshop/Install_Plugin/3e6d64e0 (PS plugin - goes to Photoshop Plug-ins)
    let comfyUISource = path.join(extractPath, 'comfyui-photoshop');
    let psPluginSource = path.join(extractPath, 'comfyui-photoshop', 'Install_Plugin', '3e6d64e0');

    // Verify sources exist
    if (!fs.existsSync(comfyUISource)) {
      console.error('[PS Plugin] ComfyUI source not found:', comfyUISource);
      return { success: false, message: `解压后未找到ComfyUI节点文件夹 (comfyui-photoshop)。解压内容: ${extractedContents.join(', ')}` };
    }
    if (!fs.existsSync(psPluginSource)) {
      console.error('[PS Plugin] PS source not found:', psPluginSource);
      // List Install_Plugin contents for debugging
      const installPluginPath = path.join(extractPath, 'comfyui-photoshop', 'Install_Plugin');
      let installContents = '(Install_Plugin目录不存在)';
      if (fs.existsSync(installPluginPath)) {
        installContents = fs.readdirSync(installPluginPath).join(', ');
      }
      return { success: false, message: `解压后未找到PS插件文件夹 (3e6d64e0)。Install_Plugin内容: ${installContents}` };
    }

    console.log('[PS Plugin] PS source:', psPluginSource);
    console.log('[PS Plugin] ComfyUI source:', comfyUISource);


    // Get root directory for ComfyUI
    const rootDir = getComfyDir();

    // Resolve paths - handle both relative and absolute paths
    const resolvedPSPath = path.isAbsolute(psPluginPath) ? psPluginPath : path.join(rootDir, psPluginPath);
    const resolvedComfyUIPath = path.isAbsolute(comfyUIPath) ? comfyUIPath : path.join(rootDir, comfyUIPath);

    const psPluginDest = path.join(resolvedPSPath, '3e6d64e0');
    const comfyUIDest = path.join(resolvedComfyUIPath, 'comfyui-photoshop');

    // Check if destinations exist
    const psExists = fs.existsSync(psPluginDest);
    const comfyExists = fs.existsSync(comfyUIDest);

    if (psExists || comfyExists) {
      const result = await dialog.showMessageBox({
        type: 'warning',
        title: '确认覆盖',
        message: '目标目录已存在文件，是否覆盖？',
        detail: `${psExists ? 'PS插件目录\n' : ''}${comfyExists ? 'ComfyUI节点目录' : ''}`,
        buttons: ['是', '否'],
        defaultId: 1,
        cancelId: 1
      });

      if (result.response === 1) {
        // User canceled
        // Clean up temp files
        fs.rmSync(tempDir, { recursive: true, force: true });
        return { success: false, message: '用户取消更新' };
      }
      // Files will be deleted in the PowerShell script with admin privileges
    }

    // Step 5: Copy files using elevated PowerShell (for Program Files access)

    // Create a PowerShell script for admin copy
    const psScriptPath = path.join(tempDir, 'copy_plugin.ps1');

    // Use forward slashes in paths for PowerShell (works better)
    const psSourcePath = psPluginSource.replace(/\\/g, '/');
    const comfySourcePath = comfyUISource.replace(/\\/g, '/');
    const psDestPath = psPluginDest.replace(/\\/g, '/');
    const comfyDestPath = comfyUIDest.replace(/\\/g, '/');

    const psScript = `
# PS Plugin Update Script - Requires Admin
$ErrorActionPreference = "Stop"

# Source paths
$psSource = "${psSourcePath}"
$comfySource = "${comfySourcePath}"

# Destination paths  
$psDest = "${psDestPath}"
$comfyDest = "${comfyDestPath}"

Write-Host "Copying PS Plugin..."
Write-Host "From: $psSource"
Write-Host "To: $psDest"

try {
    # Remove existing if exists
    if (Test-Path $psDest) {
        Write-Host "Removing existing PS plugin..."
        Remove-Item -Path $psDest -Recurse -Force
    }
    if (Test-Path $comfyDest) {
        Write-Host "Removing existing ComfyUI node..."
        Remove-Item -Path $comfyDest -Recurse -Force
    }
    
    # Copy new files
    Write-Host "Copying new PS plugin..."
    Copy-Item -Path $psSource -Destination $psDest -Recurse -Force
    Write-Host "Copying new ComfyUI node..."
    Copy-Item -Path $comfySource -Destination $comfyDest -Recurse -Force
    
    Write-Host "Plugin update successful!"
    Start-Sleep -Seconds 2
    exit 0
} catch {
    Write-Host "Error: $_"
    Start-Sleep -Seconds 5
    exit 1
}
`;

    fs.writeFileSync(psScriptPath, psScript, 'utf8');
    console.log('[PS Plugin] Created PowerShell script:', psScriptPath);
    console.log('[PS Plugin] PS source:', psPluginSource);
    console.log('[PS Plugin] PS dest:', psPluginDest);

    // Execute PowerShell with admin elevation using a simpler approach
    await new Promise((resolve, reject) => {
      // Create a batch file to run the PowerShell script with admin
      const batPath = path.join(tempDir, 'run_admin.bat');
      const batContent = `@echo off
powershell.exe -ExecutionPolicy Bypass -File "${psScriptPath}"
`;
      fs.writeFileSync(batPath, batContent, 'utf8');

      // Use shell.openPath to run as admin via PowerShell Start-Process with hidden window
      const { exec } = require('child_process');
      const cmd = `powershell.exe -Command "Start-Process -FilePath 'powershell.exe' -ArgumentList '-ExecutionPolicy Bypass -WindowStyle Hidden -File \\\"${psScriptPath.replace(/\\/g, '\\\\')}\\\"' -Verb RunAs -Wait -WindowStyle Hidden"`;

      console.log('[PS Plugin] Running admin command...');

      exec(cmd, (error, stdout, stderr) => {
        console.log('[PS Plugin] Admin exec stdout:', stdout);
        console.log('[PS Plugin] Admin exec stderr:', stderr);

        // Check if files were copied successfully
        setTimeout(() => {
          const psSuccess = fs.existsSync(psPluginDest);
          const comfySuccess = fs.existsSync(comfyUIDest);
          console.log('[PS Plugin] PS plugin exists:', psSuccess);
          console.log('[PS Plugin] ComfyUI node exists:', comfySuccess);

          if (psSuccess && comfySuccess) {
            resolve();
          } else {
            reject(new Error('文件复制失败，请确保授予管理员权限并检查路径是否正确'));
          }
        }, 1000);
      });
    });


    // Step 6: Clean up temp files
    fs.rmSync(tempDir, { recursive: true, force: true });


    return {
      success: true,
      message: `插件更新成功！版本: ${updateInfo.tag_name}`
    };

  } catch (error) {
    console.error('[PS Plugin Update] Error:', error);
    return {
      success: false,
      message: '更新失败: ' + error.message
    };
  }
});

// Handle app quit
app.on('before-quit', () => {
  if (comfyProcess) {
    comfyProcess.kill();
    comfyProcess = null;
  }
});
