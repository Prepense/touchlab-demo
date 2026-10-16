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
- Local Node tests: 24 passed. Desktop browser mock tests: 16 passed. These do not establish real iPhone/Android cellular compatibility.
- Only use TouchLab's own authorized demo; no attendance/check-in integration or restriction bypass.

