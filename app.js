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

// Service Worker-backed Background Smart Reminder
function enableSmartBellReminder(cardId, title, dueDateStr, tag, dueTimestamp) {
    const dueDateObj = new Date(dueTimestamp);

    if ("Notification" in window) {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                const prox = getProximityConfig(dueDateObj);
                alert(`Reminder Activated for ${tag} "${title}"!`);

                // Service Worker Notifications (Background Enabled)
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

// 4. Academic Calendar Toggle (Expand/Collapse Logic)
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

// Initial Render
renderAcademicCalendar(academicCalendarData);



// ----------------------------------------------------
// 5. Gemini AI Attendance Tracker & Proxy Calculator
// ----------------------------------------------------

// Gemini API Key (यहाँ अपनी AI Studio वाली Key पेस्ट करें)
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";

// UI में AI Attendance Card इंसर्ट करना
function renderAIAttendanceSection() {
    const dashboard = document.querySelector('.dashboard');
    const attendanceHtml = `
        <section class="attendance-section glass-card" style="margin-top: 40px; padding: 20px; border: 1px solid rgba(0, 255, 102, 0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 class="section-title" style="margin:0;">🤖 AI Attendance & Proxy Tracker (75% Criteria)</h3>
                <span style="background: #00ff66; color: #000; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;">Gemini AI Powered</span>
            </div>
            
            <p style="color: #ccc; font-size: 0.9rem; margin-bottom: 15px;">
                प्रोफेसर द्वारा भेजी गई अटेंडेंस PDF / Sheet का टेक्स्ट पेस्ट करें। AI तुरंत रोल नंबर के हिसाब से आपका 75% अटेंडेंस और Bunk/Proxy लिमिट बता देगा।
            </p>

            <div style="margin-bottom: 15px;">
                <textarea id="attendance-text-input" placeholder="यहाँ अटेंडेंस लिस्ट / PDF का डेटा पेस्ट करें (उदा: Roll 21BCS001 - Present: 18/22)..." 
                    style="width: 100%; height: 80px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 10px; border-radius: 8px; font-family: monospace;"></textarea>
            </div>

            <button class="btn-primary" onclick="analyzeAttendanceWithAI()" style="width: 100%; padding: 10px; font-size: 1rem;">
                Analyze Attendance with Gemini AI 🚀
            </button>

            <div id="ai-attendance-result" style="margin-top: 20px;"></div>
        </section>
    `;
    
    // Academic Section से पहले इंसर्ट करें
    const academicSection = document.querySelector('.academic-section');
    if (academicSection) {
        academicSection.insertAdjacentHTML('beforebegin', attendanceHtml);
    }
}

// Gemini AI API को कॉल करने का फंक्शन
async function analyzeAttendanceWithAI() {
    const textInput = document.getElementById('attendance-text-input').value;
    const resultDiv = document.getElementById('ai-attendance-result');

    if (!textInput.trim()) {
        alert("कृपया विश्लेषण के लिए अटेंडेंस का टेक्स्ट दर्ज करें।");
        return;
    }

    resultDiv.innerHTML = `<p style="color:#00ff66; text-align:center;">🤖 AI आपके अटेंडेंस और 75% क्राइटेरिया का विश्लेषण कर रहा है...</p>`;

    const prompt = `
    Analyze the following attendance text/sheet data:
    "${textInput}"

    Calculate/Extract:
    1. Subject/Course Name (if available)
    2. Attendance Percentage (%)
    3. Status relative to 75% mandatory criteria.
    4. How many future classes can the student safely skip (proxies allowed) OR how many mandatory classes they must attend to reach 75%.

    Format the output strictly in HTML with styling:
    - If Attendance >= 75%: Show GREEN status with safe proxy count.
    - If Attendance < 75%: Show RED Warning with required classes needed.
    Keep it concise and clear.
    `;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        
        if (data.candidates && data.candidates[0].content.parts[0].text) {
            const aiReply = data.candidates[0].content.parts[0].text;
            resultDiv.innerHTML = `
                <div style="background: rgba(0,255,102,0.05); border: 1px solid #00ff66; padding: 15px; border-radius: 10px;">
                    ${aiReply}
                </div>
            `;
        } else {
            resultDiv.innerHTML = `<p style="color:red;">AI रिस्पांस प्राप्त करने में समस्या आई।</p>`;
        }
    } catch (err) {
        console.error("Gemini API Error:", err);
        resultDiv.innerHTML = `<p style="color:red;">API Error: कृपया अपनी Gemini API Key जांचें।</p>`;
    }
}

// DOM लोड होने के बाद AI कार्ड दिखाएं
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(renderAIAttendanceSection, 1000);
});