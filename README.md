# TouchLab — Phase A Demo

Static iPhone Host ↔ Android Slave command demo using MQTT over WSS.

**All commands and ACKs are simulated within TouchLab. No real touchscreen taps, external app control, hardware actuation or screen streaming.**

## Try the demo

Open the GitHub Pages URL shown in this repository's About section on both phones. Choose Host on iPhone Safari and Slave on Android Chrome, use the same temporary room, and connect. Wait for Connected to broker and Slave online before trying P1/P2/P3/CLEAR/REFRESH.

CLEAR clears the selected demo point. REFRESH resets demo counters and selection. ACK simulated confirms only the demo UI processed a command. Timeout means the result is unknown.

## Deployment

Publish the main branch from /(root) with GitHub Pages. Keep index.html, .nojekyll, css/ and js/ together. No build or npm installation required. ES modules require HTTP/HTTPS rather than file://.

## Demo limitations

- Public test broker: wss://broker.emqx.io:8084/mqtt. Room names are not authentication.
- Never send credentials, personal data, GPS coordinates or real screen content.
- Use one Host and one Slave per room. Keep both pages in the foreground.
- Pending commands time out after 8 seconds; one retry reuses the command ID. Duplicate protection is in memory and resets when the page reloads.
- Local Node tests: 36 passed. Desktop browser mock tests: 20 passed. These do not establish real iPhone/Android cellular compatibility.
- Only use TouchLab's own authorized demo; no attendance/check-in integration or restriction bypass.


## Keep the screen awake (1.2)

Use the Keep screen awake button in the status section (Thai: เปิดหน้าจอค้าง). This is an opt-in Screen Wake Lock request while this page is visible. The browser or OS may reject or release it. Switch it off after testing. This is not background control and does not unlock the device. Requires HTTPS and browser support.

## Security scope

This is a public-broker simulated demo, not a secure production transport. Anyone who knows a room may forge messages or ACKs. Never connect hardware or send real data until private authenticated transport with per-device identities and topic ACLs is implemented.

Version 1.2 pins MQTT.js 5.16.1 with SHA-256 Subresource Integrity and anonymous/no-referrer CDN loading. A Content Security Policy restricts script sources and the WSS destination. These controls do not authenticate MQTT peers.
