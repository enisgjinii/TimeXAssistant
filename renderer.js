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

    activities.forEach((activity, index) => {
        if (activity.timestamp.toDateString() === selectedDate.toDateString()) {
            const nextActivity = activities[index + 1];
            const duration = nextActivity
                ? (nextActivity.timestamp - activity.timestamp) / (1000 * 60)
                : 1;

            summary.totalTime += duration;

            if (!summary.startTime || activity.timestamp < summary.startTime) {
                summary.startTime = activity.timestamp;
            }
            if (!summary.endTime || activity.timestamp > summary.endTime) {
                summary.endTime = activity.timestamp;
            }

            if (summary.topActivities[activity.title]) {
                summary.topActivities[activity.title] += duration;
            } else {
                summary.topActivities[activity.title] = duration;
            }
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
    const timelineData = activities.reduce((acc, activity, index) => {
        if (activity.timestamp.toDateString() === selectedDate.toDateString()) {
            const nextActivity = activities[index + 1];
            const duration = nextActivity
                ? (nextActivity.timestamp - activity.timestamp) / (1000 * 60)
                : 1;

            if (duration > 1) {
                acc.timeline.push({
                    startHour: activity.hour,
                    startMinute: activity.minute,
                    duration: Math.ceil(duration),
                    title: activity.title,
                    additional_info: activity.additional_info,
                    time: formatTime(activity.timestamp)
                });
            }
        }
        return acc;
    }, { timeline: [] });

    state.summary = calculateSummary(activities, selectedDate);
    return timelineData;
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
        label.className = 'flex items-center text-gray-400 time-label';
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

function renderActivity(hourBlock, activity) {
    const activityBlock = document.createElement('div');
    activityBlock.className = 'bg-green-500 absolute activity-block text-xs px-2 py-1 rounded-md shadow-md overflow-hidden';

    const startMinutePercentage = (activity.startMinute / 60) * 100;
    const heightPercentage = (activity.duration / 60) * 100;

    Object.assign(activityBlock.style, {
        top: `${startMinutePercentage}%`,
        height: `${heightPercentage}%`,
        left: '0',
        right: '0',
        zIndex: '1'
    });

    const titleBlock = document.createElement('div');
    titleBlock.textContent = `${activity.title} (${activity.time})`;
    titleBlock.className = 'font-bold';
    activityBlock.appendChild(titleBlock);

    if (activity.additional_info) {
        const infoBlock = document.createElement('div');
        infoBlock.className = 'text-xs text-gray-200';
        infoBlock.textContent = `Info: ${activity.additional_info}`;
        activityBlock.appendChild(infoBlock);
    }

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

function renderView() {
    const processedData = processActivities(state.activities, state.currentDate);
    renderTimeLabels();
    renderTimeline(processedData);
    renderSummary(state.summary);
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
