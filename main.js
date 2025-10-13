const { app, BrowserWindow, Tray, Menu, ipcMain, screen } = require('electron');
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