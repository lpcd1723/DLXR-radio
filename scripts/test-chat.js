const http = require('http');
const { WebSocket } = require('ws');

// Start server on a test port
process.env.PORT = 8189;
const serverProcess = require('../server.js');

setTimeout(async () => {
  console.log('Testing WebSocket Chat functionality on port 8189...');
  
  const ws1 = new WebSocket('ws://localhost:8189/ws/chat');
  const ws2 = new WebSocket('ws://localhost:8189/ws/chat');

  let ws1Received = [];
  let ws2Received = [];

  ws1.on('message', (msg) => {
    const data = JSON.parse(msg.toString());
    ws1Received.push(data);
    console.log('[WS1 RECV]', data.type, data.message?.text || data.online || data.defaultHandle || '');
  });

  ws2.on('message', (msg) => {
    const data = JSON.parse(msg.toString());
    ws2Received.push(data);
    console.log('[WS2 RECV]', data.type, data.message?.text || data.online || data.defaultHandle || '');
  });

  await new Promise((r) => setTimeout(r, 600));

  // Client 1 sends a custom handle
  ws1.send(JSON.stringify({ type: 'set_handle', handle: 'dj_shadow' }));

  await new Promise((r) => setTimeout(r, 200));

  // Client 1 sends a chat message
  ws1.send(JSON.stringify({ type: 'message', text: 'Live on air right now!' }));

  await new Promise((r) => setTimeout(r, 400));

  // Client 2 sends a reply
  ws2.send(JSON.stringify({ type: 'message', handle: 'listener_99', text: 'Track ID is unreal 🔥' }));

  await new Promise((r) => setTimeout(r, 400));

  // Client 1 authenticates as Admin / Host
  ws1.send(JSON.stringify({ type: 'message', text: '/auth dlxr2026' }));

  await new Promise((r) => setTimeout(r, 400));

  // Client 1 sets a custom title
  ws1.send(JSON.stringify({ type: 'message', text: '/title TOP DAWG' }));

  await new Promise((r) => setTimeout(r, 400));

  // Client 1 sends a mistyped command to ensure it is never broadcast to Client 2
  ws1.send(JSON.stringify({ type: 'message', text: '/aut typo_password_123' }));

  await new Promise((r) => setTimeout(r, 400));

  // Client 1 sends a message with custom badge
  ws1.send(JSON.stringify({ type: 'message', text: 'Top dawg announcement: lock in!' }));

  await new Promise((r) => setTimeout(r, 400));

  ws1.close();
  ws2.close();

  console.log('Verifying received messages:');
  const msg1 = ws1Received.find(m => m.type === 'message' && m.message?.text === 'Live on air right now!');
  const msg2 = ws2Received.find(m => m.type === 'message' && m.message?.text === 'Track ID is unreal 🔥');
  const msgNp = ws1Received.find(m => m.type === 'message' && m.message?.user === 'BOT // RADIO');
  const djAuthSuccess = ws1Received.find(m => m.type === 'auth_success');
  const djMsg = ws2Received.find(m => m.type === 'message' && m.message?.text === 'Top dawg announcement: lock in!' && m.message?.isDJ === true && m.message?.badge === 'TOP DAWG');
  
  // Verify client 2 NEVER saw the mistyped password command
  const leakedCommand = ws2Received.find(m => m.message?.text && m.message.text.includes('typo_password_123'));

  if (msg1 && msg2 && msgNp && djAuthSuccess && djMsg && !leakedCommand) {
    console.log('✅ Chat WebSocket test PASSED (including Admin auth, custom badge /title, and fail-safe suppression)!');
    process.exit(0);
  } else {
    console.error('❌ Chat WebSocket test FAILED:', { ws1Received, ws2Received, leakedCommand: !!leakedCommand });
    process.exit(1);
  }
}, 500);
