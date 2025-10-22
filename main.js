const { app, BrowserWindow, Tray, Menu, ipcMain, screen, Notification } = require('electron');
const path = require('path');
const url = require('url');
const Database = require('./db');
const AutoLaunch = require('auto-launch');

let mainWindow;
let tray = null;
let timerControllerAutoLauncher = null;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  // 初始化开机自启
  initAutoLaunch();
  
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // 加载应用的index.html
  mainWindow.loadURL(
    url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true
    })
  );

  // 开发模式下打开开发者工具
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('minimize', function (event) {
    event.preventDefault();
    
    // 先隐藏窗口
    mainWindow.hide();
    
    // 确保窗口完全隐藏后再发送消息
    setTimeout(() => {
      try {
        // 显示悬浮球
        mainWindow.webContents.send('window-minimized');
        
        // 创建托盘图标（如果还不存在）
        if (!tray) {
          createTray();
        }
      } catch (error) {
        console.error('处理窗口最小化时出错:', error);
      }
    }, 100);
  });

  mainWindow.on('restore', function () {
    try {
      // 隐藏悬浮球
      mainWindow.webContents.send('window-restored');
      
      // 如果托盘存在但上下文菜单没有，则重新设置
      if (tray && !tray.getMenu()) {
        const contextMenu = Menu.buildFromTemplate([
          {
            label: '显示主窗口',
            click: function () {
              mainWindow.show();
            }
          },
          {
            label: '退出',
            click: function () {
              app.isQuiting = true;
              app.quit();
            }
          }
        ]);
        tray.setContextMenu(contextMenu);
      }
    } catch (error) {
      console.error('处理窗口恢复时出错:', error);
    }
  });

  mainWindow.on('closed', function () {
    if (tray) tray.destroy();
    mainWindow = null;
  });
}

function initAutoLaunch() {
  timerControllerAutoLauncher = new AutoLaunch({
    name: 'Timer Controller',
    path: app.getPath('exe'),
  });
}

function createTray() {
  let iconLoaded = false;
  
  try {
    // 尝试加载PNG图标
    let iconPath = path.join(__dirname, 'icon.png');
    tray = new Tray(iconPath);
    iconLoaded = true;
  } catch (error) {
    try {
      // 如果PNG图标不存在，尝试ICO图标
      let iconPath = path.join(__dirname, 'icon.ico');
      tray = new Tray(iconPath);
      iconLoaded = true;
    } catch (error) {
      // 如果ICO图标也不存在，使用系统默认图标
      try {
        tray = new Tray();
        iconLoaded = true;
      } catch (error) {
        console.error('无法创建系统托盘图标:', error);
      }
    }
  }
  
  // 只有在成功创建托盘图标时才设置上下文菜单
  if (iconLoaded) {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: function () {
          mainWindow.show();
        }
      },
      {
        label: '退出',
        click: function () {
          app.isQuiting = true;
          app.quit();
        }
      }
    ]);
    
    tray.setContextMenu(contextMenu);
    tray.setIgnoreDoubleClickEvents(true);
    tray.on('click', function () {
      mainWindow.show();
    });
    
    // 设置托盘提示信息
    tray.setToolTip('Timer Controller');
  }
}

// 在应用启动时检查是否需要恢复状态
app.whenReady().then(() => {
  createWindow();
  
  // 当应用处于活动状态但没有窗口时，创建一个窗口
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 当所有窗口都被关闭后退出应用
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 处理应用退出时销毁托盘
app.on('before-quit', function () {
  if (tray) tray.destroy();
});

// 处理从渲染进程发送来的系统托盘消息
ipcMain.on('toggle-window', () => {
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
  }
});

// 处理显示主窗口的请求
ipcMain.handle('show-main-window', async () => {
  if (mainWindow) {
    mainWindow.show();
  }
});

// 添加一个新的IPC处理程序，用于显示窗口（通过悬浮球触发）
ipcMain.on('show-window', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});

// 添加处理最小化窗口事件的代码
ipcMain.handle('minimize-window', async () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

// 添加 IPC 处理程序，用于显示提醒通知
ipcMain.handle('show-reminder-notification', async () => {
  if (mainWindow) {
    // 创建一个独立的浏览器窗口作为提醒弹窗
    const notificationWindow = new BrowserWindow({
      width: 400,
      height: 300,
      show: false,
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      fullscreenable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    
    // 设置窗口位置为中心
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const x = Math.round((width - 400) / 2);
    const y = Math.round((height - 300) / 2);
    notificationWindow.setPosition(x, y);
    
    // 加载提醒内容
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>提醒</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background: linear-gradient(45deg, #FF4136, #FF851B);
          height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          animation: pulse 1s infinite;
        }
        
        .notification-box {
          background: rgba(255, 255, 255, 0.95);
          padding: 30px;
          border-radius: 10px;
          text-align: center;
          box-shadow: 0 0 30px rgba(255, 133, 27, 0.8);
          animation: bounce 0.5s ease infinite alternate;
          max-width: 90%;
        }
        
        h2 {
          color: #FF4136;
          font-size: 28px;
          margin-bottom: 20px;
          text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.1);
        }
        
        p {
          color: #333;
          font-size: 18px;
          margin-bottom: 30px;
        }
        
        button {
          background-color: #0074D9;
          color: white;
          border: none;
          padding: 15px 30px;
          font-size: 18px;
          border-radius: 5px;
          cursor: pointer;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
          transition: all 0.2s;
        }
        
        button:hover {
          background-color: #0056b3;
          transform: translateY(-2px);
        }
        
        @keyframes pulse {
          0% { box-shadow: 0 0 10px rgba(255, 133, 27, 0.6); }
          50% { box-shadow: 0 0 30px rgba(255, 133, 27, 0.9); }
          100% { box-shadow: 0 0 10px rgba(255, 133, 27, 0.6); }
        }
        
        @keyframes bounce {
          from { transform: scale(1); }
          to { transform: scale(1.02); }
        }
      </style>
    </head>
    <body>
      <div class="notification-box">
        <h2>时间记录提醒</h2>
        <p>您已经有一段时间没有记录活动了<br>请及时记录！</p>
        <button id="closeNotification">我知道了，去记录</button>
      </div>
      <script>
        const { ipcRenderer } = require('electron');
        
        document.getElementById('closeNotification').addEventListener('click', () => {
          ipcRenderer.send('close-notification-window');
        });
        
        // 点击窗口任何地方都关闭
        document.body.addEventListener('click', (e) => {
          if (e.target.tagName !== 'BUTTON') {
            ipcRenderer.send('close-notification-window');
          }
        });
      </script>
    </body>
    </html>`;
    
    // 加载HTML内容
    notificationWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    
    // 显示窗口
    notificationWindow.once('ready-to-show', () => {
      notificationWindow.show();
      notificationWindow.focus();
    });
    
    // 处理关闭通知窗口的消息
    ipcMain.once('close-notification-window', () => {
      if (notificationWindow) {
        notificationWindow.close();
        // 显示主窗口并聚焦
        mainWindow.show();
        mainWindow.focus();
      }
    });
    
    return { success: true };
  }
});

// 自启功能相关的 IPC 处理
ipcMain.handle('get-auto-launch-status', async () => {
  try {
    const isEnabled = await timerControllerAutoLauncher.isEnabled();
    return { enabled: isEnabled };
  } catch (error) {
    return { enabled: false, error: error.message };
  }
});

ipcMain.handle('enable-auto-launch', async () => {
  try {
    await timerControllerAutoLauncher.enable();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('disable-auto-launch', async () => {
  try {
    await timerControllerAutoLauncher.disable();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 数据库相关IPC处理
ipcMain.handle('get-activities', () => {
  return Database.getActivities();
});

ipcMain.handle('add-activity', (event, activity) => {
  return Database.addActivity(activity);
});

ipcMain.handle('get-tasks', () => {
  return Database.getTasks();
});

ipcMain.handle('add-task', (event, task) => {
  return Database.addTask(task);
});

ipcMain.handle('update-task', (event, taskId, updates) => {
  return Database.updateTask(taskId, updates);
});

ipcMain.handle('delete-task', (event, taskId) => {
  return Database.deleteTask(taskId);
});

ipcMain.handle('complete-task', (event, taskId) => {
  return Database.completeTask(taskId);
});

ipcMain.handle('get-completed-tasks', () => {
  return Database.getCompletedTasks();
});

ipcMain.handle('get-completed-tasks-by-filter', (event, filter) => {
  return Database.getCompletedTasksByFilter(filter);
});

ipcMain.handle('get-settings', () => {
  return Database.getSettings();
});

ipcMain.handle('update-settings', (event, settings) => {
  return Database.updateSettings(settings);
});

// 添加状态管理IPC
ipcMain.handle('get-app-state', async () => {
  const appState = await Database.getAppState();
  const activities = await Database.getActivities();
  
  // 检查是否正在进行一天记录
  let isDayStarted = appState.currentDayStarted || false;
  let lastT0 = appState.currentT0 || null;
  
  // 如果appState中没有状态信息，通过活动记录判断
  if (!appState.currentDayStarted && activities.length > 0) {
    const lastActivity = activities[activities.length - 1];
    // 如果最后一个活动没有结束标记，则认为一天仍在进行中
    if (lastActivity && !lastActivity.dayEnded) {
      isDayStarted = true;
      lastT0 = lastActivity.T1; // 使用上一个活动的结束时间作为新的T0
    }
  }
  
  return {
    isDayStarted,
    lastT0
  };
});

ipcMain.handle('end-day', async (event, data) => {
  // 标记所有今天的活动为已结束一天
  const appState = await Database.getAppState();
  
  // 更新应用状态
  await Database.updateAppState({
    currentDayStarted: false,
    currentT0: null
  });
  
  return { success: true };
});

ipcMain.handle('start-day', async (event, data) => {
  // 更新应用状态
  await Database.updateAppState({
    currentDayStarted: true,
    currentT0: new Date().toISOString()
  });
  
  return { success: true };
});

ipcMain.handle('update-t0', async (event, t0) => {
  // 更新T0时间
  await Database.updateAppState({
    currentT0: t0
  });
  
  return { success: true };
});