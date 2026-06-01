
// Config persistence
const configPath = path.join(__dirname, '../launcher-settings.json');

ipcMain.handle('load-settings', async () => {
    const fs = require('fs');
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
    return null;
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
