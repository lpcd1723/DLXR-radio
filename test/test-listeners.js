#!/usr/bin/env node
/**
 * Synthetic Listener Load & Telemetry Test
 * Simulates concurrent /stream connections and monitors /api/nowplaying listener metrics.
 */

const http = require('http');

const TARGET_HOST = process.env.TEST_HOST || 'http://localhost:8080';

function getListeners() {
  return new Promise((resolve) => {
    http.get(`${TARGET_HOST}/api/nowplaying`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          resolve(j.listeners);
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', (err) => {
      resolve(null);
    });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log(`\n=== SYNTHETIC LISTENER TEST (${TARGET_HOST}) ===\n`);

  // 1. Initial baseline
  const baseline = await getListeners();
  console.log('1. Baseline Listeners before simulation:', baseline);

  // 2. Connect 5 synthetic listeners
  console.log('\n2. Connecting 5 concurrent synthetic listeners to /stream...');
  const sockets = [];
  for (let i = 1; i <= 5; i++) {
    const req = http.get(`${TARGET_HOST}/stream`, (res) => {
      res.on('data', () => {});
    });
    req.on('error', () => {});
    sockets.push(req);
    await sleep(80);
  }

  await sleep(600);
  const active5 = await getListeners();
  console.log('-> Listeners with 5 active synthetic clients:', active5);

  // 3. Connect 5 more (total 10)
  console.log('\n3. Connecting 5 more synthetic listeners (Total: 10)...');
  for (let i = 1; i <= 5; i++) {
    const req = http.get(`${TARGET_HOST}/stream`, (res) => {
      res.on('data', () => {});
    });
    req.on('error', () => {});
    sockets.push(req);
    await sleep(80);
  }

  await sleep(600);
  const active10 = await getListeners();
  console.log('-> Listeners with 10 active synthetic clients:', active10);

  // 4. Disconnect 6 listeners
  console.log('\n4. Disconnecting 6 listeners (4 remaining)...');
  for (let i = 0; i < 6; i++) {
    const req = sockets.pop();
    if (req) req.destroy();
  }

  await sleep(600);
  const remaining4 = await getListeners();
  console.log('-> Listeners with 4 remaining synthetic clients:', remaining4);

  // 5. Disconnect all remaining listeners
  console.log('\n5. Disconnecting all remaining clients...');
  while (sockets.length > 0) {
    const req = sockets.pop();
    if (req) req.destroy();
  }

  await sleep(600);
  const final = await getListeners();
  console.log('-> Final Listeners after all synthetic clients disconnected:', final);

  console.log('\n=== TEST COMPLETED SUCCESSFULLY ===\n');
  process.exit(0);
}

run();
