/* Solarize service worker: only here so phones and tablets offer "Install app".
   It stores nothing and answers nothing itself - every request goes to the server as before,
   so staff always get the newest CRM and no customer data is kept on the device. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* network as usual */ });
/* Phones: the CRM's alerts are shown through this worker (a phone has no page-level notifications). A tap brings the CRM to
   the front and tells it which alert was tapped; with the CRM closed it is opened. */
self.addEventListener('notificationclick', (e) => {
  const d = e.notification.data || {}; e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => 'focus' in x);
    if (c) { c.postMessage({ solNote: d.id || '' }); return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
