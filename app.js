// 1. Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAZhKJZe5F3RL_W-m_L_ue6nHyIWZ4cXto",
    authDomain: "classroom-reminder-f55d3.firebaseapp.com",
    projectId: "classroom-reminder-f55d3",
    storageBucket: "classroom-reminder-f55d3.firebasestorage.app",
    messagingSenderId: "278428097217",
    appId: "1:278428097217:web:c709430c1d92a145dc9240",
    measurementId: "G-GN2GC6WTGG"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const loginBtn = document.getElementById('login-btn');
const deadlinesContainer = document.getElementById('deadlines-container');
const academicContainer = document.getElementById('academic-calendar-container');

let activeIntervals = {};

// 2. Persistent Auth State
firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(console.error);

firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        loginBtn.innerText = `Hi, ${user.displayName.split(' ')[0]}`;
        const token = localStorage.getItem('pwa_google_token');
        if (token) fetchClassroomCourses(token);
    } else {
        loginBtn.innerText = "Google Login";
    }
});

loginBtn.addEventListener('click', () => {
    const user = firebase.auth().currentUser;
    if (user && localStorage.getItem('pwa_google_token')) {
        if (confirm("Do you want to log out?")) {
            firebase.auth().signOut().then(() => {
                localStorage.removeItem('pwa_google_token');
                alert("Logged out successfully!");
                window.location.reload();
            });
        }
        return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/classroom.courses.readonly');
    provider.addScope('https://www.googleapis.com/auth/classroom.coursework.me');

    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            const token = result.credential.accessToken;
            localStorage.setItem('pwa_google_token', token);
            loginBtn.innerText = `Hi, ${result.user.displayName.split(' ')[0]}`;
            fetchClassroomCourses(token);
        })
        .catch((err) => alert("Login Error: " + err.message));
});

async function fetchClassroomCourses(token) {
    deadlinesContainer.innerHTML = `<p style="color:#00ff66; text-align:center; grid-column: 1/-1;">Loading Classroom data...</p>`;
    try {
        const res = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401) {
            localStorage.removeItem('pwa_google_token');
            deadlinesContainer.innerHTML = `<p style="color:#ffa500; text-align:center; grid-column: 1/-1;">Session expired. Please log in again.</p>`;
            loginBtn.innerText = "Google Login";
            return;
        }
        const data = await res.json();
        if (data.courses && data.courses.length > 0) {
            deadlinesContainer.innerHTML = '';
            data.courses.forEach(c => fetchCourseAssignments(c.id, c.name, token));
        } else {
            deadlinesContainer.innerHTML = `<p style="color:#aaa; text-align:center; grid-column: 1/-1;">No active courses found.</p>`;
        }
    } catch (err) {
        deadlinesContainer.innerHTML = `<p style="color:red; text-align:center; grid-column: 1/-1;">Failed to fetch courses.</p>`;
    }
}

async function fetchCourseAssignments(courseId, courseName, token) {
    try {
        const res = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.courseWork) {
            data.courseWork.forEach(work => {
                if (work.dueDate) displayDeadlineCard(work, courseName);
            });
        }
    } catch (err) { console.error(err); }
}

function getAssignmentTypeBadge(title) {
    const t = title.toLowerCase();
    if (t.includes('quiz') || t.includes('test') || t.includes('exam')) return { tag: '[Q]', name: 'Quiz/Exam' };
    if (t.includes('tutorial') || t.includes('tut') || t.includes('lab')) return { tag: '[T]', name: 'Tutorial/Lab' };
    return { tag: '[A]', name: 'Assignment' };
}

function getProximityConfig(dueDateObj) {
    const diffHours = (dueDateObj - new Date()) / (1000 * 60 * 60);
    const diffDays = diffHours / 24;

    if (diffHours <= 0) return { soundText: '🚨 EXPIRED', intervalMs: 3600000, urgency: 'EXPIRED' };
    if (diffHours <= 5) return { soundText: '🚨🚨 FINAL WARNING', intervalMs: 1800000, urgency: 'CRITICAL' };
    if (diffHours <= 24) return { soundText: '🚨 URGENT REMINDER', intervalMs: 7200000, urgency: 'VERY HIGH' };
    if (diffDays <= 5) return { soundText: '🔔🔔 UPCOMING DEADLINE', intervalMs: 43200000, urgency: 'MEDIUM' };
    return { soundText: '🔔 ADVANCE NOTICE', intervalMs: 86400000, urgency: 'LOW' };
}

function displayDeadlineCard(work, courseName) {
    const due = work.dueDate;
    const dueTime = work.dueTime || { hours: 23, minutes: 59 };
    const dueDateObj = new Date(due.year, due.month - 1, due.day, dueTime.hours || 23, dueTime.minutes || 59);
    const dueDateStr = `${due.day}/${due.month}/${due.year}`;
    const typeInfo = getAssignmentTypeBadge(work.title);
    const cardId = `card_${work.id || Math.random().toString(36).substr(2, 9)}`;

    const cardHtml = `
        <div class="glass-card" style="border: 1px solid rgba(255,255,255,0.15); padding: 16px; margin: 10px; border-radius: 12px; background: rgba(255,255,255,0.05);">
            <div style="display:flex; justify-content:space-between;">
                <span style="background:#00ff66; color:#000; padding:2px 6px; border-radius:4px; font-weight:bold;">${typeInfo.tag} ${typeInfo.name}</span>
                <span>🔔</span>
            </div>
            <h3 style="margin: 10px 0;">${work.title}</h3>
            <p style="color:#ccc;">Course: ${courseName}</p>
            <div style="color:#00e5ff; font-weight:bold;">Due: ${dueDateStr}</div>
            
            <div id="btn_container_${cardId}" style="margin-top:10px;">
                <button class="btn-secondary" style="width:100%; padding:8px; cursor:pointer;" 
                    onclick="enableSmartBellReminder('${cardId}', '${work.title}', '${dueDateStr}', '${typeInfo.tag}', ${dueDateObj.getTime()})">
                    Set Smart Bell Reminder 🔔
                </button>
            </div>
        </div>
    `;
    deadlinesContainer.insertAdjacentHTML('beforeend', cardHtml);
}

function enableSmartBellReminder(cardId, title, dueDateStr, tag, dueTimestamp) {
    const dueDateObj = new Date(dueTimestamp);

    if ("Notification" in window) {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                const prox = getProximityConfig(dueDateObj);
                alert(`Reminder Activated for ${tag} "${title}"!`);

                new Notification(`${tag} Reminder Set 🔔`, {
                    body: `Assignment: "${title}"\nDue Date: ${dueDateStr}`,
                    icon: 'https://cdn-icons-png.flaticon.com/512/2991/2991112.png'
                });

                if (activeIntervals[cardId]) clearInterval(activeIntervals[cardId]);

                activeIntervals[cardId] = setInterval(() => {
                    const currentProx = getProximityConfig(dueDateObj);
                    new Notification(`${tag} ${currentProx.soundText}`, {
                        body: `Reminder: Due date for "${title}" is ${dueDateStr}`,
                        requireInteraction: true
                    });
                }, prox.intervalMs);

                document.getElementById(`btn_container_${cardId}`).innerHTML = `
                    <button style="width:100%; padding:8px; background:#ff4444; color:white; border:none; border-radius:6px; cursor:pointer;" 
                        onclick="stopReminder('${cardId}', '${title}')">
                        Stop Reminder 🔕
                    </button>
                `;
            } else {
                alert("Please allow notification permissions.");
            }
        });
    }
}

function stopReminder(cardId, title) {
    if (activeIntervals[cardId]) {
        clearInterval(activeIntervals[cardId]);
        delete activeIntervals[cardId];
        alert(`Reminder stopped for "${title}".`);
        window.location.reload();
    }
}

// 3. Academic Calendar Data (Extracted from IIT Jodhpur PDF)
const academicCalendarData = [
    { type: 'exam', title: 'Minor Examination (Sem I)', date: '2026-09-15', detail: '15-20 Sep 2026 (Tue-Sun)' },
    { type: 'exam', title: 'Major Examination (Sem I)', date: '2026-11-19', detail: '19-26 Nov 2026 (Thu-Thu)' },
    { type: 'exam', title: 'Minor Examination (Sem II)', date: '2027-02-16', detail: '16-21 Feb 2027 (Tue-Sun)' },
    { type: 'exam', title: 'Major Examination (Sem II)', date: '2027-04-22', detail: '22-29 Apr 2027 (Thu-Thu)' },
    
    // Time Table Adjustments
    { type: 'tt_swap', title: 'Wednesday Time Table Followed', date: '2026-08-14', detail: '14th Aug 2026, Friday' },
    { type: 'tt_swap', title: 'Friday Time Table Followed', date: '2026-09-24', detail: '24th Sep 2026, Thursday' },
    { type: 'tt_swap', title: 'Friday Time Table Followed', date: '2026-10-05', detail: '5th Oct 2026, Monday' },
    { type: 'tt_swap', title: 'Friday Time Table Followed', date: '2026-10-19', detail: '19th Oct 2026, Monday' },
    { type: 'tt_swap', title: 'Thursday Time Table Followed', date: '2026-10-24', detail: '24th Oct 2026, Saturday' },
    { type: 'tt_swap', title: 'Friday Time Table Followed (Sem II)', date: '2027-01-23', detail: '23rd Jan 2027, Saturday' },
    { type: 'tt_swap', title: 'Wednesday Time Table Followed (Sem II)', date: '2027-02-06', detail: '6th Feb 2027, Saturday' },

    // Holidays & Breaks
    { type: 'holiday', title: 'Independence Day', date: '2026-08-15', detail: '15 Aug 2026, Saturday' },
    { type: 'holiday', title: 'Mahatma Gandhi Birthday', date: '2026-10-02', detail: '02 Oct 2026, Friday' },
    { type: 'holiday', title: 'Dussehra', date: '2026-10-20', detail: '20 Oct 2026, Tuesday' },
    { type: 'holiday', title: 'Diwali', date: '2026-11-08', detail: '08 Nov 2026, Sunday' },
    { type: 'holiday', title: 'Semester Break', date: '2026-11-02', detail: '02-08 Nov 2026, Mon-Sun' },
    { type: 'holiday', title: 'Winter Break', date: '2026-12-02', detail: '02-30 Dec 2026, Wed-Wed' }
];

function renderAcademicCalendar(events) {
    academicContainer.innerHTML = '';
    if (events.length === 0) {
        academicContainer.innerHTML = `<p style="color:#aaa; text-align:center; grid-column:1/-1;">No academic events found for the selected filter.</p>`;
        return;
    }
    events.forEach(ev => {
        let badgeColor = ev.type === 'exam' ? '#ff4444' : ev.type === 'tt_swap' ? '#ffbb00' : '#00e5ff';
        const card = `
            <div class="glass-card" style="border: 1px solid rgba(255,255,255,0.15); padding: 14px; margin: 8px; border-radius: 10px; background: rgba(255,255,255,0.04);">
                <span style="background:${badgeColor}; color:#000; padding:2px 8px; border-radius:4px; font-size:12px; font-weight:bold;">${ev.type.toUpperCase()}</span>
                <h4 style="margin: 8px 0 4px 0;">${ev.title}</h4>
                <p style="color:#ccc; font-size:13px; margin:0;">${ev.detail}</p>
            </div>
        `;
        academicContainer.insertAdjacentHTML('beforeend', card);
    });
}

function filterCalendar(category) {
    if (category === 'all') renderAcademicCalendar(academicCalendarData);
    else renderAcademicCalendar(academicCalendarData.filter(e => e.type === category));
}

function filterByDate(selectedDate) {
    if (!selectedDate) return;
    const filtered = academicCalendarData.filter(e => e.date === selectedDate);
    renderAcademicCalendar(filtered);
}

// Initial Render
renderAcademicCalendar(academicCalendarData);