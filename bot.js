require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { NodeSSH } = require('node-ssh');
const fs = require('fs');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// User whitelist
const ALLOWED_USERS = process.env.ALLOWED_USERS ? 
  process.env.ALLOWED_USERS.split(',').map(id => parseInt(id)) : [];

// Per-user server storage
const USER_DATA_DIR = './user_data';
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR);
}

// Store SSH connections
const connections = {};
const userContext = {};
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

function checkAuth(ctx, next) {
  if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(ctx.from.id)) {
    ctx.reply('❌ Unauthorized!');
    return;
  }
  return next();
}

bot.use(checkAuth);

// SSH connection with better error handling
async function executeCommand(userId, serverId, command) {
  try {
    const servers = loadUserServers(userId);
    
    if (!servers[serverId]) {
      return `❌ Server "${serverId}" not found`;
    }

    const serverConfig = servers[serverId];
    const connectionKey = `${userId}_${serverId}`;

    console.log(`[SSH] Connecting to ${serverId}...`);
    console.log(`[SSH] Host: ${serverConfig.host}, User: ${serverConfig.username}, Port: ${serverConfig.port}`);

    if (!connections[connectionKey]) {
      connections[connectionKey] = new NodeSSH();
    }

    const ssh = connections[connectionKey];

    if (!ssh.isConnected()) {
      console.log(`[SSH] Not connected, creating new connection...`);
      
      const connectOptions = {
        host: serverConfig.host,
        username: serverConfig.username,
        port: serverConfig.port || 22,
        readyTimeout: 60000,
        socketConnectTimeout: 60000,
      };

      if (serverConfig.password) {
        connectOptions.password = serverConfig.password;
        console.log(`[SSH] Using password auth`);
      } else if (serverConfig.privateKeyPath) {
        connectOptions.privateKeyPath = serverConfig.privateKeyPath;
        console.log(`[SSH] Using key auth: ${serverConfig.privateKeyPath}`);
      }

      await ssh.connect(connectOptions);
      console.log(`[SSH] Connected successfully!`);
    } else {
      console.log(`[SSH] Using existing connection`);
    }

    console.log(`[SSH] Executing: ${command}`);
    const result = await ssh.execCommand(command, { cwd: '/root' });
    console.log(`[SSH] Command completed`);
    
    return result.stdout || result.stderr || 'Command executed (no output)';
  } catch (error) {
    console.error(`[SSH Error] ${error.message}`);
    console.error(`[SSH Error Stack] ${error.stack}`);
    
    return `❌ SSH Connection Failed\n\n` +
      `Error: ${error.message}\n\n` +
      `Troubleshooting:\n` +
      `1. Test manually: ssh -v ${servers[serverId]?.username}@${servers[serverId]?.host}\n` +
      `2. Check port: telnet ${servers[serverId]?.host} ${servers[serverId]?.port || 22}\n` +
      `3. Verify password/key is correct\n` +
      `4. Check firewall allows port ${servers[serverId]?.port || 22}`;
  }
}

async function sendLargeOutput(ctx, command, result) {
  const maxLen = 4000;
  
  if (result.length <= maxLen) {
    ctx.reply(
      `📤 Command: \`${command}\`\n\n📥 Result:\n\`\`\`\n${result}\n\`\`\``,
      { parse_mode: 'Markdown' }
    );
  } else {
    ctx.reply(`📤 Command: \`${command}\`\n\n📥 Result (${Math.ceil(result.length / maxLen)} parts):`, 
      { parse_mode: 'Markdown' });
    
    for (let i = 0; i < result.length; i += maxLen) {
      const chunk = result.substring(i, i + maxLen);
      const partNum = Math.floor(i / maxLen) + 1;
      const totalParts = Math.ceil(result.length / maxLen);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      ctx.reply(`\`\`\`\n${chunk}\n\`\`\`\n(part ${partNum}/${totalParts})`, 
        { parse_mode: 'Markdown' });
    }
  }
}

function getServerKeyboard(userId) {
  const servers = loadUserServers(userId);
  const keys = Object.keys(servers);
  if (keys.length === 0) {
    return null;
  }

  const buttons = keys.map(key => [Markup.button.callback(key, `server_${key}`)]);
  return Markup.inlineKeyboard(buttons);
}

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
  { command: 'testconnection', description: 'Test SSH connection' },
]);

bot.command('start', (ctx) => {
  ctx.reply(
    `Welcome to VPS Manager Bot! 🤖\n\n` +
    `/servers - List servers\n` +
    `/addserver - Add server\n` +
    `/select - Select server\n` +
    `/cpu - CPU usage\n` +
    `/memory - Memory\n` +
    `/disk - Disk\n` +
    `/run - Run command\n` +
    `/testconnection - Debug SSH\n` +
    `/help - Help\n\n` +
    `Your ID: <code>${ctx.from.id}</code>`,
    { parse_mode: 'HTML' }
  );
});

bot.command('servers', (ctx) => {
  const servers = loadUserServers(ctx.from.id);
  const keys = Object.keys(servers);
  
  if (keys.length === 0) {
    ctx.reply('No servers. Use /addserver');
    return;
  }

  let message = '📍 Your Servers:\n\n';
  keys.forEach((key) => {
    const server = servers[key];
    const current = userContext[ctx.from.id] === key ? '✅' : '⚪';
    message += `${current} **${key}** - ${server.host}:${server.port || 22}\n`;
  });

  ctx.replyWithMarkdown(message, getServerKeyboard(ctx.from.id));
});

bot.command('select', (ctx) => {
  const servers = loadUserServers(ctx.from.id);
  if (Object.keys(servers).length === 0) {
    ctx.reply('No servers available.');
    return;
  }
  ctx.reply('Select a server:', getServerKeyboard(ctx.from.id));
});

bot.action(/server_(.+)/, (ctx) => {
  const serverId = ctx.match[1];
  userContext[ctx.from.id] = serverId;
  ctx.answerCbQuery(`Selected: ${serverId}`);
  ctx.reply(`✅ Selected: "${serverId}"`);
});

bot.command('addserver', (ctx) => {
  userMode[ctx.from.id] = 'addserver';
  ctx.reply('Send JSON:\n```json\n{"name":"prod","host":"1.2.3.4","username":"root","port":22,"password":"pass"}\n```', 
    { parse_mode: 'Markdown' });
});

bot.command('removeserver', (ctx) => {
  const servers = loadUserServers(ctx.from.id);
  const keys = Object.keys(servers);
  
  if (keys.length === 0) {
    ctx.reply('No servers to remove.');
    return;
  }

  const buttons = keys.map(key => [Markup.button.callback(`🗑️ ${key}`, `delete_${key}`)]);
  ctx.reply('Delete which server?', Markup.inlineKeyboard(buttons));
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
    ctx.reply(`✅ Deleted: "${serverId}"`);
  }
});

// Test connection command
bot.command('testconnection', async (ctx) => {
  const serverId = userContext[ctx.from.id];
  if (!serverId) {
    ctx.reply('Select a server with /select first');
    return;
  }

  ctx.reply('🧪 Testing SSH connection...');
  const result = await executeCommand(ctx.from.id, serverId, 'echo "SSH Connection OK!"');
  await sendLargeOutput(ctx, 'echo test', result);
});

function getCurrentServer(userId) {
  return userContext[userId];
}

bot.command('status', async (ctx) => {
  const serverId = getCurrentServer(ctx.from.id);
  if (!serverId) {
    ctx.reply('Use /select first');
    return;
  }
  ctx.sendChatAction('typing');
  const uptime = await executeCommand(ctx.from.id, serverId, 'uptime -p');
  ctx.reply(`⏱️ Uptime:\n${uptime}`);
});

bot.command('cpu', async (ctx) => {
  const serverId = getCurrentServer(ctx.from.id);
  if (!serverId) {
    ctx.reply('Use /select first');
    return;
  }
  ctx.sendChatAction('typing');
  const result = await executeCommand(ctx.from.id, serverId, "top -bn1 | grep 'Cpu(s)'");
  ctx.reply(`📊 CPU:\n${result}`);
});

bot.command('memory', async (ctx) => {
  const serverId = getCurrentServer(ctx.from.id);
  if (!serverId) {
    ctx.reply('Use /select first');
    return;
  }
  ctx.sendChatAction('typing');
  const result = await executeCommand(ctx.from.id, serverId, 'free -h');
  ctx.reply(`💾 Memory:\n\`\`\`\n${result}\n\`\`\``, { parse_mode: 'Markdown' });
});

bot.command('disk', async (ctx) => {
  const serverId = getCurrentServer(ctx.from.id);
  if (!serverId) {
    ctx.reply('Use /select first');
    return;
  }
  ctx.sendChatAction('typing');
  const result = await executeCommand(ctx.from.id, serverId, 'df -h /');
  ctx.reply(`💿 Disk:\n\`\`\`\n${result}\n\`\`\``, { parse_mode: 'Markdown' });
});

bot.command('run', (ctx) => {
  const serverId = getCurrentServer(ctx.from.id);
  if (!serverId) {
    ctx.reply('Use /select first');
    return;
  }
  userMode[ctx.from.id] = 'run';
  ctx.reply('Send command:');
});

bot.command('help', (ctx) => {
  ctx.reply(
    `📋 Commands:\n\n` +
    `/servers - List\n` +
    `/addserver - Add\n` +
    `/select - Select\n` +
    `/cpu - CPU\n` +
    `/memory - Memory\n` +
    `/disk - Disk\n` +
    `/run - Run\n` +
    `/testconnection - Test SSH\n` +
    `/help - Help`,
    { parse_mode: 'Markdown' }
  );
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const mode = userMode[userId];
  const text = ctx.message.text;

  if (mode === 'addserver') {
    try {
      const config = JSON.parse(text);
      if (!config.name || !config.host || !config.username) {
        ctx.reply('❌ Missing: name, host, username');
        return;
      }
      if (!config.password && !config.privateKeyPath) {
        ctx.reply('❌ Need password or privateKeyPath');
        return;
      }

      const servers = loadUserServers(userId);
      servers[config.name] = {
        host: config.host,
        username: config.username,
        port: config.port || 22,
        password: config.password,
        privateKeyPath: config.privateKeyPath,
      };

      saveUserServers(userId, servers);
      ctx.reply(`✅ Server "${config.name}" added!`);
      delete userMode[userId];
    } catch (error) {
      ctx.reply('❌ Invalid JSON');
    }
  } else if (mode === 'run') {
    const serverId = getCurrentServer(userId);
    if (!serverId) {
      ctx.reply('No server selected');
      return;
    }

    ctx.sendChatAction('typing');
    const result = await executeCommand(userId, serverId, text);
    await sendLargeOutput(ctx, text, result);
    delete userMode[userId];
  }
});

bot.catch((err) => {
  console.error('Bot error:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

bot.launch();
console.log('🤖 Bot started!');
if (ALLOWED_USERS.length > 0) {
  console.log(`✅ Auth: ${ALLOWED_USERS.length} user(s)`);
}
