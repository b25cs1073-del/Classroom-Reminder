// 1. आपकी स्क्रीनशॉट वाली Firebase Configuration[cite: 3]
const firebaseConfig = {
    apiKey: "AIzaSyAZhKJZe5F3RL_W-m_L_ue6nHyIWZ4cXto",
    authDomain: "classroom-reminder-f55d3.firebaseapp.com",
    projectId: "classroom-reminder-f55d3",
    storageBucket: "classroom-reminder-f55d3.firebasestorage.app",
    messagingSenderId: "278428097217",
    appId: "1:278428097217:web:c709430c1d92a145dc9240",
    measurementId: "G-GN2GC6WTGG"
};

// OAuth Client ID (आपके स्क्रीनशॉट के अनुसार)
const GOOGLE_CLIENT_ID = "1082578755240-3jof3i93uqs4foqm8th895ivd6jrfm2t.apps.googleusercontent.com";

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const loginBtn = document.getElementById('login-btn');
const deadlinesContainer = document.getElementById('deadlines-container');

// 2. Google Login और Classroom Scopes
loginBtn.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    
    // Google Classroom डेटा एक्सेस करने के Scopes
    provider.addScope('https://www.googleapis.com/auth/classroom.courses.readonly');
    provider.addScope('https://www.googleapis.com/auth/classroom.coursework.me');

    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            const accessToken = result.credential.accessToken;
            const user = result.user;
            loginBtn.innerText = `Hi, ${user.displayName.split(' ')[0]}`;
            
            // लॉगिन होते ही गूगल क्लासरूम के असाइनमेंट फेच करें
            fetchClassroomCourses(accessToken);
        })
        .catch((error) => {
            console.error("Login Failed:", error);
            alert("लॉगिन एरर: " + error.message);
        });
});

// 3. Active Courses फेच करना
async function fetchClassroomCourses(token) {
    deadlinesContainer.innerHTML = `<p style="color:#00ff66; text-align:center; grid-column: 1/-1;">Classroom डेटा लोड हो रहा है...</p>`;
    
    try {
        const response = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.courses && data.courses.length > 0) {
            deadlinesContainer.innerHTML = ''; // पुराना टेक्स्ट हटाएं
            data.courses.forEach(course => {
                fetchCourseAssignments(course.id, course.name, token);
            });
        } else {
            deadlinesContainer.innerHTML = `<p style="color:#aaa; text-align:center; grid-column: 1/-1;">कोई एक्टिव कोर्स/क्लासरूम नहीं मिला।</p>`;
        }
    } catch (err) {
        console.error("Error fetching courses:", err);
        deadlinesContainer.innerHTML = `<p style="color:red; text-align:center; grid-column: 1/-1;">डेटा फेच करने में एरर आया।</p>`;
    }
}

// 4. Assignments (CourseWork) फेच करना
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

// 5. Glassmorphism Card बनाकर UI में दिखाना
function displayDeadlineCard(work, courseName) {
    const due = work.dueDate;
    const dueDateStr = `${due.day}/${due.month}/${due.year}`;
    
    const cardHtml = `
        <div class="glass-card">
            <div class="card-status warning">Pending</div>
            <h3>${work.title}</h3>
            <p class="course">Course: ${courseName}</p>
            <div class="due-time">Due Date: ${dueDateStr}</div>
            <button class="btn-secondary" onclick="enableReminder('${work.title}', '${dueDateStr}')">
                Enable Screen Reminder
            </button>
        </div>
    `;
    deadlinesContainer.insertAdjacentHTML('beforeend', cardHtml);
}

// 6. Repeating Screen Notification (रिमाइंडर लॉजिक)
function enableReminder(title, dueDate) {
    if ("Notification" in window) {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                alert(`Reminder Activated for: ${title}`);
                
                // तुरंत पहला नोटिफिकेशन स्क्रीन पर आएगा
                new Notification("Classroom Deadline Notification", {
                    body: `असाइनमेंट: "${title}" की ड्यू डेट ${dueDate} है!`,
                    icon: 'https://cdn-icons-png.flaticon.com/512/2991/2991112.png'
                });

                // हर 1 घंटे में बार-बार मोबाइल स्क्रीन पर पॉप-अप रिमाइंडर
                setInterval(() => {
                    new Notification("⚠️ Pending Deadline Reminder!", {
                        body: `याद रखें! "${title}" की ड्यू डेट ${dueDate} है।`,
                        requireInteraction: true
                    });
                }, 3600000); // 3600000 ms = 1 घंटा
            } else {
                alert("कृपया रिमाइंडर के लिए Notification Permission को allow करें।");
            }
        });
    }
}