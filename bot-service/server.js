const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const activeRecordings = new Map();
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8080';

// Handle upgrade for WebSockets
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// WebSocket connection for streaming audio chunks from Chromium
wss.on('connection', (ws, request) => {
  const urlParams = new URLSearchParams(request.url.split('?')[1]);
  const meetingId = urlParams.get('meetingId');

  console.log(`[WS] Connection received for meeting: ${meetingId}`);

  if (!meetingId || !activeRecordings.has(Number(meetingId))) {
    console.error(`[WS] Unknown or inactive meetingId: ${meetingId}`);
    ws.close();
    return;
  }

  const rec = activeRecordings.get(Number(meetingId));

  ws.on('message', (message) => {
    // message is a Buffer containing raw audio WebM chunk
    if (rec.writeStream) {
      rec.writeStream.write(message);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Stream socket closed for meeting: ${meetingId}`);
  });
});

// POST /bot/join
app.post('/bot/join', async (req, res) => {
  const { url, meetingId, token } = req.body;

  if (!url || !meetingId || !token) {
    return res.status(400).send('Missing url, meetingId, or token');
  }

  console.log(`[Bot] Request to join URL: ${url} for meetingId: ${meetingId}`);

  if (activeRecordings.has(Number(meetingId))) {
    return res.status(400).send('Bot is already recording this meeting');
  }

  const webmPath = `/tmp/meeting-${meetingId}.webm`;
  const writeStream = fs.createWriteStream(webmPath);

  const rec = {
    url,
    meetingId: Number(meetingId),
    token,
    writeStream,
    webmPath,
    browser: null,
    page: null
  };
  activeRecordings.set(Number(meetingId), rec);

  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--window-size=1280,720'
      ]
    });
    rec.browser = browser;

    const page = await browser.newPage();
    rec.page = page;

    await page.setViewport({ width: 1280, height: 720 });

    // Enable console logging from the browser context to Puppeteer logs
    page.on('console', msg => console.log('[BROWSER CONSOLE]', msg.text()));

    // 1. Inject WebRTC Audio Interception Script
    await page.evaluateOnNewDocument(() => {
      window.addEventListener('DOMContentLoaded', () => {
        console.log("Injected audio recorder loaded in page context.");
        
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const mixedDestination = audioCtx.createMediaStreamDestination();
        const connectedStreams = new Set();
        let mediaRecorder = null;
        let ws = null;

        function connectStream(stream) {
          if (connectedStreams.has(stream.id)) return;
          connectedStreams.add(stream.id);
          
          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length > 0) {
            console.log("Recorder: Connecting audio track ID:", audioTracks[0].id);
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(mixedDestination);
            
            if (!mediaRecorder) {
              startRecording();
            }
          }
        }

        function startRecording() {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const mId = hashParams.get('meetingId') || 'unknown';
          console.log("Recorder: Starting audio capture on mixed destination for meeting ID:", mId);
          
          ws = new WebSocket(`ws://localhost:8082/stream?meetingId=${mId}`);
          
          ws.onopen = () => {
            console.log("WebSocket recording stream established.");
            mediaRecorder = new MediaRecorder(mixedDestination.stream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                event.data.arrayBuffer().then(buffer => {
                  ws.send(new Uint8Array(buffer));
                });
              }
            };
            mediaRecorder.start(1000); // Send chunks every 1 second
          };
          
          ws.onerror = (err) => {
            console.error("Recording WebSocket error:", err);
          };
          
          ws.onclose = () => {
            console.log("Recording WebSocket connection closed.");
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
              mediaRecorder.stop();
            }
          };
        }

        // Intercept RTCPeerConnection addTrack
        const originalAddTrack = RTCPeerConnection.prototype.addTrack;
        RTCPeerConnection.prototype.addTrack = function(track, ...streams) {
          if (track.kind === 'audio') {
            streams.forEach(connectStream);
          }
          return originalAddTrack.apply(this, arguments);
        };

        // Intercept RTCPeerConnection ontrack
        const originalAddEventListener = RTCPeerConnection.prototype.addEventListener;
        RTCPeerConnection.prototype.addEventListener = function(type, listener, options) {
          if (type === 'track') {
            const wrappedListener = function(event) {
              if (event.streams && event.streams[0]) {
                connectStream(event.streams[0]);
              }
              return listener.apply(this, arguments);
            };
            return originalAddEventListener.call(this, type, wrappedListener, options);
          }
          return originalAddEventListener.apply(this, arguments);
        };

        Object.defineProperty(RTCPeerConnection.prototype, 'ontrack', {
          set(fn) {
            if (fn) {
              this.addEventListener('track', fn);
            }
          }
        });
      });
    });

    // 2. Open page (Google Meet or Zoom) with meetingId in hash
    const visitUrl = `${url}#meetingId=${meetingId}`;
    console.log(`[Bot] Navigating browser to: ${visitUrl}`);
    await page.goto(visitUrl, { waitUntil: 'networkidle2' });

    // Handle Pre-Join configurations depending on platform
    if (url.includes('meet.google.com')) {
      console.log("[Bot] Google Meet detected. Setting up join inputs...");
      
      // Auto-mute microphone and camera using shortcut Ctrl + d / Ctrl + e
      await page.keyboard.down('Control');
      await page.keyboard.press('d'); // Mic
      await page.keyboard.press('e'); // Camera
      await page.keyboard.up('Control');
      
      // Wait for input name field
      await page.waitForSelector('input[type="text"]', { timeout: 10000 });
      await page.type('input[type="text"]', 'AI Meeting Recorder');
      
      // Scan and click the Join button
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const joinBtn = buttons.find(b => 
          b.textContent.includes('Ask to join') || 
          b.textContent.includes('Join now') || 
          b.textContent.includes('Join meeting')
        );
        if (joinBtn) {
          joinBtn.click();
        } else {
          throw new Error('Pre-join meeting button not found.');
        }
      });
      console.log("[Bot] Clicked Join button. Waiting for admission...");
    } else {
      console.log("[Bot] Generic URL or Zoom web client. Continuing page monitor...");
    }

    res.send({ status: 'success', message: 'Bot launched and attempting to join meeting' });

  } catch (err) {
    console.error('[Bot] Failed to execute launch/join:', err);
    activeRecordings.delete(Number(meetingId));
    writeStream.end();
    fs.unlink(webmPath, () => {});
    res.status(500).send(`Bot failed to start: ${err.message}`);
  }
});

// POST /bot/stop
app.post('/bot/stop', async (req, res) => {
  const { meetingId } = req.body;

  if (!meetingId) {
    return res.status(400).send('Missing meetingId');
  }

  console.log(`[Bot] Stopping recording for meetingId: ${meetingId}`);

  const rec = activeRecordings.get(Number(meetingId));

  if (!rec) {
    return res.status(404).send('No active bot recording session found for this meeting');
  }

  // Remove from map to prevent double execution
  activeRecordings.delete(Number(meetingId));

  try {
    // 1. Close page and browser
    if (rec.page) await rec.page.close().catch(() => {});
    if (rec.browser) await rec.browser.close().catch(() => {});

    // 2. Safely close WebM output writeStream
    rec.writeStream.end();

    // Give a short delay to finalize write stream flushing
    setTimeout(() => {
      const mp3Path = `/tmp/meeting-${meetingId}.mp3`;

      // 3. Transcode WebM to MP3 using FFmpeg
      console.log(`[Bot] Transcoding WebM recording to MP3...`);
      exec(`ffmpeg -i ${rec.webmPath} -vn -ab 128k -ar 44100 -y ${mp3Path}`, async (err) => {
        if (err) {
          console.error('[Bot] FFmpeg transcoding failed:', err);
          cleanupFiles([rec.webmPath, mp3Path]);
          return;
        }

        console.log(`[Bot] Uploading MP3 file to backend endpoint...`);

        // 4. Upload MP3 to backend using Multipart Form Data
        try {
          const form = new FormData();
          form.append('file', fs.createReadStream(mp3Path), `recorded-meeting-${meetingId}.mp3`);

          const uploadUrl = `${BACKEND_URL}/api/meetings/${meetingId}/upload-audio`;
          await axios.post(uploadUrl, form, {
            headers: {
              ...form.getHeaders(),
              'Authorization': `Bearer ${rec.token}`
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
          });

          console.log(`[Bot] Upload successful for meetingId: ${meetingId}`);
        } catch (uploadErr) {
          console.error('[Bot] Failed to upload audio note to backend:', uploadErr.message);
        } finally {
          cleanupFiles([rec.webmPath, mp3Path]);
        }
      });
    }, 1500);

    res.send({ status: 'success', message: 'Bot leaving meeting and processing audio note' });

  } catch (err) {
    console.error('[Bot] Error stopping session:', err);
    res.status(500).send(`Error stopping recording: ${err.message}`);
  }
});

function cleanupFiles(paths) {
  paths.forEach(p => {
    fs.unlink(p, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error(`[Bot] Error cleaning up file: ${p}`, err);
      }
    });
  });
}

const PORT = 8082;
server.listen(PORT, () => {
  console.log(`[BotService] Server listening on port ${PORT}`);
});
