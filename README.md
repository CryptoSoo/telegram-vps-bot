# 🤖 Telegram VPS Manager Bot

Advanced Node.js Telegram bot for managing multiple VPS servers with real-time monitoring and command execution.

## ✨ Features

- **Multiple Servers** - Add and manage unlimited VPS servers
- **Server Selection** - Easy server switching with `/select`
- **System Monitoring** - CPU, memory, disk, uptime, load average
- **Process Monitoring** - See top processes by CPU usage
- **Custom Commands** - Run any shell command and get results in Telegram
- **SSH Support** - Key or password authentication
- **24/7 Deployment** - Ready for Railway, PM2, or systemd

## 🚀 Quick Start

### Prerequisites
- Node.js 14+
- Telegram Bot Token (from @BotFather)
- SSH access to your servers

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/telegram-vps-bot.git
cd telegram-vps-bot
npm install
```

### Configuration

1. Create `.env` from template:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your Telegram token:
   ```
   TELEGRAM_TOKEN=your_bot_token_here
   ```

3. Edit `servers.json` with your servers:
   ```json
   {
     "prod": {
       "host": "1.2.3.4",
       "username": "root",
       "port": 22,
       "privateKeyPath": "/home/user/.ssh/id_rsa"
     }
   }
   ```

### Run

```bash
npm start
```

Open Telegram and send `/start` to your bot!

## 📋 Commands

### Server Management
- `/servers` - List all configured servers ✅
- `/select` - Select which server to control
- `/addserver` - Add a new server dynamically

### Monitoring (after selecting server)
- `/status` - System load and uptime
- `/cpu` - CPU usage
- `/memory` - Memory statistics
- `/disk` - Disk space usage
- `/uptime` - System uptime
- `/processes` - Top 5 processes by CPU

### Advanced
- `/run` - Execute custom shell commands
- `/help` - Show all commands

## 🎯 Usage Example

1. `/servers` → See your servers
2. `/select` → Click "prod" to select it
3. `/cpu` → Get CPU usage of prod server
4. `/run` → Type: `docker ps` → Get list of containers
5. `/memory` → Check memory on prod

## 🐳 Deployment

### Local 24/7 (PM2)
```bash
npm install -g pm2
pm2 start bot.js --name vps-bot
pm2 startup && pm2 save
```

### Cloud (Railway - Recommended)
See [DEPLOY.md](./DEPLOY.md) for step-by-step guide.

### SystemD (Linux)
See [DEPLOY.md](./DEPLOY.md) for systemd setup.

## 🔐 Adding Multiple Servers

Send `/addserver` and provide JSON:
```json
{
  "name": "staging",
  "host": "5.6.7.8",
  "username": "deploy",
  "port": 22,
  "privateKeyPath": "/path/to/key"
}
```

**Or use password auth:**
```json
{
  "name": "backup",
  "host": "9.10.11.12",
  "username": "admin",
  "port": 22,
  "password": "your_password"
}
```

## 🛡️ Security

- ⚠️ Never commit `.env` to git (use `.gitignore`)
- Use dedicated SSH keys for bot access
- Consider restricting bot to your Telegram ID
- Use non-root user on VPS when possible
- Keep SSH passwords/keys secure

## 🔧 Advanced: Custom Commands

Use `/run` to execute any command:
- `df -h` - Check disk usage
- `ps aux` - List processes
- `docker ps` - List containers
- `systemctl status nginx` - Check service status
- `curl http://localhost:8080` - Test services
- And anything else your VPS can do!

## 📱 File Structure

```
telegram-vps-bot/
├── bot.js              # Main bot code
├── package.json        # Dependencies
├── servers.json        # Server configurations
├── .env                # Environment variables (not in git)
├── .env.example        # Config template
├── .gitignore          # Git ignore rules
├── Dockerfile          # Docker image
├── README.md           # This file
└── DEPLOY.md           # Deployment guide
```

## 🐛 Troubleshooting

**Bot not responding?**
- Check bot token is valid
- Verify `servers.json` exists and has servers
- Run locally first: `npm start`

**SSH connection fails?**
- Test manually: `ssh -i /path/to/key user@host`
- Verify host, username, and credentials
- Check firewall allows port 22

**Command timeouts?**
- Reduce command complexity
- Check VPS SSH responsiveness
- Look for long-running processes

## 📚 Resources

- [Telegraf.js Docs](https://telegraf.js.org)
- [Node-SSH Docs](https://www.npmjs.com/package/node-ssh)
- [Railway Deployment](https://railway.app)
- [PM2 Documentation](https://pm2.keymetrics.io)

## 📄 License

MIT

## 🤝 Support

For issues, check [DEPLOY.md](./DEPLOY.md) or create an issue on GitHub.
