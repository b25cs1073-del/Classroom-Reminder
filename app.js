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

const GOOGLE_CLIENT_ID = "1082578755240-3jof3i93uqs4foqm8th895ivd6jrfm2t.apps.googleusercontent.com";

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const loginBtn = document.getElementById('login-btn');
const deadlinesContainer = document.getElementById('deadlines-container');

loginBtn.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/classroom.courses.readonly');
    provider.addScope('https://www.googleapis.com/auth/classroom.coursework.me');

    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            const accessToken = result.credential.accessToken;
            const user = result.user;
            loginBtn.innerText = `Hi, ${user.displayName.split(' ')[0]}`;
            fetchClassroomCourses(accessToken);
        })
        .catch((error) => {
            console.error("Login Failed:", error);
            alert("Loin Error: " + error.message);
        });
});

async function fetchClassroomCourses(token) {
    deadlinesContainer.innerHTML = `<p style="color:#00ff66; text-align:center; grid-column: 1/-1;">Classroom data load ho raha hai...</p>`;
    
    try {
        const response = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.courses && data.courses.length > 0) {
            deadlinesContainer.innerHTML = '';
            data.courses.forEach(course => {
                fetchCourseAssignments(course.id, course.name, token);
            });
        } else {
            deadlinesContainer.innerHTML = `<p style="color:#aaa; text-align:center; grid-column: 1/-1;">Koi active course nahi mila.</p>`;
        }
    } catch (err) {
        console.error("Error fetching courses:", err);
        deadlinesContainer.innerHTML = `<p style="color:red; text-align:center; grid-column: 1/-1;">Data fetch karne me error aaya.</p>`;
    }
}

async function fetchCourseAssignments(courseId, courseName, token) {
    try {
        const response = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.courseWork && data.courseWork.length > 0) {
            data.courseWork.forEach(work => {
                if (work.dueDate) {
                    displayDeadlineCard(work, courseName);
                }
            });
        }
    } catch (err) {
        console.error("Error fetching coursework:", err);
    }
}

// 2. Activity / Work Type ka Sign aur Full Name nikalna
function getAssignmentTypeBadge(title) {
    const t = title.toLowerCase();
    if (t.includes('quiz') || t.includes('test') || t.includes('exam')) {
        return { tag: '[Q]', fullName: 'Quiz / Test', icon: '📝' };
    } else if (t.includes('tutorial') || t.includes('tut') || t.includes('lab')) {
        return { tag: '[T]', fullName: 'Tutorial / Lab', icon: '💻' };
    } else if (t.includes('project') || t.includes('presentation')) {
        return { tag: '[P]', fullName: 'Project / Presentation', icon: '📊' };
    } else {
        return { tag: '[A]', fullName: 'Assignment', icon: '📄' };
    }
}

// 3. Balanced Smart Proximity Logic (No Irritation Interval)
function getProximityConfig(dueDateObj) {
    const now = new Date();
    const diffMs = dueDateObj - now;
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffHours / 24;

    if (diffHours <= 0) {
        // Expired or Overdue
        return { bellSize: '30px', soundText: '🚨 EXPIRED', intervalMs: 3600000, urgency: 'EXPIRED' }; // 1 Ghanta
    } else if (diffHours <= 5) {
        // 5 Ghante se kam baaki: Har 30 min me
        return { bellSize: '28px', soundText: '🚨🚨 FINAL WARNING', intervalMs: 1800000, urgency: 'CRITICAL' }; // 30 Min
    } else if (diffHours <= 24) {
        // 24 Ghante se 5 Ghante baaki: Har 2 ghante me
        return { bellSize: '24px', soundText: '🚨 URGENT TAN-TAN', intervalMs: 7200000, urgency: 'VERY HIGH' }; // 2 Ghante
    } else if (diffDays <= 2) {
        // 2 Din se 1 Din baaki: Har 6 ghante me
        return { bellSize: '22px', soundText: '🔔🔔🔔 TAN TAN', intervalMs: 21600000, urgency: 'HIGH' }; // 6 Ghante
    } else if (diffDays <= 5) {
        // 5 Din se 2 Din baaki: Har 12 ghante me (Din me 2 baar)
        return { bellSize: '18px', soundText: '🔔🔔 TAN', intervalMs: 43200000, urgency: 'MEDIUM' }; // 12 Ghante
    } else if (diffDays <= 10) {
        // 10 Din se 5 Din baaki: Har 24 ghante me (Din me 1 baar)
        return { bellSize: '16px', soundText: '🔔 tan', intervalMs: 86400000, urgency: 'LOW' }; // 24 Ghante (1 Din)
    } else if (diffDays <= 20) {
        // 20 Din se 10 Din baaki: Har 3 din me 1 baar
        return { bellSize: '14px', soundText: '🔔 (choti ghanti)', intervalMs: 259200000, urgency: 'VERY LOW' }; // 3 Din
    } else {
        // 20 Din se zyada door: Har 5 din me 1 baar
        return { bellSize: '12px', soundText: '🔔 (small tan)', intervalMs: 432000000, urgency: 'DISTANT' }; // 5 Din
    }
}

// 4. UI me Deadline Card aur Bell Button dikhana
function displayDeadlineCard(work, courseName) {
    const due = work.dueDate;
    const dueTime = work.dueTime || { hours: 23, minutes: 59 };
    const dueDateObj = new Date(due.year, due.month - 1, due.day, dueTime.hours || 23, dueTime.minutes || 59);
    
    const dueDateStr = `${due.day}/${due.month}/${due.year}`;
    const typeInfo = getAssignmentTypeBadge(work.title);
    const prox = getProximityConfig(dueDateObj);

    const cardHtml = `
        <div class="glass-card" style="border: 1px solid rgba(255,255,255,0.15); padding: 16px; margin: 12px; border-radius: 12px; background: rgba(255,255,255,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="background:#00ff66; color:#000; padding:3px 8px; border-radius:6px; font-weight:bold; font-size:13px;">
                    ${typeInfo.tag} ${typeInfo.fullName}
                </span>
                <span style="font-size: ${prox.bellSize}; title="Proximity Bell">🔔</span>
            </div>
            <h3 style="margin: 12px 0 6px 0;">${work.title}</h3>
            <p class="course" style="color:#ccc; margin:0 0 8px 0;">Course: ${courseName}</p>
            <div class="due-time" style="font-weight:bold; color:#00e5ff;">Due Date: ${dueDateStr}</div>
            
            <button class="btn-secondary" style="margin-top:12px; padding:8px 14px; cursor:pointer; width:100%; border-radius:8px;" 
                onclick="enableSmartBellReminder('${work.title}', '${dueDateStr}', '${typeInfo.tag}', '${typeInfo.fullName}', ${dueDateObj.getTime()})">
                Set Smart ${typeInfo.tag} Bell Reminder 🔔
            </button>
        </div>
    `;
    deadlinesContainer.insertAdjacentHTML('beforeend', cardHtml);
}

// 5. Smart Bell Reminder Function
function enableSmartBellReminder(title, dueDateStr, tag, fullName, dueTimestamp) {
    const dueDateObj = new Date(dueTimestamp);

    if ("Notification" in window) {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                const prox = getProximityConfig(dueDateObj);
                
                alert(`Reminder Activated!\nType: ${tag} (${fullName})\nUrgency Level: ${prox.urgency}`);

                // Instant Notification on Click
                new Notification(`${tag} ${fullName} Reminder Set! 🔔`, {
                    body: `Activity: "${title}"\nDue Date: ${dueDateStr}`,
                    icon: 'https://cdn-icons-png.flaticon.com/512/2991/2991112.png'
                });

                // Periodic Balanced Interval Logic
                setInterval(() => {
                    const currentProx = getProximityConfig(dueDateObj);
                    new Notification(`${tag} ${currentProx.soundText} - ${fullName}`, {
                        body: `Reminder: "${title}" ki due date ${dueDateStr} hai.`,
                        requireInteraction: currentProx.urgency === 'CRITICAL' || currentProx.urgency === 'VERY HIGH'
                    });
                }, prox.intervalMs);

            } else {
                alert("Kripya browser me Notification permission allow karein.");
            }
        });
    }
}