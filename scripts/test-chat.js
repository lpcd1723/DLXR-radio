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

  // Client 1 sets a custom neon color
  ws1.send(JSON.stringify({ type: 'set_color', color: '#ff007f' }));

  await new Promise((r) => setTimeout(r, 300));

  // Client 1 asks for help (should include Admin Commands)
  ws1.send(JSON.stringify({ type: 'message', text: '/help' }));

  await new Promise((r) => setTimeout(r, 300));

  // Client 1 tests mute command
  ws1.send(JSON.stringify({ type: 'message', text: '/mute listener_99 5' }));

  await new Promise((r) => setTimeout(r, 300));

  // Client 2 attempts to send a message while muted
  ws2.send(JSON.stringify({ type: 'message', text: 'Am I muted?' }));

  await new Promise((r) => setTimeout(r, 300));

  // Client 1 unmutes Client 2
  ws1.send(JSON.stringify({ type: 'message', text: '/unmute listener_99' }));

  await new Promise((r) => setTimeout(r, 300));

  // Client 1 executes /clearall
  ws1.send(JSON.stringify({ type: 'message', text: '/clearall' }));

  await new Promise((r) => setTimeout(r, 400));

  ws1.close();
  ws2.close();

  console.log('Verifying received messages:');
  const msg1 = ws1Received.find(m => m.type === 'message' && m.message?.text === 'Live on air right now!');
  const msg2 = ws2Received.find(m => m.type === 'message' && m.message?.text === 'Track ID is unreal 🔥');
  const msgNp = ws1Received.find(m => m.type === 'message' && m.message?.user === 'BOT // RADIO');
  const djAuthSuccess = ws1Received.find(m => m.type === 'auth_success');
  const djMsg = ws2Received.find(m => m.type === 'message' && m.message?.text === 'Top dawg announcement: lock in!' && m.message?.isDJ === true && m.message?.badge === 'TOP DAWG');
  const adminHelp = ws1Received.find(m => m.type === 'message' && m.message?.text && m.message.text.includes('Admin Commands:'));
  const muteConfirm = ws1Received.find(m => m.type === 'message' && m.message?.text && m.message.text.includes('Muted @listener_99'));
  const muteBlocked = ws2Received.find(m => m.type === 'error' && m.message && m.message.includes('currently muted'));
  const chatCleared = ws2Received.find(m => m.type === 'chat_cleared');
  
  // Verify client 2 NEVER saw the mistyped password command
  const leakedCommand = ws2Received.find(m => m.message?.text && m.message.text.includes('typo_password_123'));

  if (msg1 && msg2 && msgNp && djAuthSuccess && djMsg && adminHelp && muteConfirm && muteBlocked && chatCleared && !leakedCommand) {
    console.log('✅ Chat WebSocket test PASSED (including Admin auth, custom badge /title, /mute, /clearall, and safe command suppression)!');
    process.exit(0);
  } else {
    console.error('❌ Chat WebSocket test FAILED:', { 
      msg1: !!msg1, 
      msg2: !!msg2, 
      msgNp: !!msgNp, 
      djAuthSuccess: !!djAuthSuccess, 
      djMsg: !!djMsg, 
      adminHelp: !!adminHelp,
      muteConfirm: !!muteConfirm,
      muteBlocked: !!muteBlocked,
      chatCleared: !!chatCleared,
      leakedCommand: !!leakedCommand 
    });
    process.exit(1);
  }
}, 500);
