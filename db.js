const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

// 数据库存储路径 - 使用用户数据目录而不是应用目录
// 这样在应用更新后数据仍然可以保留
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'db.json');

// 如果用户数据目录中没有数据库文件，但应用目录中有，则复制过去
const oldDbPath = path.join(__dirname, 'db.json');
if (!fs.existsSync(dbPath) && fs.existsSync(oldDbPath)) {
    fs.copyFileSync(oldDbPath, dbPath);
}

// 如果数据库文件不存在，则创建一个默认的
if (!fs.existsSync(dbPath)) {
    const defaultData = {
        activities: [],
        tasks: [],
        completedTasks: [],
        settings: {
            reminderInterval: 30
        },
        appState: {
            currentDayStarted: false,
            currentT0: null
        }
    };
    fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2));
}

const adapter = new FileSync(dbPath);
const db = low(adapter);

// 设置默认数据（如果数据库中没有这些字段）
db.defaults({
    activities: [],
    tasks: [],
    completedTasks: [],
    settings: {
        reminderInterval: 30 // 默认提醒间隔（分钟）
    },
    appState: {
        currentDayStarted: false,
        currentT0: null
    }
}).write();

class Database {
    // 获取所有活动
    static getActivities() {
        return db.get('activities').value();
    }
    
    // 添加活动
    static addActivity(activity) {
        return db.get('activities')
            .push(activity)
            .write();
    }
    
    // 获取所有任务
    static getTasks() {
        return db.get('tasks').value();
    }
    
    // 添加任务
    static addTask(task) {
        return db.get('tasks')
            .push(task)
            .write();
    }
    
    // 更新任务
    static updateTask(taskId, updates) {
        return db.get('tasks')
            .find({ id: taskId })
            .assign(updates)
            .write();
    }
    
    // 删除任务
    static deleteTask(taskId) {
        // 从任务列表删除
        db.get('tasks')
            .remove({ id: taskId })
            .write();
            
        // 从已完成任务列表删除
        db.get('completedTasks')
            .remove({ id: taskId })
            .write();
    }
    
    // 完成任务
    static completeTask(taskId) {
        const task = db.get('tasks')
            .find({ id: taskId })
            .value();
            
        if (task) {
            // 从任务列表移除
            db.get('tasks')
                .remove({ id: taskId })
                .write();
                
            // 添加到已完成任务列表
            task.completed = true;
            task.completedAt = new Date().toISOString();
            
            return db.get('completedTasks')
                .push(task)
                .write();
        }
    }
    
    // 获取已完成任务
    static getCompletedTasks() {
        return db.get('completedTasks').value();
    }
    
    // 根据筛选条件获取已完成任务
    static getCompletedTasksByFilter(filter) {
        const now = new Date();
        const tasks = db.get('completedTasks').value();
        
        switch (filter) {
            case 'yesterday':
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                return tasks.filter(task => {
                    const completedDate = new Date(task.completedAt);
                    return completedDate.toDateString() === yesterday.toDateString();
                });
                
            case 'thisWeek':
                const startOfWeek = new Date(now);
                startOfWeek.setDate(now.getDate() - now.getDay());
                return tasks.filter(task => {
                    const completedDate = new Date(task.completedAt);
                    return completedDate >= startOfWeek;
                });
                
            case 'lastWeek':
                const startOfLastWeek = new Date(now);
                startOfLastWeek.setDate(now.getDate() - now.getDay() - 7);
                const endOfLastWeek = new Date(startOfLastWeek);
                endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
                return tasks.filter(task => {
                    const completedDate = new Date(task.completedAt);
                    return completedDate >= startOfLastWeek && completedDate <= endOfLastWeek;
                });
                
            default:
                return tasks;
        }
    }
    
    // 获取设置
    static getSettings() {
        return db.get('settings').value();
    }
    
    // 更新设置
    static updateSettings(newSettings) {
        return db.set('settings', newSettings).write();
    }
    
    // 获取应用状态
    static getAppState() {
        return db.get('appState').value();
    }
    
    // 更新应用状态
    static updateAppState(newState) {
        return db.get('appState')
            .assign(newState)
            .write();
    }
    
    // 标记一天结束
    static async endDay() {
        // 更新应用状态
        db.get('appState')
            .assign({
                currentDayStarted: false,
                currentT0: null
            })
            .write();
            
        return { success: true };
    }
}

module.exports = Database;