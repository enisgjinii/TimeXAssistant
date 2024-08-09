const { ipcRenderer } = require('electron');
const fs = require('fs');
const fsPromises = require('fs').promises;
const csv = require('csv-parser');
// Constants
const ZOOM_LEVELS = {
    MIN: 0.5,
    MAX: 4,
    STEP: 0.5,
    DEFAULT: 1
};
const HOUR_HEIGHT = 60; // pixels
// State
let state = {
    zoomLevel: ZOOM_LEVELS.DEFAULT,
    activities: [],
    currentDate: new Date(),
    currentDay: new Date().getDay(),
    summary: {}
};
// Utility functions
const createStreamFromFile = (filePath) => fs.createReadStream(filePath);
const parseTimestamp = (timestamp) => new Date(timestamp);
const formatTime = (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const formatDate = (date) => date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
// Main functions
async function parseActivityLog(filePath) {
    return new Promise((resolve, reject) => {
        const activities = [];
        createStreamFromFile(filePath)
            .pipe(csv())
            .on('data', (row) => {
                try {
                    const timestamp = parseTimestamp(row.timestamp);
                    // Added logging to check parsed activities
                    console.log('Parsed activity:', row.title);
                    activities.push({
                        day: timestamp.getDay(),
                        hour: timestamp.getHours(),
                        minute: timestamp.getMinutes(),
                        title: row.title,
                        process_id: row.process_id,
                        additional_info: row.additional_info,
                        timestamp
                    });
                } catch (error) {
                    console.error('Error parsing row:', error);
                }
            })
            .on('end', () => resolve(activities))
            .on('error', (error) => reject(error));
    });
}
function calculateSummary(activities, selectedDate) {
    const summary = {
        totalTime: 0,
        topActivities: {},
        startTime: null,
        endTime: null
    };
    activities.forEach((activity) => {
        summary.totalTime += activity.duration;
        if (!summary.startTime || activity.timestamp < summary.startTime) {
            summary.startTime = activity.timestamp;
        }
        if (!summary.endTime || activity.timestamp > summary.endTime) {
            summary.endTime = activity.timestamp;
        }
        if (summary.topActivities[activity.title]) {
            summary.topActivities[activity.title] += activity.duration;
        } else {
            summary.topActivities[activity.title] = activity.duration;
        }
    });
    // Sort top activities
    summary.topActivities = Object.entries(summary.topActivities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .reduce((obj, [key, value]) => {
            obj[key] = value;
            return obj;
        }, {});
    return summary;
}
function processActivities(activities, selectedDate) {
    const dailyActivities = activities.filter(activity =>
        activity.timestamp.toDateString() === selectedDate.toDateString()
    );
    const aggregatedActivities = aggregateActivities(dailyActivities);
    const timelineData = aggregatedActivities.map(activity => ({
        startHour: activity.hour,
        startMinute: activity.minute,
        duration: Math.ceil(activity.duration),
        title: activity.title,
        additional_info: activity.additional_info,
        time: formatTime(activity.timestamp)
    }));
    state.summary = calculateSummary(aggregatedActivities, selectedDate);
    return { timeline: timelineData };
}
function handleZoom(zoomIn) {
    const newZoomLevel = zoomIn
        ? Math.min(state.zoomLevel + ZOOM_LEVELS.STEP, ZOOM_LEVELS.MAX)
        : Math.max(state.zoomLevel - ZOOM_LEVELS.STEP, ZOOM_LEVELS.MIN);
    if (newZoomLevel !== state.zoomLevel) {
        state.zoomLevel = newZoomLevel;
        renderView();
    }
}
function renderTimeLabels() {
    const timeLabelsContainer = document.getElementById('time-labels');
    timeLabelsContainer.innerHTML = '';
    for (let hour = 0; hour < 24; hour++) {
        const label = document.createElement('div');
        label.className = 'flex items-center justify-end pr-2 text-gray-400 time-label rounded';
        label.style.height = `${HOUR_HEIGHT * state.zoomLevel}px`;
        label.textContent = `${hour.toString().padStart(2, '0')}:00`;
        timeLabelsContainer.appendChild(label);
    }
}
function renderTimeline(data) {
    const timelineContainer = document.getElementById('timeline');
    timelineContainer.innerHTML = '';
    for (let hour = 0; hour < 24; hour++) {
        const hourBlock = document.createElement('div');
        hourBlock.className = 'bg-gray-700 relative timeline-hour';
        hourBlock.style.height = `${HOUR_HEIGHT * state.zoomLevel}px`;
        const activities = data.timeline.filter(item => item.startHour === hour);
        activities.forEach(renderActivity.bind(null, hourBlock));
        timelineContainer.appendChild(hourBlock);
    }
}
function aggregateActivities(activities, threshold = 60000) { // threshold in milliseconds (1 minute)
    const aggregated = [];
    let currentActivity = null;
    activities.forEach((activity, index) => {
        if (!currentActivity) {
            currentActivity = { ...activity, duration: 0 };
        }
        const nextActivity = activities[index + 1];
        const timeDiff = nextActivity ? nextActivity.timestamp - activity.timestamp : threshold + 1;
        if (timeDiff <= threshold && activity.title === currentActivity.title) {
            currentActivity.duration += timeDiff / 60000; // Convert to minutes
        } else {
            currentActivity.duration += timeDiff / 60000;
            aggregated.push(currentActivity);
            currentActivity = nextActivity ? { ...nextActivity, duration: 0 } : null;
        }
    });
    return aggregated;
}
function renderActivity(hourBlock, activity) {
    const activityBlock = document.createElement('div');
    const colorClass = getActivityColor(activity.title);
    activityBlock.className = `${colorClass} absolute activity-block`;
    const startMinutePercentage = (activity.startMinute / 60) * 100;
    const heightPercentage = Math.max((activity.duration / 60) * 100, 1);
    Object.assign(activityBlock.style, {
        top: `${startMinutePercentage}%`,
        height: `${heightPercentage}%`,
        left: '0',
        right: '0',
        zIndex: '1'
    });
    // Add a tooltip with activity details
    activityBlock.title = `${activity.title}\nTime: ${activity.time}\nDuration: ${Math.round(activity.duration)} minutes`;
    hourBlock.appendChild(activityBlock);
}
function renderSummary(summary) {
    const summaryContainer = document.getElementById('summary-container');
    summaryContainer.innerHTML = '';
    // Total time
    const totalTimeElement = document.createElement('div');
    totalTimeElement.className = 'bg-gray-200 dark:bg-gray-800 p-4 rounded-lg';
    totalTimeElement.innerHTML = `
        <h2 class="text-xl font-bold mb-2">Total Time</h2>
        <p>${Math.round(summary.totalTime)} minutes</p>
    `;
    summaryContainer.appendChild(totalTimeElement);
    // Time range
    const timeRangeElement = document.createElement('div');
    timeRangeElement.className = 'bg-gray-800 p-4 rounded-lg';
    timeRangeElement.innerHTML = `
        <h2 class="text-xl font-bold mb-2">Time Range</h2>
        <p>${formatTime(summary.startTime)} - ${formatTime(summary.endTime)}</p>
    `;
    summaryContainer.appendChild(timeRangeElement);
    // Top activities
    const topActivitiesElement = document.createElement('div');
    topActivitiesElement.className = 'bg-gray-800 p-4 rounded-lg';
    topActivitiesElement.innerHTML = `
        <h2 class="text-xl font-bold mb-2">Top Activities</h2>
        <ul class="list-disc pl-5">
            ${Object.entries(summary.topActivities)
            .map(([activity, duration]) => `<li>${activity}: ${Math.round(duration)} minutes</li>`)
            .join('')}
        </ul>
    `;
    summaryContainer.appendChild(topActivitiesElement);
    // Activity Distribution Chart
    const activityDistributionElement = document.createElement('div');
    activityDistributionElement.id = 'activity-distribution-chart';
    summaryContainer.appendChild(activityDistributionElement);
    // Hourly Activity Chart
    const hourlyActivityElement = document.createElement('div');
    hourlyActivityElement.id = 'hourly-activity-chart';
    summaryContainer.appendChild(hourlyActivityElement);
}
function changeDate(days) {
    state.currentDate.setDate(state.currentDate.getDate() + days);
    state.currentDay = state.currentDate.getDay();
    updateDateDisplay();
    renderView();
}
function updateDateDisplay() {
    const dateDisplay = document.querySelector('#current-date span');
    dateDisplay.textContent = formatDate(state.currentDate);
}
function initDateNavigation() {
    const prevDayBtn = document.getElementById('prev-day');
    const nextDayBtn = document.getElementById('next-day');
    prevDayBtn.addEventListener('click', () => changeDate(-1));
    nextDayBtn.addEventListener('click', () => changeDate(1));
    updateDateDisplay();
}
// Initialize tooltips after rendering the view
function renderView() {
    const processedData = processActivities(state.activities, state.currentDate);
    renderTimeLabels();
    renderTimeline(processedData);
    renderSummary({
        ...state.summary,
        activities: processedData.timeline
    });
}
function getActivityColor(title) {
    if (title === "Windows Default Lock Screen") {
        return "bg-red-500";
    }
    // You can add more conditions here for other activities
    return "bg-green-500"; // default color
}
function initZoomControls() {
    document.getElementById('zoom-in').addEventListener('click', () => handleZoom(true));
    document.getElementById('zoom-out').addEventListener('click', () => handleZoom(false));
}
// Initialize the application
async function init() {
    try {
        state.activities = await parseActivityLog('activity_log.csv');
        initDateNavigation();
        initZoomControls();
        renderView();
    } catch (error) {
        console.error('Failed to initialize the application:', error);
    }
}
init();
