// Create model symlink handler
ipcMain.handle('create-model-symlink', async (event, sourcePath) => {
    const fs = require('fs');
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
        const comfyDir = path.join(__dirname, '..', '..', 'ComfyUI');
        const targetPath = path.join(comfyDir, 'models');

        console.log(`[Model Symlink] Source: ${sourcePath}`);
        console.log(`[Model Symlink] Target: ${targetPath}`);

        // Check if source path exists
        if (!fs.existsSync(sourcePath)) {
            return {
                success: false,
                message: '源目录不存在,请检查路径是否正确'
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
                    message: 'ComfyUI/models 目录已存在,请先重命名或移动到其他位置'
                };
            }
        }

        // Create symlink using mklink
        const command = `mklink /D "${targetPath}" "${sourcePath}"`;
        console.log(`[Model Symlink] Executing: ${command}`);

        await execAsync(command, { shell: 'cmd.exe' });

        sendLog(`模型映射创建成功: ${sourcePath} -> ${targetPath}`, 'system');

        return {
            success: true,
            message: '模型映射创建成功!'
        };

    } catch (error) {
        console.error('[Model Symlink] Error:', error);
        sendLog(`模型映射创建失败: ${error.message}`, 'error');

        return {
            success: false,
            message: `创建失败: ${error.message}`
        };
    }
});
