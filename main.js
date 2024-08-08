const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    mainWindow.loadFile('index.html');

    setInterval(() => {
        fs.readFile('activity_log.csv', 'utf8', (err, data) => {
            if (err) {
                console.error("Error reading CSV file", err);
                return;
            }

            const lines = data.split('\n').slice(1); // Skip header
            const timeline = lines.map(line => {
                const [timestamp, title, process_id] = line.split(',');
                return { timestamp, title, process_id };
            });

            const summary = calculateSummary(timeline);
            mainWindow.webContents.send('update-data', { timeline, summary });
        });
    }, 5000); // Update every 5 seconds (example interval)
}

function calculateSummary(timeline) {
    // Logic to calculate focused time, distracted time, most used apps, etc.
    // For demonstration, let's return dummy data.
    return {
        dateRange: "Aug 9",
        focusedTime: "1 hour 10 minutes",
        distractedTime: "0 minutes",
        mostUsed: [
            { app: "Visual Studio Code", percentage: 50 },
            { app: "Microsoft Edge", percentage: 50 }
        ]
    };
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
