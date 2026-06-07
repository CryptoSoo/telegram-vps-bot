# Deployment Guide - Telegram VPS Manager Bot

## 🚀 Deploy to Railway (Recommended - Free & Easy)

Railway offers **free tier with $5/month credits** - perfect for bots!

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/telegram-vps-bot.git
git push -u origin main
```

### Step 2: Deploy on Railway

1. Go to https://railway.app
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your `telegram-vps-bot` repository
5. Railway will auto-detect Node.js app

### Step 3: Configure Environment Variables

In Railway dashboard:
- Go to Variables tab
- Add:
  - `TELEGRAM_TOKEN` - Your bot token
  - `NODE_ENV` - `production`

**Note:** SSH keys cannot be copied to Railway easily. See **Alternative: Use SSH Password** below.

## ⚠️ SSH Key Configuration on Railway

Since Railway doesn't have file system persistence, you need to use **SSH password authentication** instead of keys:

### Update `.env` in Railway:

```
TELEGRAM_TOKEN=your_token
VPS_HOST=31.58.76.151
VPS_USER=root
VPS_PORT=22
VPS_PASSWORD=your_ssh_password
```

### Update `bot.js` to support password auth:

The bot already supports password auth! Just set `VPS_PASSWORD` in `.env` and remove `VPS_PRIVATE_KEY_PATH`.

Modify the SSH config section in bot.js:

```javascript
const sshConfig = {
  host: serverConfig.host,
  username: serverConfig.username,
  password: serverConfig.password, // Add this
  privateKeyPath: serverConfig.privateKeyPath, // Keep both
  port: serverConfig.port || 22,
  readyTimeout: 20000,
};
```

## Alternative: Local Deployment (24/7 on Your Machine)

### Using PM2

```bash
npm install -g pm2
cd /home/cryptosoo/Vs\ Code/telegram-vps-bot
pm2 start bot.js --name "vps-bot"
pm2 startup
pm2 save
```

Restart bot on reboot automatically.

### Using systemd (Linux)

Create `/etc/systemd/system/vps-bot.service`:

```ini
[Unit]
Description=Telegram VPS Bot
After=network.target

[Service]
Type=simple
User=cryptosoo
WorkingDirectory=/home/cryptosoo/Vs Code/telegram-vps-bot
ExecStart=/usr/bin/node /home/cryptosoo/Vs\ Code/telegram-vps-bot/bot.js
Restart=on-failure
RestartSec=10
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable vps-bot
sudo systemctl start vps-bot
```

Check status:

```bash
sudo systemctl status vps-bot
```

## 🎯 Production Checklist

- [ ] `.env` file has all required variables
- [ ] `servers.json` is configured with your servers
- [ ] SSH credentials (key or password) are set
- [ ] Bot token is valid
- [ ] Test with `/start` command in Telegram
- [ ] Select server with `/select`
- [ ] Test commands: `/cpu`, `/memory`, etc.

## Troubleshooting

**Bot doesn't respond:**
- Check Railway logs: Dashboard → Deployments → View Logs
- Verify bot token in environment variables
- Ensure SSH connection works

**SSH connection fails:**
- Test SSH connection manually
- Verify credentials (host, user, password/key)
- Check if VPS firewall allows port 22

**Commands timeout:**
- SSH commands taking too long
- Network connection issues
- Try simpler commands first

## Free Hosting Options

| Service | Free Tier | Pros | Cons |
|---------|-----------|------|------|
| **Railway** | $5/month credits | Easy, persistent, good performance | Limited credits |
| **Render** | Sleeps after 15 min inactivity | Web services, good docs | Not ideal for 24/7 bots |
| **Oracle Cloud** | Always free | 24/7, real VPS | Complex setup |
| **Replit** | Free tier | Code editor, quick deploy | Limited resources |

**Recommendation:** Railway is best for Telegram bots.

