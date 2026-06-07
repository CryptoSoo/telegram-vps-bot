require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { NodeSSH } = require('node-ssh');
const fs = require('fs');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// User whitelist - only these users can use the bot
const ALLOWED_USERS = process.env.ALLOWED_USERS ? 
  process.env.ALLOWED_USERS.split(',').map(id => parseInt(id)) : [];

// Per-user server storage
const USER_DATA_DIR = './user_data';
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR);
}

// Store SSH connections
const connections = {};

// User context to track selected server
const userContext = {};

// Track which user is in which mode (addserver, run, etc)
const userMode = {};

function getUserServersPath(userId) {
  return `${USER_DATA_DIR}/${userId}.json`;
}

function loadUserServers(userId) {
  const path = getUserServersPath(userId);
  try {
    if (fs.existsSync(path)) {
      return JSON.parse(fs.readFileSync(path, 'utf-8'));
    }
  } catch (error) {
    console.error(`Error loading servers for user ${userId}:`, error);
  }
  return {};
}

function saveUserServers(userId, servers) {
  const path = getUserServersPath(userId);
  fs.writeFileSync(path, JSON.stringify(servers, null, 2));
}

// Middleware to check if user is allowed
function checkAuth(ctx, next) {
  if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(ctx.from.id)) {
    ctx.reply(
      '❌ Unauthorized!\n\n' +
      `Your ID: ${ctx.from.id}\n\n` +
      'Ask the bot owner to add you to ALLOWED_USERS.'
    );
    return;
  }
  return next();
}

bot.use(checkAuth);

// Helper function to execute commands via SSH
async function executeCommand(userId, serverId, command) {
  try {
    const servers = loadUserServers(userId);
    
    if (!servers[serverId]) {
      return `Error: Server "${serverId}" not found`;
    }

    const serverConfig = servers[serverId];
    const connectionKey = `${userId}_${serverId}`;

    if (!connections[connectionKey]) {
      connections[connectionKey] = new NodeSSH();
    }

    const ssh = connections[connectionKey];

    if (!ssh.isConnected()) {
      await ssh.connect({
        host: serverConfig.host,
        username: serverConfig.username,
        privateKeyPath: serverConfig.privateKeyPath,
        password: serverConfig.password,
        port: serverConfig.port || 22,
        readyTimeout: 30000,
        socketConnectTimeout: 30000,
      });
    }

    const result = await ssh.execCommand(command);
    return result.stdout || result.stderr || 'Command executed (no output)';
  } catch (error) {
    console.error('SSH Error:', error);
    return `❌ SSH Error: ${error.message}`;
  }
}

// Split large output into chunks for Telegram
async function sendLargeOutput(ctx, command, result) {
  const maxLen = 4000;
  
  if (result.length <= maxLen) {
    ctx.reply(
      `📤 Command: \`${command}\`\n\n📥 Result:\n\`\`\`\n${result}\n\`\`\``,
      { parse_mode: 'Markdown' }
    );
  } else {
    // Send command
    ctx.reply(`📤 Command: \`${command}\`\n\n📥 Result (part 1/${Math.ceil(result.length / maxLen)}):`, 
      { parse_mode: 'Markdown' });
    
    // Split and send chunks
    for (let i = 0; i < result.length; i += maxLen) {
      const chunk = result.substring(i, i + maxLen);
      const partNum = Math.floor(i / maxLen) + 1;
      const totalParts = Math.ceil(result.length / maxLen);
      
      await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit
      ctx.reply(`\`\`\`\n${chunk}\n\`\`\`\n(part ${partNum}/${totalParts})`, 
        { parse_mode: 'Markdown' });
    }
  }
}

// Get server list keyboard
function getServerKeyboard(userId) {
  const servers = loadUserServers(userId);
  const keys = Object.keys(servers);
  if (keys.length === 0) {
    return null;
  }

  const buttons = keys.map(key => [Markup.button.callback(key, `server_${key}`)]);
  return Markup.inlineKeyboard(buttons);
}

// Set bot commands for / autocomplete
bot.telegram.setMyCommands([
  { command: 'start', description: 'Welcome message' },
  { command: 'servers', description: 'List your servers' },
  { command: 'addserver', description: 'Add a new server' },
  { command: 'select', description: 'Select a server' },
  { command: 'removeserver', description: 'Delete a server' },
  { command: 'status', description: 'System status' },
  { command: 'cpu', description: 'CPU usage' },
  { command: 'memory', description: 'Memory stats' },
  { command: 'disk', description: 'Disk usage' },
  { command: 'uptime', description: 'System uptime' },
  { command: 'processes', description: 'Top processes' },
  { command: 'run', description: 'Run custom command' },
  { command: 'help', description: 'Show all commands' },
]);

// Start command
bot.command('start', (ctx) => {
  ctx.reply(
    `Welcome to VPS Manager Bot! 🤖\n\n` +
    `Available commands:\n` +
    `/servers - List your servers\n` +
    `/addserver - Add a new server\n` +
    `/select - Select a server\n` +
    `/status - Get system status\n` +
    `/cpu - Check CPU usage\n` +
    `/memory - Check memory\n` +
    `/disk - Check disk\n` +
    `/uptime - Get uptime\n` +
    `/processes - Top processes\n` +
    `/run - Run custom command\n` +
    `/removeserver - Delete a server\n` +
    `/help - Show all commands\n\n` +
    `ℹ️ Your ID: <code>${ctx.from.id}</code>`,
    { parse_mode: 'HTML' }
  );
});

// List servers
bot.command('servers', (ctx) => {
  const servers = loadUserServers(ctx.from.id);
  const keys = Object.keys(servers);
  
  if (keys.length === 0) {
    ctx.reply('No servers configured. Use /addserver to add one.');
    return;
  }

  let message = '📍 Your Servers:\n\n';
  keys.forEach((key, idx) => {
    const server = servers[key];
    const current = userContext[ctx.from.id] === key ? '✅' : '⚪';
    message += `${current} **${key}** - ${server.host}\n`;
  });

  ctx.replyWithMarkdown(message, getServerKeyboard(ctx.from.id));
});

// Select server
bot.command('select', (ctx) => {
  const servers = loadUserServers(ctx.from.id);
  const keys = Object.keys(servers);
  
  if (keys.length === 0) {
    ctx.reply('No servers available.');
    return;
  }

  ctx.reply('Select a server:', getServerKeyboard(ctx.from.id));
});

bot.action(/server_(.+)/, (ctx) => {
  const serverId = ctx.match[1];
  userContext[ctx.from.id] = serverId;
  ctx.answerCbQuery(`Selected: ${serverId}`);
  ctx.reply(`✅ Server "${serverId}" selected!`);
});

// Add server
bot.command('addserver', async (ctx) => {
  userMode[ctx.from.id] = 'addserver';
  
  ctx.reply(
    '⚠️ **SECURITY NOTE:** Do NOT paste your actual private key!\n\n' +
    'Send JSON config for your server:\n\n' +
    '```json\n' +
    '{\n' +
    '  "name": "prod-server",\n' +
    '  "host": "1.2.3.4",\n' +
    '  "username": "root",\n' +
    '  "port": 22,\n' +
    '  "privateKeyPath": "/root/.ssh/id_rsa"\n' +
    '}\n' +
    '```\n\n' +
    'Or with password:\n\n' +
    '```json\n' +
    '{\n' +
    '  "name": "staging",\n' +
    '  "host": "5.6.7.8",\n' +
    '  "username": "deploy",\n' +
    '  "port": 22,\n' +
    '  "password": "your_password"\n' +
    '}\n' +
    '```',
    { parse_mode: 'Markdown' }
  );
});

// Remove server
bot.command('removeserver', (ctx) => {
  const servers = loadUserServers(ctx.from.id);
  const keys = Object.keys(servers);
  
  if (keys.length === 0) {
    ctx.reply('No servers to remove.');
    return;
  }

  const buttons = keys.map(key => [Markup.button.callback(`🗑️ ${key}`, `delete_${key}`)]);
  ctx.reply('Select a server to delete:', Markup.inlineKeyboard(buttons));
});

bot.action(/delete_(.+)/, (ctx) => {
  const serverId = ctx.match[1];
  const servers = loadUserServers(ctx.from.id);
  
  if (servers[serverId]) {
    delete servers[serverId];
    if (userContext[ctx.from.id] === serverId) {
      delete userContext[ctx.from.id];
    }
    saveUserServers(ctx.from.id, servers);
    ctx.answerCbQuery(`Deleted: ${serverId}`);
    ctx.reply(`✅ Server "${serverId}" deleted!`);
  }
});

// Get current server
function getCurrentServer(userId) {
  return userContext[userId];
}

// Status command
bot.command('status', async (ctx) => {
  const serverId = getCurrentServer(ctx.from.id);
  if (!serverId) {
    ctx.reply('No server selected. Use /select first.');
    return;
  }

  ctx.sendChatAction('typing');
  const uptime = await executeCommand(ctx.from.id, serverId, 'uptime -p');
  const load = await executeCommand(ctx.from.id, serverId, "cat /proc/loadavg | awk '{print $1, $2, $3}'");

  ctx.reply(
    `🖥️ Status (${serverId}):\n` +
    `Uptime: ${uptime}\n` +
    `Load Average: ${load}`
  );
});

// CPU command
bot.command('cpu', async (ctx) => {
  const serverId = getCurrentServer(ctx.from.id);
  if (!serverId) {
    ctx.reply('No server selected. Use /select first.');
    return;
  }

  ctx.sendChatAction('typing');
  const result = await executeCommand(
    ctx.from.id,
    serverId,
    "top -bn1 | grep 'Cpu(s)' | awk '{print \"CPU Usage: \" $2}'"
  );
  ctx.reply(`📊 CPU (${serverId}):\n${result}`);
});

// Memory command
bot.command('memory', async (ctx) => {
  const serverId = getCurrentServer(ctx.from.id);
  if (!serverId) {
    ctx.reply('No server selected. Use /select first.');
    return;
  }

  ctx.sendChatAction('typing');
  const result = await executeCommand(
    ctx.from.id,
    serverId,
    "free -h | grep Mem | awk '{print \"Total: \" $2 \"\\nUsed: \" $3 \"\\nFree: \" $4}'"
  );
  ctx.reply(`💾 Memory (${serverId}):\n${result}`);
});

// Disk command
bot.command('disk', async (ctx) => {
  const serverId = getCurrentServer(ctx.from.id);
  if (!serverId) {
    ctx.reply('No server selected. Use /select first.');
    return;
  }

  ctx.sendChatAction('typing');
  const result = await executeCommand(
    ctx.from.id,
    serverId,
    "df -h / | tail -1 | awk '{print \"Size: \" $2 \"\\nUsed: \" $3 \"\\nAvailable: \" $4 \"\\nUsage: \" $5}'"
  );
  ctx.reply(`💿 Disk (${serverId}):\n${result}`);
});

// Uptime command
bot.command('uptime', async (ctx) => {
  const serverId = getCurrentServer(ctx.from.id);
  if (!serverId) {
    ctx.reply('No server selected. Use /select first.');
    return;
  }

  ctx.sendChatAction('typing');
  const result = await executeCommand(ctx.from.id, serverId, 'uptime -p');
  ctx.reply(`⏱️ Uptime (${serverId}):\n${result}`);
});

// Processes command
bot.command('processes', async (ctx) => {
  const serverId = getCurrentServer(ctx.from.id);
  if (!serverId) {
    ctx.reply('No server selected. Use /select first.');
    return;
  }

  ctx.sendChatAction('typing');
  const result = await executeCommand(
    ctx.from.id,
    serverId,
    "ps aux --sort=-%cpu | head -6 | tail -5 | awk '{print $11, \" (CPU: \" $3 \"%)\" }'"
  );
  ctx.reply(`⚙️ Top Processes (${serverId}):\n${result}`);
});

// Run custom command
bot.command('run', (ctx) => {
  const serverId = getCurrentServer(ctx.from.id);
  if (!serverId) {
    ctx.reply('No server selected. Use /select first.');
    return;
  }

  userMode[ctx.from.id] = 'run';
  ctx.reply(
    '⏱️ Send the command you want to execute:\n\n' +
    '⚠️ Note: This bot does NOT support interactive commands (scripts that ask questions).\n' +
    'Use non-interactive commands only, for example:\n' +
    '• `apt update && apt upgrade -y` (non-interactive)\n' +
    '• `docker ps` (shows output)\n' +
    '• `systemctl status nginx`\n\n' +
    'If your command needs input, use flags to make it non-interactive.'
  );
});

// Help command
bot.command('help', (ctx) => {
  ctx.reply(
    `📋 Available Commands:\n\n` +
    `*Server Management:*\n` +
    `/servers - List your servers\n` +
    `/addserver - Add new server\n` +
    `/select - Select active server\n` +
    `/removeserver - Delete a server\n\n` +
    `*Monitoring (requires /select):*\n` +
    `/status - System status\n` +
    `/cpu - CPU usage\n` +
    `/memory - Memory stats\n` +
    `/disk - Disk usage\n` +
    `/uptime - System uptime\n` +
    `/processes - Top processes\n\n` +
    `*Advanced:*\n` +
    `/run - Execute custom command`,
    { parse_mode: 'Markdown' }
  );
});

// Text handler for modes
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const mode = userMode[userId];
  const text = ctx.message.text;

  if (mode === 'addserver') {
    try {
      const config = JSON.parse(text);
      if (!config.name || !config.host || !config.username) {
        ctx.reply('❌ Missing required fields: name, host, username');
        return;
      }

      if (!config.privateKeyPath && !config.password) {
        ctx.reply('❌ Need either privateKeyPath or password');
        return;
      }

      const servers = loadUserServers(userId);
      servers[config.name] = {
        host: config.host,
        username: config.username,
        port: config.port || 22,
        privateKeyPath: config.privateKeyPath,
        password: config.password,
      };

      saveUserServers(userId, servers);
      ctx.reply(`✅ Server "${config.name}" added!`);
      delete userMode[userId];
    } catch (error) {
      ctx.reply('❌ Invalid JSON format. Make sure all text is in double quotes and syntax is correct.');
    }
  } else if (mode === 'run') {
    const serverId = getCurrentServer(userId);
    if (!serverId) {
      ctx.reply('No server selected.');
      return;
    }

    ctx.sendChatAction('typing');
    const result = await executeCommand(userId, serverId, text);
    await sendLargeOutput(ctx, text, result);
    delete userMode[userId];
  }
});

// Error handling
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

bot.launch();
console.log('🤖 Telegram VPS Manager Bot started!');
if (ALLOWED_USERS.length > 0) {
  console.log(`✅ Restricted to ${ALLOWED_USERS.length} user(s)`);
} else {
  console.log('⚠️ No user restrictions (public bot)');
}
