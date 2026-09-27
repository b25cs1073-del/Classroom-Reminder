self.addEventListener('install', (e) => {
  console.log('Service Worker Installed');
});

self.addEventListener('fetch', (event) => {
  // बेसिक कैशिंग/ऑफ़लाइन सपोर्ट के लिए
});