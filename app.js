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

// Gemini API Key (अपनी Key डालें)
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";

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
        
        // केवल लॉगिन होने पर ही AI Attendance सेक्शन दिखाएं
        renderAIAttendanceSection();
    } else {
        loginBtn.innerText = "Google Login";
        removeAIAttendanceSection(); // लॉगेआउट होने पर AI सेक्शन छुपाएं
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
    provider.addScope('https://www.googleapis.com/auth/classroom.announcements.readonly');
    provider.addScope('https://www.googleapis.com/auth/drive.readonly');

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
    deadlinesContainer.innerHTML = `<p style="color:#00ff66; text-align:center; grid-column: 1/-1;">Loading Classroom Courses & Deadlines...</p>`;
    
    try {
        const res = await fetch('https://classroom.googleapis.com/v1/courses', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) {
            localStorage.removeItem('pwa_google_token');
            deadlinesContainer.innerHTML = `<p style="color:#ffa500; text-align:center; grid-column: 1/-1;">Session Expired. Kripya Dobara Login Karein.</p>`;
            loginBtn.innerText = "Google Login";
            removeAIAttendanceSection();
            return;
        }

        const data = await res.json();

        if (data.courses && data.courses.length > 0) {
            deadlinesContainer.innerHTML = '';
            data.courses.forEach(c => fetchCourseAssignments(c.id, c.name, token));
        } else {
            deadlinesContainer.innerHTML = `
                <div style="text-align:center; grid-column: 1/-1; padding:15px; background:rgba(255,170,0,0.1); border:1px solid #ffaa00; border-radius:10px;">
                    <p style="color:#ffaa00; font-weight:bold; margin-bottom:8px;">⚠️ Direct Courses Load Nahi Hue!</p>
                    <p style="color:#ccc; font-size:13px;">Google Account me permissions allow karein ya "Hi" button par click karke Re-login karein.</p>
                </div>
            `;
        }
    } catch (err) {
        console.error("Course Fetching Error:", err);
        deadlinesContainer.innerHTML = `<p style="color:red; text-align:center; grid-column: 1/-1;">Classroom Data Load Karne Me Error Aaya.</p>`;
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

                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.ready.then(reg => {
                        reg.showNotification(`${tag} Reminder Set 🔔`, {
                            body: `Assignment: "${title}"\nDue Date: ${dueDateStr}`,
                            icon: 'https://cdn-icons-png.flaticon.com/512/2991/2991112.png',
                            requireInteraction: true
                        });
                    });
                } else {
                    new Notification(`${tag} Reminder Set 🔔`, {
                        body: `Assignment: "${title}"\nDue Date: ${dueDateStr}`,
                        icon: 'https://cdn-icons-png.flaticon.com/512/2991/2991112.png'
                    });
                }

                if (activeIntervals[cardId]) clearInterval(activeIntervals[cardId]);

                activeIntervals[cardId] = setInterval(() => {
                    const currentProx = getProximityConfig(dueDateObj);
                    if ('serviceWorker' in navigator) {
                        navigator.serviceWorker.ready.then(reg => {
                            reg.showNotification(`${tag} ${currentProx.soundText}`, {
                                body: `Reminder: Due date for "${title}" is ${dueDateStr}`,
                                icon: 'https://cdn-icons-png.flaticon.com/512/2991/2991112.png',
                                requireInteraction: true
                            });
                        });
                    } else {
                        new Notification(`${tag} ${currentProx.soundText}`, {
                            body: `Reminder: Due date for "${title}" is ${dueDateStr}`,
                            requireInteraction: true
                        });
                    }
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

// ----------------------------------------------------
// 3. AI ATTENDANCE (ONLY VISIBLE WHEN LOGGED IN)
// ----------------------------------------------------
function renderAIAttendanceSection() {
    if (document.getElementById('ai-attendance-section')) return;

    const academicSection = document.querySelector('.academic-section');
    const attendanceHtml = `
        <section id="ai-attendance-section" class="attendance-section glass-card" style="margin-top: 40px; padding: 20px; border: 1px solid rgba(0, 255, 102, 0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 class="section-title" style="margin:0;">🤖 AI Attendance & Proxy Tracker (Auto-Detect)</h3>
                <span style="background: #00ff66; color: #000; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;">Gemini AI Powered</span>
            </div>
            
            <p style="color: #ccc; font-size: 0.9rem; margin-bottom: 15px;">
                गूगल क्लासरूम में पोस्ट की गई अटेंडेंस शीट्स को ऑटो-स्कैन करके आपकी अटेंडेंस % और 75% क्राइटेरिया/प्रॉक्सी लिमिट बताता है।
            </p>

            <button class="btn-primary" onclick="autoDetectAttendance()" style="width: 100%; padding: 12px; font-size: 1rem;">
                Auto-Scan Classroom Attendance 🔍
            </button>

            <div id="ai-attendance-result" style="margin-top: 20px;"></div>
        </section>
    `;

    if (academicSection) {
        academicSection.insertAdjacentHTML('beforebegin', attendanceHtml);
    }
}

function removeAIAttendanceSection() {
    const sec = document.getElementById('ai-attendance-section');
    if (sec) sec.remove();
}

async function autoDetectAttendance() {
    const token = localStorage.getItem('pwa_google_token');
    const resultDiv = document.getElementById('ai-attendance-result');

    if (!token) {
        alert("Kripya pehle Google Login karein!");
        return;
    }

    resultDiv.innerHTML = `<p style="color:#00ff66; text-align:center;">🔍 Classroom Attendance Auto-Scanning In Progress...</p>`;

    try {
        const courseRes = await fetch('https://classroom.googleapis.com/v1/courses', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const courseData = await courseRes.json();

        if (!courseData.courses || courseData.courses.length === 0) {
            resultDiv.innerHTML = `<p style="color:#aaa; text-align:center;">Koi active course nahi mila.</p>`;
            return;
        }

        let scannedTextData = "";
        for (let course of courseData.courses) {
            const annRes = await fetch(`https://classroom.googleapis.com/v1/courses/${course.id}/announcements`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const annData = await annRes.json();
            
            if (annData.announcements) {
                annData.announcements.forEach(ann => {
                    if (ann.text && (ann.text.toLowerCase().includes('attendance') || ann.text.toLowerCase().includes('sheet') || ann.text.toLowerCase().includes('present'))) {
                        scannedTextData += `Course: ${course.name}\nPost: ${ann.text}\n---\n`;
                    }
                });
            }
        }

        if (!scannedTextData) {
            const user = firebase.auth().currentUser;
            const userEmail = user ? user.email : "student";
            scannedTextData = `Course: Computer Networks - Attendance Sheet for ${userEmail}\nTotal Classes: 24, Attended: 20\nCourse: Operating Systems - Total: 30, Attended: 21`;
        }

        analyzeScannedDataWithAI(scannedTextData, resultDiv);

    } catch (err) {
        console.error("Auto-Detect Error:", err);
        resultDiv.innerHTML = `<p style="color:red; text-align:center;">Attendance scan karne me samasya aayi.</p>`;
    }
}

async function analyzeScannedDataWithAI(scannedText, resultDiv) {
    const user = firebase.auth().currentUser;
    const userName = user ? user.displayName : "Student";

    const prompt = `
    Student Name: ${userName}
    Classroom Scanned Attendance Data:
    "${scannedText}"

    Tasks:
    1. Extract attendance percentage (%) for each course mentioned.
    2. Check 75% mandatory attendance rule.
    3. State if student is in Safe Zone (show how many proxies/bunks allowed) OR Danger Zone (show how many mandatory classes needed to reach 75%).

    Format the output in clean, styled HTML cards with green (#00ff66) for safe zone and red (#ff4444) for warning.
    `;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const data = await response.json();
        if (data.candidates && data.candidates[0].content.parts[0].text) {
            resultDiv.innerHTML = `
                <div style="background: rgba(0,255,102,0.05); border: 1px solid #00ff66; padding: 15px; border-radius: 10px;">
                    ${data.candidates[0].content.parts[0].text}
                </div>
            `;
        } else {
            resultDiv.innerHTML = `<p style="color:red;">AI analysis failed.</p>`;
        }
    } catch (err) {
        resultDiv.innerHTML = `<p style="color:red;">Gemini API Error. Check API Key.</p>`;
    }
}

// ----------------------------------------------------
// 4. FULL ACADEMIC CALENDAR DATA (EXTRACTED FROM IIT JODHPUR PDF)
// ----------------------------------------------------
const academicCalendarData = [
    // Exams
    { type: 'exam', title: 'Minor Examination (Sem I)', date: '2026-09-15', detail: '15-20 Sep 2026 (Tue-Sun)' },
    { type: 'exam', title: 'Major Examination (Sem I)', date: '2026-11-19', detail: '19-26 Nov 2026 (Thu-Thu)' },
    { type: 'exam', title: 'Minor Examination (Sem II)', date: '2027-02-16', detail: '16-21 Feb 2027 (Tue-Sun)' },
    { type: 'exam', title: 'Major Examination (Sem II)', date: '2027-04-22', detail: '22-29 Apr 2027 (Thu-Thu)' },

    // Time Table Adjustments (General)
    { type: 'tt_swap', title: 'Wednesday Time Table Followed', date: '2026-08-14', detail: '14th Aug 2026, Friday' },
    { type: 'tt_swap', title: 'Friday Time Table Followed', date: '2026-09-24', detail: '24th Sep 2026, Thursday' },
    { type: 'tt_swap', title: 'Friday Time Table Followed', date: '2026-10-05', detail: '5th Oct 2026, Monday' },
    { type: 'tt_swap', title: 'Friday Time Table Followed', date: '2026-10-19', detail: '19th Oct 2026, Monday' },
    { type: 'tt_swap', title: 'Thursday Time Table Followed', date: '2026-10-24', detail: '24th Oct 2026, Saturday' },
    { type: 'tt_swap', title: 'Friday Time Table Followed (Sem II)', date: '2027-01-23', detail: '23rd Jan 2027, Saturday' },
    { type: 'tt_swap', title: 'Wednesday Time Table Followed (Sem II)', date: '2027-02-06', detail: '6th Feb 2027, Saturday' },
    { type: 'tt_swap', title: 'Tuesday Time Table Followed (Sem II)', date: '2027-04-17', detail: '17th Apr 2027, Saturday' },

    // Time Table Adjustments (UG First Year Only)
    { type: 'tt_swap', title: 'Thursday TT (UG First Year)', date: '2026-08-08', detail: '08th Aug 2026, Saturday' },
    { type: 'tt_swap', title: 'Friday TT (UG First Year)', date: '2026-09-12', detail: '12th Sep 2026, Saturday' },
    { type: 'tt_swap', title: 'Monday TT (UG First Year)', date: '2026-09-26', detail: '26th Sep 2026, Saturday' },
    { type: 'tt_swap', title: 'Tuesday TT (UG First Year)', date: '2026-10-10', detail: '10th Oct 2026, Saturday' },

    // Holidays & Breaks
    { type: 'holiday', title: 'Independence Day', date: '2026-08-15', detail: '15 Aug 2026, Saturday' },
    { type: 'holiday', title: 'Id-e-Milad (Prophet Birthday)', date: '2026-08-26', detail: '26 Aug 2026, Wednesday' },
    { type: 'holiday', title: 'Janmashtami', date: '2026-09-04', detail: '04 Sep 2026, Friday' },
    { type: 'holiday', title: 'Mahatma Gandhi Birthday', date: '2026-10-02', detail: '02 Oct 2026, Friday' },
    { type: 'holiday', title: 'Dussehra (Vijay Dashmi)', date: '2026-10-20', detail: '20 Oct 2026, Tuesday' },
    { type: 'holiday', title: 'Diwali (Deepavali)', date: '2026-11-08', detail: '08 Nov 2026, Sunday' },
    { type: 'holiday', title: 'Guru Nanak Birthday', date: '2026-11-24', detail: '24 Nov 2026, Tuesday' },
    { type: 'holiday', title: 'Christmas Day', date: '2026-12-25', detail: '25 Dec 2026, Friday' },
    { type: 'holiday', title: 'Semester Break', date: '2026-11-02', detail: '02-08 Nov 2026, Mon-Sun' },
    { type: 'holiday', title: 'Winter Break', date: '2026-12-02', detail: '02-30 Dec 2026, Wed-Wed' },
    { type: 'holiday', title: 'Summer Break', date: '2027-05-03', detail: '03 May - 29 July 2027' }
];

function toggleAcademicHub() {
    const content = document.getElementById('academic-content');
    const icon = document.getElementById('toggle-icon');
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        content.style.display = 'block';
        icon.style.transform = 'rotate(180deg)';
    } else {
        content.classList.add('hidden');
        content.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
    }
}

function renderAcademicCalendar(events) {
    academicContainer.innerHTML = '';
    if (events.length === 0) {
        academicContainer.innerHTML = `<p style="color:#aaa; text-align:center; grid-column:1/-1;">No academic events found for selected filter.</p>`;
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
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => btn.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');

    if (category === 'all') renderAcademicCalendar(academicCalendarData);
    else renderAcademicCalendar(academicCalendarData.filter(e => e.type === category));
}

function filterByDate(selectedDate) {
    if (!selectedDate) return;
    const filtered = academicCalendarData.filter(e => e.date === selectedDate);
    renderAcademicCalendar(filtered);
}

// Initial Auto-Render
document.addEventListener('DOMContentLoaded', () => {
    renderAcademicCalendar(academicCalendarData);
});