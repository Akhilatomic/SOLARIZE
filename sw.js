/* Solarize service worker: only here so phones and tablets offer "Install app".
   It stores nothing and answers nothing itself - every request goes to the server as before,
   so staff always get the newest CRM and no customer data is kept on the device. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* network as usual */ });
