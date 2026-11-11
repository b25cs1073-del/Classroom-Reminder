// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAZhKJZe5F3RL_W-m_L_ue6nHyIWZ4cXto",
    authDomain: "classroom-reminder-f55d3.firebaseapp.com",
    projectId: "classroom-reminder-f55d3",
    storageBucket: "classroom-reminder-f55d3.firebasestorage.app",
    messagingSenderId: "278428097217",
    appId: "1:278428097217:web:c709430c1d92a145dc9240",
    measurementId: "G-GN2GC6WTGG"
};

if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const loginBtn = document.getElementById('login-btn');
const deadlinesContainer = document.getElementById('deadlines-container');

let activeIntervals = {};
let tokenClient;

// Valid Google Cloud OAuth Client ID
const GOOGLE_CLIENT_ID = '1082578755240-i9r82cd0kgg7e8j6hgrgb9lihhjcfglp.apps.googleusercontent.com';

function initGoogleAuthClient() {
    if (window.google && google.accounts && google.accounts.oauth2) {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me',
            callback: async (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    const accessToken = tokenResponse.access_token;
                    localStorage.setItem('pwa_google_token', accessToken);
                    
                    try {
                        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                            headers: { 'Authorization': `Bearer ${accessToken}` }
                        });
                        const userInfo = await userInfoRes.json();
                        loginBtn.innerText = `Hi, ${userInfo.given_name || 'Student'}`;
                    } catch (e) {
                        loginBtn.innerText = "Logged In";
                    }

                    fetchClassroomCourses(accessToken);
                } else {
                    console.error("OAuth Error:", tokenResponse);
                    alert("Google Authentication failed.");
                }
            },
        });
    }
}

window.addEventListener('load', () => {
    setTimeout(initGoogleAuthClient, 500);
    
    const existingToken = localStorage.getItem('pwa_google_token');
    if (existingToken) {
        loginBtn.innerText = "Logged In";
        fetchClassroomCourses(existingToken);
    }
});

loginBtn.addEventListener('click', () => {
    const existingToken = localStorage.getItem('pwa_google_token');
    if (existingToken) {
        if (confirm("Do you want to log out?")) {
            localStorage.removeItem('pwa_google_token');
            alert("Logged out successfully!");
            window.location.reload();
        }
        return;
    }

    if (!tokenClient) initGoogleAuthClient();

    if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        alert("Initializing Google Client... Click again in 2 seconds.");
    }
});

// REAL Google Classroom API Integration
async function fetchClassroomCourses(token) {
    deadlinesContainer.innerHTML = `<p style="color:#00ff66; text-align:center; grid-column: 1/-1;">Fetching Classroom Deadlines...</p>`;

    try {
        const res = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (!res.ok) {
            const errJson = await res.json();
            deadlinesContainer.innerHTML = `<p style="color:#ff4444; text-align:center; grid-column: 1/-1;">API Error: ${errJson.error ? errJson.error.message : 'Access Denied'}</p>`;
            return;
        }

        const data = await res.json();

        if (data.courses && data.courses.length > 0) {
            deadlinesContainer.innerHTML = '';
            let totalAssignmentsFound = 0;
            
            for (let course of data.courses) {
                const count = await fetchCourseAssignments(course.id, course.name, token);
                totalAssignmentsFound += count;
            }

            if (totalAssignmentsFound === 0) {
                deadlinesContainer.innerHTML = `<p style="color:#00e5ff; text-align:center; grid-column: 1/-1;">🎉 No pending/upcoming assignments found in your Google Classroom!</p>`;
            }
        } else {
            deadlinesContainer.innerHTML = `<p style="color:#ffaa00; text-align:center; grid-column: 1/-1;">No active enrolled Google Classroom courses found.</p>`;
        }
    } catch (err) {
        console.error("Fetch Exception:", err);
        deadlinesContainer.innerHTML = `<p style="color:#ff4444; text-align:center; grid-column: 1/-1;">Network error fetching Classroom data.</p>`;
    }
}

async function fetchCourseAssignments(courseId, courseName, token) {
    try {
        const res = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) return 0;

        const data = await res.json();
        let foundCount = 0;
        const now = new Date();

        if (data.courseWork && data.courseWork.length > 0) {
            data.courseWork.forEach(work => {
                if (work.dueDate) {
                    const due = work.dueDate;
                    const dueTime = work.dueTime || { hours: 23, minutes: 59 };
                    const dueDateObj = new Date(due.year, due.month - 1, due.day, dueTime.hours || 23, dueTime.minutes || 59);

                    // Filter out past/expired deadlines - show ONLY future/upcoming ones
                    if (dueDateObj > now) {
                        displayDeadlineCard(work, courseName, dueDateObj);
                        foundCount++;
                    }
                }
            });
        }
        return foundCount;
    } catch (err) { 
        console.error("Assignment Fetch Error:", err);
        return 0;
    }
}

function getAssignmentTypeBadge(title) {
    const t = (title || '').toLowerCase();
    if (t.includes('quiz') || t.includes('test') || t.includes('exam')) return { tag: '[Q]', name: 'Quiz/Exam' };
    if (t.includes('tutorial') || t.includes('tut') || t.includes('lab')) return { tag: '[T]', name: 'Tutorial/Lab' };
    return { tag: '[A]', name: 'Assignment' };
}

// Dynamic Smart Proximity Logic
function getProximityConfig(dueDateObj) {
    const diffMs = dueDateObj - new Date();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffHours / 24;

    if (diffHours <= 0) {
        return { soundText: '🚨 EXPIRED', intervalMs: 0, status: 'EXPIRED' };
    } else if (diffHours <= 1) {
        // Last 1 hour: Ring every 15 minutes
        return { soundText: '🔥 URGENT: Less than 1 Hour Left!', intervalMs: 15 * 60 * 1000, status: 'CRITICAL' };
    } else if (diffHours <= 5) {
        // 1 to 5 hours left: Ring every 30 minutes
        return { soundText: '⚠️ WARNING: Final 5 Hours Left!', intervalMs: 30 * 60 * 1000, status: 'HIGH' };
    } else if (diffHours <= 12) {
        // 5 to 12 hours left: Ring every 2 hours
        return { soundText: '⏰ REMINDER: Submission Due Today', intervalMs: 2 * 60 * 60 * 1000, status: 'MEDIUM_HIGH' };
    } else if (diffHours <= 24) {
        // 12 to 24 hours left: Ring every 12 hours
        return { soundText: '🔔 UPCOMING: Due Tomorrow', intervalMs: 12 * 60 * 60 * 1000, status: 'MEDIUM' };
    } else if (diffDays <= 5) {
        // 1 to 5 days left: Ring once every 24 hours
        return { soundText: '📅 NOTICE: Due in a few days', intervalMs: 24 * 60 * 60 * 1000, status: 'LOW' };
    } else {
        // More than 5 days left: Ring once every 2 days (48 hours)
        return { soundText: 'ℹ️ ADVANCE NOTICE: Submission Ahead', intervalMs: 48 * 60 * 60 * 1000, status: 'INFO' };
    }
}

function displayDeadlineCard(work, courseName, dueDateObj) {
    const dueDateStr = `${dueDateObj.getDate()}/${dueDateObj.getMonth() + 1}/${dueDateObj.getFullYear()} (${dueDateObj.getHours()}:${String(dueDateObj.getMinutes()).padStart(2, '0')})`;
    const typeInfo = getAssignmentTypeBadge(work.title);
    const cardId = `card_${work.id || Math.random().toString(36).substr(2, 9)}`;

    const cardHtml = `
        <div class="glass-card" style="border: 1px solid rgba(0, 255, 102, 0.25); padding: 18px; margin: 10px; border-radius: 12px; background: rgba(0,0,0,0.4);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="background: #00ff66; color:#000; padding:2px 8px; border-radius: 4px; font-weight:bold; font-size: 12px;">${typeInfo.tag} ${typeInfo.name}</span>
                <span style="font-size: 1.2rem;">🔔</span>
            </div>
            <h3 style="margin: 12px 0 6px 0; color: #fff;">${work.title}</h3>
            <p style="color:#aaa; margin: 0 0 10px 0; font-size: 0.9rem;">Course: ${courseName}</p>
            <div style="color:#00e5ff; font-weight:bold; font-size: 0.95rem;">Due: ${dueDateStr}</div>
            
            <div id="btn_container_${cardId}" style="margin-top:14px;">
                <button class="btn-secondary" style="width:100%; padding: 10px; cursor:pointer;"
                    onclick="enableSmartBellReminder('${cardId}', '${(work.title || '').replace(/'/g, "\\'")}', '${dueDateStr}', '${typeInfo.tag}', ${dueDateObj.getTime()})">
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
                
                if (prox.status === 'EXPIRED') {
                    alert("This assignment deadline has already passed.");
                    return;
                }

                alert(`Smart Proximity Bell Activated for ${tag} "${title}"! Frequency set based on due time.`);

                // Initial Instant Popup Notification
                triggerNotification(tag, prox.soundText, title, dueDateStr);

                if (activeIntervals[cardId]) clearInterval(activeIntervals[cardId]);

                // Dynamic Proximity Loop
                activeIntervals[cardId] = setInterval(() => {
                    const currentProx = getProximityConfig(dueDateObj);
                    
                    if (currentProx.status === 'EXPIRED') {
                        clearInterval(activeIntervals[cardId]);
                        delete activeIntervals[cardId];
                    } else {
                        triggerNotification(tag, currentProx.soundText, title, dueDateStr);
                    }
                }, prox.intervalMs);

                document.getElementById(`btn_container_${cardId}`).innerHTML = `
                    <button style="width:100%; padding:10px; background:#ff4444; color: white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;"
                        onclick="stopReminder('${cardId}', '${title.replace(/'/g, "\\'")}')">
                        Stop Smart Bell 🔕
                    </button>
                `;
            } else {
                alert("Please allow notification permissions in your browser.");
            }
        });
    }
}

function triggerNotification(tag, header, title, dueDateStr) {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(`${tag} ${header}`, {
                body: `Assignment: "${title}"\nDeadline: ${dueDateStr}`,
                icon: 'https://cdn-icons-png.flaticon.com/512/2991/2991112.png',
                requireInteraction: true
            });
        });
    } else {
        new Notification(`${tag} ${header}`, {
            body: `Assignment: "${title}"\nDeadline: ${dueDateStr}`,
            icon: 'https://cdn-icons-png.flaticon.com/512/2991/2991112.png'
        });
    }
}

function stopReminder(cardId, title) {
    if (activeIntervals[cardId]) {
        clearInterval(activeIntervals[cardId]);
        delete activeIntervals[cardId];
        alert(`Reminder deactivated for "${title}".`);
        window.location.reload();
    }
}

// Background Particle Canvas
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let particlesArray = [];
let width = canvas.width = window.innerWidth;
let height = canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    init();
});

class Particle {
    constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.size = Math.random() * 2 + 1;
        this.speedX = (Math.random() - 0.5) * 0.8;
        this.speedY = (Math.random() - 0.5) * 0.8;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x < 0 || this.x > width) this.speedX *= -1;
        if (this.y < 0 || this.y > height) this.speedY *= -1;
    }
    draw() {
        ctx.fillStyle = '#00ff66';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#00ff66';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function init() {
    particlesArray = [];
    const numberOfParticles = Math.floor((width * height) / 12000);
    for (let i = 0; i < numberOfParticles; i++) {
        particlesArray.push(new Particle());
    }
}

function connect() {
    for (let a = 0; a < particlesArray.length; a++) {
        for (let b = a; b < particlesArray.length; b++) {
            let dx = particlesArray[a].x - particlesArray[b].x;
            let dy = particlesArray[a].y - particlesArray[b].y;
            let distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 110) {
                let opacity = (1 - (distance / 110)) * 0.35;
                ctx.strokeStyle = `rgba(0, 255, 102, ${opacity})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
                ctx.lineTo(particlesArray[b].x, particlesArray[b].y);
                ctx.stroke();
            }
        }
    }
}

function animate() {
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update();
        particlesArray[i].draw();
    }
    connect();
    requestAnimationFrame(animate);
}

init();
animate();