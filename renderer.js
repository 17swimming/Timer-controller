const { ipcRenderer } = require('electron');

// DOM 元素
const startDayBtn = document.getElementById('startDayBtn');
const endDayBtn = document.getElementById('endDayBtn');
const addActivityBtn = document.getElementById('addActivityBtn');
const addTaskBtn = document.getElementById('addTaskBtn');
const activityHistory = document.getElementById('activityHistory');
const taskList = document.getElementById('taskList');
const completedTasks = document.getElementById('completedTasks');
const activityModal = document.getElementById('activityModal');
const taskModal = document.getElementById('taskModal');
const endDayModal = document.getElementById('endDayModal');
const activityForm = document.getElementById('activityForm');
const taskForm = document.getElementById('taskForm');
const todayActivitiesSummary = document.getElementById('todayActivitiesSummary');
const unfinishedTasksForm = document.getElementById('unfinishedTasksForm');
const confirmEndDayBtn = document.getElementById('confirmEndDayBtn');
const chartContainer = document.getElementById('chartContainer');
const timeChart = document.getElementById('timeChart');
const timelineChartBtn = document.getElementById('timelineChartBtn');
const categoryChartBtn = document.getElementById('categoryChartBtn');
const floatingBall = document.getElementById('floatingBall'); // 悬浮球元素

// 应用状态
let appState = {
    activities: [],
    tasks: [],
    completedTasks: [],
    dayStarted: false,
    T0: null
};

// 提醒设置
let reminderSettings = {
    interval: 30, // 默认30分钟
    enabled: true
};

// 提醒定时器
let reminderTimer = null;

// 图表状态
let chartState = {
    viewType: 'timeline' // 'timeline' 或 'category'
};

// 事件监听器
if (startDayBtn) startDayBtn.addEventListener('click', startDay);
if (endDayBtn) endDayBtn.addEventListener('click', endDay);
if (addActivityBtn) addActivityBtn.addEventListener('click', () => {
    updateTaskSelection(); // 更新任务选择列表
    activityModal.style.display = 'block';
});
if (addTaskBtn) addTaskBtn.addEventListener('click', () => taskModal.style.display = 'block');
if (floatingBall) floatingBall.addEventListener('click', showMainWindow); // 悬浮球点击事件

// 添加提醒设置按钮事件监听器
document.addEventListener('DOMContentLoaded', () => {
    createReminderSettingsButton();
});

// 图表视图切换
if (timelineChartBtn) timelineChartBtn.addEventListener('click', () => {
    chartState.viewType = 'timeline';
    setActiveChartButton(timelineChartBtn);
    updateChart();
});

if (categoryChartBtn) categoryChartBtn.addEventListener('click', () => {
    chartState.viewType = 'category';
    setActiveChartButton(categoryChartBtn);
    updateChart();
});

// 关闭弹窗
document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
        activityModal.style.display = 'none';
        taskModal.style.display = 'none';
        endDayModal.style.display = 'none';
    });
});

// 活动来源切换
document.getElementById('activitySource').addEventListener('change', function() {
    const manualInputSection = document.getElementById('manualInputSection');
    const taskSelectionSection = document.getElementById('taskSelectionSection');
    
    if (this.value === 'manual') {
        manualInputSection.style.display = 'block';
        taskSelectionSection.style.display = 'none';
        document.getElementById('activityName').required = true;
        document.getElementById('selectedTask').required = false;
    } else {
        manualInputSection.style.display = 'none';
        taskSelectionSection.style.display = 'block';
        document.getElementById('activityName').required = false;
        document.getElementById('selectedTask').required = true;
    }
});

// 点击弹窗外部关闭
window.addEventListener('click', (event) => {
    if (event.target === activityModal) activityModal.style.display = 'none';
    if (event.target === taskModal) taskModal.style.display = 'none';
    if (event.target === endDayModal) endDayModal.style.display = 'none';
});

// 表单提交事件
if (activityForm) activityForm.addEventListener('submit', saveActivity);
if (taskForm) taskForm.addEventListener('submit', saveTask);
if (confirmEndDayBtn) confirmEndDayBtn.addEventListener('click', confirmEndDay);

// 筛选按钮事件
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadCompletedTasks(btn.dataset.filter);
    });
});

// 设置活动图表按钮
function setActiveChartButton(activeButton) {
    if (timelineChartBtn) timelineChartBtn.classList.remove('active');
    if (categoryChartBtn) categoryChartBtn.classList.remove('active');
    if (activeButton) activeButton.classList.add('active');
}

// 更新任务选择列表
function updateTaskSelection() {
    const taskSelect = document.getElementById('selectedTask');
    if (!taskSelect) return;
    
    // 清空现有选项
    taskSelect.innerHTML = '<option value="">请选择待办事项</option>';
    
    // 添加未完成的任务选项
    appState.tasks.filter(task => !task.completed).forEach(task => {
        const option = document.createElement('option');
        option.value = task.name;
        option.textContent = task.name;
        taskSelect.appendChild(option);
    });
}

// 显示主窗口
function showMainWindow() {
    // 通过IPC调用显示主窗口
    ipcRenderer.send('show-window');
}

// 监听主进程发送的窗口状态变化消息
ipcRenderer.on('window-minimized', () => {
    // 显示悬浮球
    if (floatingBall) {
        // 确保元素存在且添加show类
        floatingBall.style.display = 'flex'; // 强制显示元素
        floatingBall.classList.add('show');
    }
});

ipcRenderer.on('window-restored', () => {
    // 隐藏悬浮球
    if (floatingBall) {
        floatingBall.classList.remove('show');
        // 延迟隐藏元素，确保动画完成
        setTimeout(() => {
            if (!floatingBall.classList.contains('show')) {
                floatingBall.style.display = 'none';
            }
        }, 300);
    }
});

// 开始一天记录
async function startDay() {
    if (appState.dayStarted) {
        alert('已经开始了新的一天记录！');
        return;
    }
    
    appState.dayStarted = true;
    appState.T0 = new Date();
    
    // 启动提醒定时器
    startReminderTimer();
    
    // 通知主进程更新状态
    try {
        await ipcRenderer.invoke('start-day');
        await ipcRenderer.invoke('update-t0', appState.T0.toISOString());
    } catch (error) {
        console.error('更新应用状态失败:', error);
    }
    
    // 清空昨天的活动展示（仅界面）
    if (activityHistory) {
        activityHistory.innerHTML = '<p class="placeholder">暂无活动记录</p>';
    }
    appState.activities = [];
    
    updateActivityHistory();
    updateChart();
    alert(`已开始记录，起始时间: ${appState.T0.toLocaleString()}`);
}

// 启动提醒定时器
function startReminderTimer() {
    // 清除已存在的定时器
    if (reminderTimer) {
        clearInterval(reminderTimer);
    }
    
    // 启动新的定时器
    if (reminderSettings.enabled) {
        reminderTimer = setInterval(() => {
            showReminderNotification();
        }, reminderSettings.interval * 60 * 1000); // 转换为毫秒
    }
}

// 显示提醒通知
function showReminderNotification() {
    // 请求主进程显示提醒弹窗
    ipcRenderer.invoke('show-reminder-notification');
    
    // 显示主窗口以便用户操作
    ipcRenderer.invoke('show-main-window');
}

// 创建提醒设置按钮
function createReminderSettingsButton() {
    // 在控制面板中添加提醒设置按钮
    const controlPanel = document.querySelector('.control-panel');
    if (controlPanel) {
        const reminderBtn = document.createElement('button');
        reminderBtn.id = 'reminderSettingsBtn';
        reminderBtn.className = 'btn';
        reminderBtn.textContent = '提醒设置';
        reminderBtn.addEventListener('click', showReminderSettings);
        controlPanel.appendChild(reminderBtn);
    }
}

// 显示提醒设置弹窗
function showReminderSettings() {
    // 创建提醒设置弹窗
    const settingsModal = document.createElement('div');
    settingsModal.id = 'reminderSettingsModal';
    settingsModal.className = 'modal';
    settingsModal.style.display = 'block';
    
    settingsModal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>提醒设置</h2>
            <form id="reminderSettingsForm">
                <div class="form-group">
                    <label for="reminderInterval">提醒间隔（分钟）:</label>
                    <input type="number" id="reminderInterval" min="1" max="120" value="${reminderSettings.interval}" required>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="reminderEnabled" ${reminderSettings.enabled ? 'checked' : ''}>
                        启用提醒功能
                    </label>
                </div>
                <button type="submit" class="btn primary">保存设置</button>
            </form>
        </div>
    `;
    
    document.body.appendChild(settingsModal);
    
    // 添加关闭事件
    const closeBtn = settingsModal.querySelector('.close');
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(settingsModal);
    });
    
    // 点击背景关闭
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            document.body.removeChild(settingsModal);
        }
    });
    
    // 表单提交事件
    const settingsForm = document.getElementById('reminderSettingsForm');
    settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const interval = parseInt(document.getElementById('reminderInterval').value);
        const enabled = document.getElementById('reminderEnabled').checked;
        
        if (interval >= 1 && interval <= 120) {
            reminderSettings.interval = interval;
            reminderSettings.enabled = enabled;
            
            // 更新定时器
            if (appState.dayStarted) {
                startReminderTimer();
            }
            
            document.body.removeChild(settingsModal);
            alert('提醒设置已保存！');
        } else {
            alert('提醒间隔必须在1-120分钟之间');
        }
    });
}

// 记录活动
async function saveActivity(e) {
    e.preventDefault();
    
    if (!appState.dayStarted) {
        alert('请先点击"开始一天记录"！');
        return;
    }
    
    const activitySource = document.getElementById('activitySource').value;
    let activityName = '';
    
    if (activitySource === 'manual') {
        activityName = document.getElementById('activityName').value;
    } else {
        const selectedTask = document.getElementById('selectedTask');
        activityName = selectedTask.value;
        if (!activityName) {
            alert('请选择一个待办事项！');
            return;
        }
    }
    
    const activityCategory = document.getElementById('activityCategory').value;
    const T1 = new Date();
    
    const activity = {
        id: Date.now(),
        name: activityName,
        category: activityCategory,
        T0: appState.T0.toISOString(),
        T1: T1.toISOString(),
        duration: Math.floor((T1 - appState.T0) / 60000) // 分钟
    };
    
    try {
        await ipcRenderer.invoke('add-activity', activity);
        appState.activities.push(activity);
        updateActivityHistory();
        updateChart();
        
        // 重置表单和关闭弹窗
        activityForm.reset();
        activityModal.style.display = 'none';
        
        // 更新T0为当前时间，为下一次记录做准备
        appState.T0 = T1;
        // 通知主进程更新T0
        await ipcRenderer.invoke('update-t0', T1.toISOString());
        
        // 最小化窗口以显示悬浮球
        ipcRenderer.invoke('minimize-window');
    } catch (error) {
        console.error('保存活动失败:', error);
        alert('保存活动失败，请重试');
    }
}

// 更新活动历史展示
function updateActivityHistory() {
    if (!activityHistory) return;
    
    if (appState.activities.length === 0) {
        activityHistory.innerHTML = '<p class="placeholder">暂无活动记录</p>';
        return;
    }
    
    activityHistory.innerHTML = '';
    appState.activities.forEach(activity => {
        const T0 = new Date(activity.T0);
        const T1 = new Date(activity.T1);
        
        const activityElement = document.createElement('div');
        activityElement.className = 'activity-item';
        activityElement.innerHTML = `
            <div>
                <strong>${activity.name}</strong> 
                <span class="category">[${activity.category}]</span>
            </div>
            <div>
                ${T0.toLocaleTimeString()} - ${T1.toLocaleTimeString()} 
                (${activity.duration}分钟)
            </div>
        `;
        activityHistory.appendChild(activityElement);
    });
}

// 添加待办事项
async function saveTask(e) {
    e.preventDefault();
    
    const taskName = document.getElementById('taskName').value;
    
    const task = {
        id: Date.now(),
        name: taskName,
        completed: false,
        createdAt: new Date().toISOString()
    };
    
    try {
        await ipcRenderer.invoke('add-task', task);
        appState.tasks.push(task);
        updateTaskList();
        
        // 重置表单和关闭弹窗
        taskForm.reset();
        taskModal.style.display = 'none';
    } catch (error) {
        console.error('添加任务失败:', error);
        alert('添加任务失败，请重试');
    }
}

// 更新待办事项列表
function updateTaskList() {
    if (!taskList) return;
    
    if (appState.tasks.length === 0) {
        taskList.innerHTML = '<p class="placeholder">暂无待办事项</p>';
        return;
    }
    
    taskList.innerHTML = '';
    appState.tasks.forEach(task => {
        const taskElement = document.createElement('div');
        taskElement.className = 'task-item';
        taskElement.innerHTML = `
            <div>
                <span>${task.name}</span>
            </div>
            <div class="task-actions">
                ${!task.completed ? `<button class="complete-btn" data-id="${task.id}">完成</button>` : ''}
                <button class="delete-btn" data-id="${task.id}">删除</button>
            </div>
        `;
        taskList.appendChild(taskElement);
    });
    
    // 绑定完成和删除按钮事件
    document.querySelectorAll('.complete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const taskId = parseInt(e.target.dataset.id);
            completeTask(taskId);
        });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const taskId = parseInt(e.target.dataset.id);
            deleteTask(taskId);
        });
    });
    
    // 如果活动模态框是打开的，则更新任务选择列表
    if (activityModal && activityModal.style.display === 'block') {
        updateTaskSelection();
    }
}

// 完成任务
async function completeTask(taskId) {
    try {
        await ipcRenderer.invoke('complete-task', taskId);
        
        // 更新本地状态
        const taskIndex = appState.tasks.findIndex(task => task.id === taskId);
        if (taskIndex !== -1) {
            const task = appState.tasks[taskIndex];
            task.completed = true;
            task.completedAt = new Date().toISOString();
            
            // 移动到已完成任务列表
            appState.completedTasks.push(...appState.tasks.splice(taskIndex, 1));
            updateTaskList();
            updateCompletedTasks();
            
            // 如果活动模态框是打开的，则更新任务选择列表
            if (activityModal && activityModal.style.display === 'block') {
                updateTaskSelection();
            }
        }
    } catch (error) {
        console.error('完成任务失败:', error);
        alert('完成任务失败，请重试');
    }
}

// 删除任务
async function deleteTask(taskId) {
    try {
        await ipcRenderer.invoke('delete-task', taskId);
        
        // 更新本地状态
        appState.tasks = appState.tasks.filter(task => task.id !== taskId);
        appState.completedTasks = appState.completedTasks.filter(task => task.id !== taskId);
        updateTaskList();
        updateCompletedTasks();
        
        // 如果活动模态框是打开的，则更新任务选择列表
        if (activityModal && activityModal.style.display === 'block') {
            updateTaskSelection();
        }
    } catch (error) {
        console.error('删除任务失败:', error);
        alert('删除任务失败，请重试');
    }
}

// 更新已完成任务列表
function updateCompletedTasks() {
    if (!completedTasks) return;
    
    if (appState.completedTasks.length === 0) {
        completedTasks.innerHTML = '<p class="placeholder">暂无已完成事项</p>';
        return;
    }
    
    completedTasks.innerHTML = '';
    appState.completedTasks.forEach(task => {
        const completedAt = new Date(task.completedAt);
        
        const taskElement = document.createElement('div');
        taskElement.className = 'task-item';
        taskElement.innerHTML = `
            <div>
                <span>${task.name}</span>
                <small>完成于 ${completedAt.toLocaleString()}</small>
            </div>
            <div class="task-actions">
                <button class="delete-btn" data-id="${task.id}">删除</button>
            </div>
        `;
        completedTasks.appendChild(taskElement);
    });
    
    // 绑定删除按钮事件
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const taskId = parseInt(e.target.dataset.id);
            deleteTask(taskId);
        });
    });
}

// 加载已完成任务（根据筛选条件）
async function loadCompletedTasks(filter) {
    try {
        appState.completedTasks = await ipcRenderer.invoke('get-completed-tasks-by-filter', filter);
        updateCompletedTasks();
    } catch (error) {
        console.error('加载已完成任务失败:', error);
    }
}

// 结束一天记录
function endDay() {
    if (!appState.dayStarted) {
        alert('还没有开始记录一天！');
        return;
    }
    
    // 显示今天的活动总结
    showTodayActivitiesSummary();
    
    // 显示未完成任务表单
    showUnfinishedTasksForm();
    
    // 显示弹窗
    endDayModal.style.display = 'block';
    
    // 确保模态框内容可以滚动
    const modalContent = endDayModal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.scrollTop = 0;
    }
}

// 显示今天的活动总结
function showTodayActivitiesSummary() {
    if (!todayActivitiesSummary) return;
    
    if (appState.activities.length === 0) {
        todayActivitiesSummary.innerHTML = '<p>今天没有记录任何活动。</p>';
        return;
    }
    
    let summaryHTML = '<h3>今日活动总结</h3><div class="activity-summary">';
    appState.activities.forEach(activity => {
        const T0 = new Date(activity.T0);
        const T1 = new Date(activity.T1);
        
        summaryHTML += `
            <div>
                <strong>${activity.name}</strong> [${activity.category}] - 
                ${T0.toLocaleTimeString()} 至 ${T1.toLocaleTimeString()} 
                (${activity.duration}分钟)
            </div>
        `;
    });
    summaryHTML += '</div>';
    
    todayActivitiesSummary.innerHTML = summaryHTML;
}

// 显示未完成任务表单
function showUnfinishedTasksForm() {
    if (!unfinishedTasksForm) return;
    
    const unfinishedTasks = appState.tasks.filter(task => !task.completed);
    
    if (unfinishedTasks.length === 0) {
        unfinishedTasksForm.innerHTML = '<p>所有任务都已完成！</p>';
        return;
    }
    
    let formHTML = '<h3>请输入未完成任务进度</h3>';
    unfinishedTasks.forEach(task => {
        formHTML += `
            <div class="unfinished-task">
                <label>${task.name}</label>
                <input type="number" min="0" max="100" placeholder="完成进度%" data-task-id="${task.id}" required>
            </div>
        `;
    });
    
    unfinishedTasksForm.innerHTML = formHTML;
}

// 确认结束一天
async function confirmEndDay() {
    const unfinishedTasks = appState.tasks.filter(task => !task.completed);
    const progressInputs = document.querySelectorAll('#unfinishedTasksForm input');
    
    // 检查是否所有未完成任务都填写了进度
    let allFilled = true;
    const progressData = [];
    progressInputs.forEach(input => {
        const taskId = parseInt(input.dataset.taskId);
        const progress = parseInt(input.value);
        
        if (!input.value || isNaN(progress) || progress < 0 || progress > 100) {
            allFilled = false;
        } else {
            progressData.push({ taskId, progress });
        }
    });
    
    if (unfinishedTasks.length > 0 && !allFilled) {
        alert('请为所有未完成任务输入0-100的进度值！');
        return;
    }
    
    // 保存进度信息到数据库
    try {
        // 为每个未完成任务创建记录
        for (const { taskId, progress } of progressData) {
            const task = appState.tasks.find(t => t.id === taskId);
            if (task) {
                // 创建一个特殊的活动记录来表示未完成任务的进度
                const progressActivity = {
                    id: Date.now() + Math.random(), // 确保ID唯一
                    name: `未完成任务: ${task.name} (${progress}%)`,
                    category: 'unfinished',
                    T0: new Date().toISOString(),
                    T1: new Date().toISOString(),
                    duration: 0,
                    progress: progress,
                    relatedTaskId: taskId
                };
                
                await ipcRenderer.invoke('add-activity', progressActivity);
                appState.activities.push(progressActivity);
            }
        }
        
        // 发送结束一天信号到主进程
        await ipcRenderer.invoke('end-day');
    } catch (error) {
        console.error('结束一天记录失败:', error);
    }
    
    // 重置状态
    appState.dayStarted = false;
    appState.T0 = null;
    // 注意：不清空活动列表，以便在图表中显示当天的所有活动
    
    // 更新界面
    updateActivityHistory();
    updateChart();
    
    // 关闭弹窗
    endDayModal.style.display = 'none';
    
    alert('已结束一天记录！');
}

// 更新图表
function updateChart() {
    if (!timeChart || !chartContainer) return;
    
    // 设置画布大小
    timeChart.width = chartContainer.clientWidth;
    timeChart.height = chartContainer.clientHeight;
    
    // 清除之前的图表
    const ctx = timeChart.getContext('2d');
    ctx.clearRect(0, 0, timeChart.width, timeChart.height);
    
    if (appState.activities.length === 0 && !appState.dayStarted) {
        // 显示提示信息
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#999';
        ctx.fillText('暂无数据', timeChart.width/2, timeChart.height/2);
        return;
    }
    
    // 根据视图类型绘制图表
    if (chartState.viewType === 'timeline') {
        drawTimelineChart(ctx);
    } else {
        drawCategoryChart(ctx);
    }
}

// 绘制时间线图表
function drawTimelineChart(ctx) {
    const margin = { top: 40, right: 20, bottom: 60, left: 80 };
    const chartWidth = timeChart.width - margin.left - margin.right;
    const chartHeight = timeChart.height - margin.top - margin.bottom;
    
    // 获取时间范围
    let startTime, endTime;
    if (appState.T0) {
        startTime = new Date(appState.T0);
    } else if (appState.activities.length > 0) {
        startTime = new Date(appState.activities[0].T0);
    } else {
        startTime = new Date();
        startTime.setHours(0, 0, 0, 0); // 设置为当天开始
    }
    
    // 将开始时间调整为整点
    const startHour = new Date(startTime);
    startHour.setMinutes(0, 0, 0);
    
    if (appState.activities.length > 0) {
        endTime = new Date(appState.activities[appState.activities.length - 1].T1);
    } else {
        endTime = new Date();
    }
    
    // 如果一天已经开始但还没有活动记录，将结束时间设为当前时间
    if (appState.dayStarted && appState.activities.length === 0) {
        endTime = new Date();
    }
    
    // 如果一天已经开始，确保时间线从开始时间延续到现在
    if (appState.dayStarted) {
        startTime = appState.T0 ? new Date(appState.T0) : new Date();
        endTime = new Date(); // 结束时间为当前时间
    }
    
    // 确保结束时间至少比开始时间晚一个小时
    if (endTime <= startHour) {
        endTime = new Date(startHour.getTime() + 60 * 60 * 1000);
    }
    
    // 计算时间范围（小时数）
    const totalHours = Math.ceil((endTime - startHour) / (1000 * 60 * 60));
    const endHour = new Date(startHour.getTime() + totalHours * 60 * 60 * 1000);
    
    // 纵坐标固定为60分钟
    const totalDurationMinutes = 60;
    const pixelsPerMinute = chartHeight / totalDurationMinutes;
    
    // 绘制坐标轴
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    
    // X轴 (时间轴)
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top + chartHeight);
    ctx.lineTo(margin.left + chartWidth, margin.top + chartHeight);
    ctx.stroke();
    
    // Y轴 
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + chartHeight);
    ctx.stroke();
    
    // 绘制X轴标签和网格线 (小时)
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    
    // 计算每小时的宽度
    const pixelsPerHour = chartWidth / totalHours;
    
    for (let h = 0; h <= totalHours; h++) {
        const currentHour = new Date(startHour.getTime() + h * 60 * 60 * 1000);
        const x = margin.left + h * pixelsPerHour;
        
        // 绘制网格线
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, margin.top + chartHeight);
        ctx.stroke();
        
        // 绘制时间标签
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.fillText(
            currentHour.getHours().toString().padStart(2, '0') + ':00',
            x,
            margin.top + chartHeight + 20
        );
        
        // 绘制刻度线
        ctx.beginPath();
        ctx.moveTo(x, margin.top + chartHeight);
        ctx.lineTo(x, margin.top + chartHeight + 5);
        ctx.stroke();
    }
    
    // 绘制Y轴标签 (每60分钟一格，固定为0和60)
    ctx.textAlign = 'right';
    
    // 绘制0分钟线
    const y0 = margin.top + chartHeight;
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, y0);
    ctx.lineTo(margin.left + chartWidth, y0);
    ctx.stroke();
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.fillText(
        '0分钟',
        margin.left - 10,
        y0 + 4
    );
    
    ctx.beginPath();
    ctx.moveTo(margin.left - 5, y0);
    ctx.lineTo(margin.left, y0);
    ctx.stroke();
    
    // 绘制60分钟线
    const y60 = margin.top;
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, y60);
    ctx.lineTo(margin.left + chartWidth, y60);
    ctx.stroke();
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.fillText(
        '60分钟',
        margin.left - 10,
        y60 + 4
    );
    
    ctx.beginPath();
    ctx.moveTo(margin.left - 5, y60);
    ctx.lineTo(margin.left, y60);
    ctx.stroke();
    
    // 绘制活动条
    appState.activities.forEach((activity, index) => {
        // 特殊处理未完成任务进度记录
        if (activity.progress !== undefined) {
            return; // 暂时不显示进度记录在时间线上
        }
        
        const T0 = new Date(activity.T0);
        const T1 = new Date(activity.T1);
        
        // 计算活动在图表中的位置
        const startTotalMinutes = (T0 - startHour) / (1000 * 60);
        const endTotalMinutes = (T1 - startHour) / (1000 * 60);
        
        const startHourIndex = Math.floor(startTotalMinutes / 60);
        const endHourIndex = Math.floor(endTotalMinutes / 60);
        
        const startMinuteInHour = startTotalMinutes % 60;
        const endMinuteInHour = endTotalMinutes % 60;
        
        // 如果活动跨越多个小时，则需要分段绘制
        for (let hourIndex = startHourIndex; hourIndex <= endHourIndex; hourIndex++) {
            let minuteStart, minuteEnd;
            
            if (hourIndex === startHourIndex) {
                minuteStart = startMinuteInHour;
            } else {
                minuteStart = 0;
            }
            
            if (hourIndex === endHourIndex) {
                minuteEnd = endMinuteInHour;
            } else {
                minuteEnd = 60;
            }
            
            // 计算位置
            const x = margin.left + hourIndex * pixelsPerHour;
            const barWidth = pixelsPerHour;
            const y = margin.top + chartHeight - minuteEnd * pixelsPerMinute;
            const barHeight = (minuteEnd - minuteStart) * pixelsPerMinute;
            
            // 确保位置有效
            if (x >= margin.left && x <= margin.left + chartWidth && barHeight > 0) {
                // 绘制活动条
                ctx.fillStyle = getCategoryColor(activity.category);
                ctx.fillRect(x, y, barWidth, barHeight);
                
                // 绘制边框
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, barWidth, barHeight);
                
                // 如果时间段足够大，绘制活动名称
                if (barHeight > 15 && barWidth > 30) {
                    ctx.fillStyle = '#fff';
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'left';
                    
                    // 截断过长的文本
                    let displayName = activity.name;
                    if (ctx.measureText(displayName).width > barWidth - 10) {
                        while (ctx.measureText(displayName + '...').width > barWidth - 10 && displayName.length > 0) {
                            displayName = displayName.slice(0, -1);
                        }
                        displayName += '...';
                    }
                    
                    ctx.fillText(
                        displayName,
                        x + 5,
                        y + barHeight/2 + 3
                    );
                }
            }
        }
    });
    
    // 如果一天已经开始，绘制当前活动
    if (appState.dayStarted && appState.T0) {
        const T0 = new Date(appState.T0);
        const T1 = new Date();
        
        const startTotalMinutes = (T0 - startHour) / (1000 * 60);
        const endTotalMinutes = (T1 - startHour) / (1000 * 60);
        
        const startHourIndex = Math.floor(startTotalMinutes / 60);
        const endHourIndex = Math.floor(endTotalMinutes / 60);
        
        const startMinuteInHour = startTotalMinutes % 60;
        const endMinuteInHour = endTotalMinutes % 60;
        
        // 如果当前活动跨越多个小时，则需要分段绘制
        for (let hourIndex = startHourIndex; hourIndex <= endHourIndex; hourIndex++) {
            let minuteStart, minuteEnd;
            
            if (hourIndex === startHourIndex) {
                minuteStart = startMinuteInHour;
            } else {
                minuteStart = 0;
            }
            
            if (hourIndex === endHourIndex) {
                minuteEnd = endMinuteInHour;
            } else {
                minuteEnd = 60;
            }
            
            // 计算位置
            const x = margin.left + hourIndex * pixelsPerHour;
            const barWidth = pixelsPerHour;
            const y = margin.top + chartHeight - minuteEnd * pixelsPerMinute;
            const barHeight = (minuteEnd - minuteStart) * pixelsPerMinute;
            
            // 确保位置有效
            if (x >= margin.left && x <= margin.left + chartWidth && barHeight > 0) {
                // 绘制当前活动条（半透明）
                ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
                ctx.fillRect(x, y, barWidth, barHeight);
                
                // 绘制边框
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, barWidth, barHeight);
                
                // 如果时间段足够大，绘制活动名称
                if (barHeight > 15 && barWidth > 30) {
                    ctx.fillStyle = '#000';
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(
                        '当前活动',
                        x + 5,
                        y + barHeight/2 + 3
                    );
                }
            }
        }
    }
    
    // 绘制标题
    ctx.fillStyle = '#000';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('时间线活动分布', timeChart.width / 2, 20);
    
    // 绘制X轴标题
    ctx.fillText('时间 (小时)', timeChart.width / 2, timeChart.height - 10);
    
    // 绘制Y轴标题
    ctx.save();
    ctx.translate(20, timeChart.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('分钟', 0, 0);
    ctx.restore();
    
    // 绘制图例
    drawLegend(ctx, margin, chartWidth, chartHeight);
}

// 绘制类别统计图表
function drawCategoryChart(ctx) {
    const margin = { top: 40, right: 20, bottom: 60, left: 80 };
    const chartWidth = timeChart.width - margin.left - margin.right;
    const chartHeight = timeChart.height - margin.top - margin.bottom;
    
    // 按类别统计时间
    const categoryStats = {};
    appState.activities.forEach(activity => {
        if (!categoryStats[activity.category]) {
            categoryStats[activity.category] = 0;
        }
        categoryStats[activity.category] += activity.duration;
    });
    
    // 如果一天已经开始，添加当前活动的时间
    if (appState.dayStarted && appState.T0) {
        const currentDuration = (new Date() - new Date(appState.T0)) / (1000 * 60);
        // 将当前活动归类为"当前"类别
        categoryStats['当前活动'] = (categoryStats['当前活动'] || 0) + currentDuration;
    }
    
    const categories = Object.keys(categoryStats);
    const durations = Object.values(categoryStats);
    const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
    
    if (totalDuration <= 0 || categories.length === 0) {
        // 显示提示信息
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#999';
        ctx.fillText('暂无数据', timeChart.width/2, timeChart.height/2);
        return;
    }
    
    // 绘制简单的柱状图
    const barWidth = chartWidth / (categories.length + 1);
    const maxDuration = Math.max(...durations);
    
    // 绘制Y轴
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + chartHeight);
    ctx.stroke();
    
    // 绘制X轴
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top + chartHeight);
    ctx.lineTo(margin.left + chartWidth, margin.top + chartHeight);
    ctx.stroke();
    
    // 绘制Y轴标签和网格线
    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
        const y = margin.top + chartHeight - (i / ySteps) * chartHeight;
        
        // 绘制网格线
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(margin.left + chartWidth, y);
        ctx.stroke();
        
        // 绘制标签
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        const labelValue = Math.round((i / ySteps) * maxDuration);
        ctx.fillText(labelValue, margin.left - 10, y + 4);
        
        // 绘制刻度线
        ctx.beginPath();
        ctx.moveTo(margin.left - 5, y);
        ctx.lineTo(margin.left, y);
        ctx.stroke();
    }
    
    // 绘制柱状图
    categories.forEach((category, index) => {
        const barHeight = (categoryStats[category] / maxDuration) * chartHeight;
        const x = margin.left + (index + 1) * barWidth;
        const y = margin.top + chartHeight - barHeight;
        
        // 绘制柱子
        ctx.fillStyle = getCategoryColor(category);
        ctx.fillRect(x - barWidth/3, y, barWidth/1.5, barHeight);
        
        // 绘制边框
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - barWidth/3, y, barWidth/1.5, barHeight);
        
        // 绘制类别标签
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        
        // 截断过长的标签
        let displayCategory = category;
        if (ctx.measureText(displayCategory).width > barWidth) {
            while (ctx.measureText(displayCategory + '..').width > barWidth && displayCategory.length > 0) {
                displayCategory = displayCategory.slice(0, -1);
            }
            displayCategory += '..';
        }
        
        ctx.fillText(displayCategory, x, margin.top + chartHeight + 20);
        
        // 绘制时间标签
        ctx.fillText(`${Math.round(categoryStats[category])}分钟`, x, y - 10);
    });
    
    // 绘制标题
    ctx.fillStyle = '#000';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('各类别时间分配', timeChart.width / 2, 20);
    
    // 绘制Y轴标题
    ctx.save();
    ctx.translate(20, timeChart.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('时间 (分钟)', 0, 0);
    ctx.restore();
    
    // 绘制图例
    drawLegend(ctx, margin, chartWidth, chartHeight);
}

// 绘制图例
function drawLegend(ctx, margin, chartWidth, chartHeight) {
    const allActivities = [...appState.activities];
    
    // 如果一天已经开始，添加当前活动到图例
    if (appState.dayStarted) {
        allActivities.push({category: '当前活动'});
    }
    
    const categories = [...new Set(allActivities.map(a => a.category))];
    const legendX = margin.left + chartWidth - 150;
    const legendY = margin.top + 20;
    
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    
    categories.forEach((category, index) => {
        const y = legendY + index * 20;
        
        // 绘制颜色方块
        ctx.fillStyle = getCategoryColor(category);
        ctx.fillRect(legendX, y, 15, 15);
        
        // 绘制边框
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(legendX, y, 15, 15);
        
        // 绘制类别名称
        ctx.fillStyle = '#000';
        ctx.fillText(category, legendX + 20, y + 12);
    });
}

// 获取类别颜色
function getCategoryColor(category) {
    const colors = {
        'work': '#4a6fa5',
        'study': '#4caf50',
        'rest': '#ff9800',
        'exercise': '#9c27b0',
        'entertainment': '#f44336',
        'other': '#9e9e9e',
        '当前活动': '#607d8b'
    };
    return colors[category] || '#333';
}

// 初始化应用
document.addEventListener('DOMContentLoaded', async () => {
    await loadInitialData();
    updateActivityHistory();
    updateTaskList();
    updateCompletedTasks();
    
    // 检查是否需要恢复状态
    await checkAndRestoreState();
    
    // 更新图表
    updateChart();
});

// 加载初始数据
async function loadInitialData() {
    try {
        appState.activities = await ipcRenderer.invoke('get-activities');
        appState.tasks = await ipcRenderer.invoke('get-tasks');
        appState.completedTasks = await ipcRenderer.invoke('get-completed-tasks');
    } catch (error) {
        console.error('加载数据失败:', error);
    }
}

// 检查并恢复状态
async function checkAndRestoreState() {
    try {
        const state = await ipcRenderer.invoke('get-app-state');
        if (state.isDayStarted) {
            appState.dayStarted = true;
            if (state.lastT0) {
                appState.T0 = new Date(state.lastT0);
            } else {
                // 如果没有上次的T0，使用当前时间
                appState.T0 = new Date();
            }
            console.log('恢复未结束的一天记录状态');
        }
    } catch (error) {
        console.error('检查和恢复状态失败:', error);
    }
}

// 窗口大小改变时重绘图表
window.addEventListener('resize', () => {
    updateChart();
});