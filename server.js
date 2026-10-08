// ORecover — tiny demo server for live audience participation
// Runs the Socket.IO channel between the main screen and audience phones.

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// Explicit respond route so /respond works on Railway without a trailing slash
app.get('/respond', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'respond.html'));
});

// Server-side QR generation — bulletproof across all browsers / ad blockers
app.get('/qr', async (req, res) => {
  const text = req.query.url || `${req.protocol}://${req.get('host')}/respond`;
  try {
    res.type('png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    const buf = await QRCode.toBuffer(text, {
      width: 640,
      margin: 1,
      color: { dark: '#0A2E1F', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    });
    res.send(buf);
  } catch (e) {
    res.status(500).send(String(e));
  }
});

// ---------- Patient seed ----------
const PATIENTS_SEED = [
  { pid: 'PID‑2847', initials: 'M.K.', age: 68, priority: 2, waitDays: 94,  preOpDate: '11 days ago', surgeonMatch: true,  contact: 'both',  simResp: 'yes', simDelay: 3200 },
  { pid: 'PID‑2103', initials: 'J.T.', age: 71, priority: 2, waitDays: 142, preOpDate: '19 days ago', surgeonMatch: false, contact: 'both',  simResp: 'yes', simDelay: 5100 },
  { pid: 'PID‑3356', initials: 'D.M.', age: 59, priority: 3, waitDays: 61,  preOpDate: '7 days ago',  surgeonMatch: true,  contact: 'sms',   simResp: 'yes', simDelay: 2700 },
  { pid: 'PID‑1992', initials: 'L.O.', age: 74, priority: 2, waitDays: 118, preOpDate: '14 days ago', surgeonMatch: false, contact: 'both',  simResp: 'no',  simDelay: 4600 },
  { pid: 'PID‑3041', initials: 'R.B.', age: 63, priority: 3, waitDays: 77,  preOpDate: '9 days ago',  surgeonMatch: true,  contact: 'email', simResp: 'yes', simDelay: 6800 },
  { pid: 'PID‑2255', initials: 'H.V.', age: 69, priority: 3, waitDays: 103, preOpDate: '22 days ago', surgeonMatch: false, contact: 'both',  simResp: 'no',  simDelay: 3900 },
  { pid: 'PID‑3799', initials: 'A.S.', age: 55, priority: 4, waitDays: 48,  preOpDate: '4 days ago',  surgeonMatch: true,  contact: 'sms',   simResp: 'no',  simDelay: 2900 },
  { pid: 'PID‑1770', initials: 'C.P.', age: 72, priority: 2, waitDays: 134, preOpDate: '28 days ago', surgeonMatch: false, contact: 'both',  simResp: 'none', simDelay: null },
  { pid: 'PID‑2918', initials: 'E.G.', age: 66, priority: 3, waitDays: 89,  preOpDate: '12 days ago', surgeonMatch: true,  contact: 'both',  simResp: 'no',  simDelay: 5500 },
  { pid: 'PID‑3122', initials: 'N.K.', age: 61, priority: 4, waitDays: 56,  preOpDate: '6 days ago',  surgeonMatch: false, contact: 'sms',   simResp: 'yes', simDelay: 7400 },
  { pid: 'PID‑2601', initials: 'T.R.', age: 70, priority: 3, waitDays: 97,  preOpDate: '17 days ago', surgeonMatch: false, contact: 'both',  simResp: 'none', simDelay: null },
  { pid: 'PID‑3488', initials: 'W.F.', age: 58, priority: 4, waitDays: 42,  preOpDate: '3 days ago',  surgeonMatch: true,  contact: 'email', simResp: 'no',  simDelay: 4200 },
  { pid: 'PID‑1945', initials: 'B.O.', age: 73, priority: 2, waitDays: 155, preOpDate: '35 days ago', surgeonMatch: false, contact: 'both',  simResp: 'none', simDelay: null },
  { pid: 'PID‑3267', initials: 'S.A.', age: 64, priority: 3, waitDays: 82,  preOpDate: '10 days ago', surgeonMatch: true,  contact: 'sms',   simResp: 'yes', simDelay: 4800 },
];

// ---------- Session state (single global case for demo simplicity) ----------
let state = {
  active: false,
  mode: 'audience',   // 'audience' | 'simulated'
  patients: [],       // live copies of seed, with claim+response state
  nextClaimIdx: 0,
  startedAt: null,
};

function freshPatients() {
  return PATIENTS_SEED.map(p => ({
    ...p,
    claimedBy: null,
    phoneId: null,
    responded: false,
    response: null,
  }));
}

function publicPatient(p) {
  return {
    pid: p.pid, initials: p.initials, age: p.age, priority: p.priority,
    waitDays: p.waitDays, preOpDate: p.preOpDate, surgeonMatch: p.surgeonMatch,
    contact: p.contact,
    claimed: !!p.claimedBy, responded: p.responded, response: p.response,
  };
}

const simTimers = [];
function clearSimTimers() { while (simTimers.length) clearTimeout(simTimers.pop()); }

function fireSimulatedResponses(onlyUnresponded = true) {
  state.patients.forEach(p => {
    if (p.simResp === 'none') return;
    if (onlyUnresponded && p.responded) return;
    const base = p.simDelay != null ? p.simDelay : 3000;
    simTimers.push(setTimeout(() => {
      if (p.responded) return;
      p.responded = true;
      p.response = p.simResp;
      io.to('screen').emit('response', { pid: p.pid, response: p.simResp, source: 'simulated' });
    }, 300 + Math.random() * base * 0.5));
  });
}

// ---------- Socket wiring ----------
io.on('connection', (socket) => {
  socket.on('join-screen', () => {
    socket.join('screen');
    socket.emit('state', {
      active: state.active,
      mode: state.mode,
      patients: state.patients.map(publicPatient),
    });
  });

  socket.on('join-phone', (payload) => {
    if (!state.active) { socket.emit('no-case'); return; }
    const phoneId = payload && payload.phoneId;

    // First priority: has this phoneId already claimed a patient this session? Resume it.
    let p = phoneId ? state.patients.find(x => x.phoneId === phoneId) : null;

    // Otherwise assign a fresh unclaimed, unresponded patient
    if (!p) {
      const idx = state.patients.findIndex(x => !x.claimedBy && !x.phoneId && !x.responded);
      if (idx === -1) { socket.emit('waitlist-full'); return; }
      p = state.patients[idx];
      if (phoneId) p.phoneId = phoneId;
    }

    const wasAlreadyClaimed = !!p.claimedBy;
    p.claimedBy = socket.id;
    socket.data.pid = p.pid;
    socket.emit('assigned', { patient: publicPatient(p) });

    // Only tell the screen if this is a NEW claim, not a reconnect
    if (!wasAlreadyClaimed) {
      io.to('screen').emit('claimed', { pid: p.pid });
    }
  });

  socket.on('phone-response', ({ response }) => {
    const p = state.patients.find(x => x.claimedBy === socket.id);
    if (!p || p.responded) return;
    if (response !== 'yes' && response !== 'no') return;
    p.responded = true;
    p.response = response;
    io.to('screen').emit('response', { pid: p.pid, response, source: 'audience' });
  });

  socket.on('trigger', ({ mode }) => {
    clearSimTimers();
    state.active = true;
    state.mode = (mode === 'simulated') ? 'simulated' : 'audience';
    state.patients = freshPatients();
    state.nextClaimIdx = 0;
    state.startedAt = Date.now();
    io.emit('case-started', {
      mode: state.mode,
      patients: state.patients.map(publicPatient),
    });
    if (state.mode === 'simulated') fireSimulatedResponses();
  });

  socket.on('switch-mode', ({ mode }) => {
    if (!state.active) return;
    const prev = state.mode;
    state.mode = (mode === 'simulated') ? 'simulated' : 'audience';
    io.emit('mode-changed', { mode: state.mode });
    if (state.mode === 'simulated' && prev !== 'simulated') {
      fireSimulatedResponses(true);
    }
    if (state.mode === 'audience' && prev === 'simulated') {
      clearSimTimers();
    }
  });

  socket.on('reset', () => {
    clearSimTimers();
    state = { active: false, mode: 'audience', patients: [], nextClaimIdx: 0, startedAt: null };
    io.emit('reset');
  });

  // Scheduler confirmed a booking — broadcast the winner to everyone
  socket.on('confirm', ({ pid }) => {
    const winner = state.patients.find(p => p.pid === pid);
    if (!winner) return;
    io.emit('result', { winnerPid: pid, winnerInitials: winner.initials });
  });

  socket.on('disconnect', () => {
    // If a phone disconnects without responding, free up their slot
    const p = state.patients.find(x => x.claimedBy === socket.id);
    if (p && !p.responded) {
      p.claimedBy = null;
      io.to('screen').emit('unclaimed', { pid: p.pid });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ORecover live on :${PORT}`);
});
