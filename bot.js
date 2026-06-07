require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { NodeSSH } = require('node-ssh');
const fs = require('fs');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Store SSH connections
const connections = {};

// Load server configs from JSON
const CONFIG_FILE = './servers.json';
let servers = {};

function loadServers() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      servers = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error('Error loading servers:', error);
    servers = {};
  }
}

function saveServers() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(servers, null, 2));
}

loadServers();

// User context to track selected server
const userContext = {};

// Helper function to execute commands via SSH
async function executeCommand(serverId, command) {
  try {
    if (!servers[serverId]) {
      return `Error: Server "${serverId}" not found`;
    }

    const serverConfig = servers[serverId];
    const connectionKey = serverId;

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
        readyTimeout: 20000,
      });
    }

    const result = await ssh.execCommand(command);
    return result.stdout || result.stderr || 'Command executed (no output)';
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

// Get server list keyboard
function getServerKeyboard() {
  const keys = Object.keys(servers);
  if (keys.length === 0) {
    return null;
  }

  const buttons = keys.map(key => [Markup.button.callback(key, `server_${key}`)]);
  return Markup.inlineKeyboard(buttons);
}

// Start command
bot.command('start', (ctx) => {
  ctx.reply(
    `Welcome to VPS Manager Bot! 🤖\n\n` +
    `Available commands:\n` +
    `/servers - List all servers\n` +
    `/addserver - Add a new server\n` +
    `/select - Select a server\n` +
    `/status - Get system status\n` +
    `/cpu - Check CPU usage\n` +
    `/memory - Check memory\n` +
    `/disk - Check disk\n` +
    `/uptime - Get uptime\n` +
    `/processes - Top processes\n` +
    `/run - Run custom command\n` +
    `/help - Show all commands`
  );
});

// List servers
bot.command('servers', (ctx) => {
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

  ctx.replyWithMarkdown(message, getServerKeyboard());
});

// Select server
bot.command('select', (ctx) => {
  const keys = Object.keys(servers);
  if (keys.length === 0) {
    ctx.reply('No servers available.');
    return;
  }

  ctx.reply('Select a server:', getServerKeyboard());
});

bot.action(/server_(.+)/, (ctx) => {
  const serverId = ctx.match[1];
  userContext[ctx.from.id] = serverId;
  ctx.answerCbQuery(`Selected: ${serverId}`);
  ctx.reply(`✅ Server "${serverId}" selected!`);
});

// Add server
bot.command('addserver', async (ctx) => {
  ctx.reply(
    'To add a server, send the configuration as JSON:\n\n' +
    '```json\n' +
    '{\n' +
    '  "name": "prod-server",\n' +
    '  "host": "1.2.3.4",\n' +
    '  "username": "root",\n' +
    '  "port": 22,\n' +
    '  "privateKeyPath": "/path/to/key"\n' +
    '}\n' +
    '```\n\n' +
    'Send the JSON in your next message.'
  );

  const listener = (msg) => {
    try {
      const config = JSON.parse(msg.text);
      if (!config.name || !config.host || !config.username || !config.privateKeyPath) {
        ctx.reply('Missing required fields: name, host, username, privateKeyPath');
        return;
      }

      servers[config.name] = {
        host: config.host,
        username: config.username,
        port: config.port || 22,
        privateKeyPath: config.privateKeyPath,
      };

      saveServers();
      ctx.reply(`✅ Server "${config.name}" added successfully!`);
      bot.off('text', listener);
    } catch (error) {
      ctx.reply('Invalid JSON format');
    }
  };

  bot.on('text', listener);
});

// Get current server
function getCurrentServer(userId) {
  const serverId = userContext[userId];
  if (!serverId) {
    return null;
  }
  return serverId;
}

// Status command
bot.command('status', async (ctx) => {
  const serverId = getCurrentServer(ctx.from.id);
  if (!serverId) {
    ctx.reply('No server selected. Use /select first.');
    return;
  }

  ctx.sendChatAction('typing');
  const uptime = await executeCommand(
    serverId,
    'uptime -p'
  );
  const load = await executeCommand(
    serverId,
    "cat /proc/loadavg | awk '{print $1, $2, $3}'"
  );

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
  const result = await executeCommand(serverId, 'uptime -p');
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

  ctx.reply('Send the command you want to execute on the server.');

  const listener = async (msg) => {
    if (msg.text.startsWith('/')) {
      bot.off('text', listener);
      return;
    }

    ctx.sendChatAction('typing');
    const result = await executeCommand(serverId, msg.text);
    
    const trimmed = result.substring(0, 4000);
    ctx.reply(
      `📤 Command: \`${msg.text}\`\n\n` +
      `📥 Result:\n\`\`\`\n${trimmed}\n\`\`\``,
      { parse_mode: 'Markdown' }
    );

    bot.off('text', listener);
  };

  bot.on('text', listener);
});

// Help command
bot.command('help', (ctx) => {
  ctx.reply(
    `📋 Available Commands:\n\n` +
    `*Server Management:*\n` +
    `/servers - List all servers\n` +
    `/addserver - Add new server\n` +
    `/select - Select active server\n\n` +
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

// Error handling
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

bot.launch();
console.log('🤖 Telegram VPS Manager Bot started!');
