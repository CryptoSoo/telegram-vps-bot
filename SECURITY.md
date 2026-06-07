# 🔐 Security Guide

## Critical Security Features

### 1. **Per-User Server Isolation** ✅
Each user has their own separate `user_data/{userId}.json` file with servers they control. Users cannot see or access other users' servers.

### 2. **User Whitelist/Authorization** ✅
Restrict bot access to specific Telegram users by setting `ALLOWED_USERS` environment variable.

**Setup:**
```bash
# Get your Telegram ID by sending /start to the bot
# Set in Railway Variables (or .env locally):
ALLOWED_USERS=123456789,987654321
```

Users not in the whitelist get a rejection message showing their ID.

### 3. **Never Send Private Keys Over Telegram** ⚠️ IMPORTANT
**DO NOT paste your private key content into chat!**

When adding a server, send only the FILE PATH:
```json
{
  "name": "prod",
  "host": "1.2.3.4",
  "username": "root",
  "port": 22,
  "privateKeyPath": "/home/deploy/.ssh/id_rsa"
}
```

### 4. **SSH Key Best Practices**

For the bot to work, your SSH key must exist on the machine running the bot:

**Local/PM2 Setup:**
```bash
# Generate dedicated key for bot
ssh-keygen -t rsa -b 4096 -f ~/.ssh/bot_key -N ""

# Copy to VPS
ssh-copy-id -i ~/.ssh/bot_key root@1.2.3.4

# Set in .env
VPS_PRIVATE_KEY_PATH=/home/cryptosoo/.ssh/bot_key
```

**Railway Setup:**
Use password authentication instead (safer for cloud):
```json
{
  "name": "prod",
  "host": "1.2.3.4",
  "username": "deploy",
  "port": 22,
  "password": "your_ssh_password"
}
```

### 5. **User Data Storage**
```
user_data/
├── 123456789.json    # User 1's servers
├── 987654321.json    # User 2's servers
└── ...
```

Each file is private to that user ID. Delete a file to remove a user's data.

## 🛡️ Deployment Security Checklist

### Local (PM2/Systemd)
- [ ] SSH keys are NOT in git (check `.gitignore`)
- [ ] `.env` file is NOT in git
- [ ] Use dedicated SSH key for bot
- [ ] Restrict bot to authorized users via `ALLOWED_USERS`
- [ ] Regular backups of `user_data/` directory

### Railway/Cloud
- [ ] Use SSH password auth (don't paste keys)
- [ ] Set `TELEGRAM_TOKEN` in environment variables
- [ ] Set `ALLOWED_USERS` to restrict access
- [ ] Don't store credentials in code
- [ ] Regularly rotate SSH passwords

## 🚨 What NOT to Do

❌ **DON'T:**
- Send private keys as text in Telegram
- Share the bot with untrusted users
- Leave `ALLOWED_USERS` empty in production
- Store passwords in `.env.example`
- Commit `.env` file to git
- Use `root` user for SSH when possible

✅ **DO:**
- Use dedicated SSH keys/accounts
- Whitelist users with `ALLOWED_USERS`
- Use strong SSH passwords
- Encrypt sensitive data at rest
- Rotate credentials regularly
- Audit user access logs

## Per-User Data Example

**User 123456789's servers** (`user_data/123456789.json`):
```json
{
  "prod": {
    "host": "1.2.3.4",
    "username": "deploy",
    "port": 22,
    "privateKeyPath": "/home/bot/.ssh/prod_key"
  },
  "staging": {
    "host": "5.6.7.8",
    "username": "deploy",
    "port": 22,
    "password": "staging_password"
  }
}
```

**User 987654321's servers** (`user_data/987654321.json`):
```json
{
  "myserver": {
    "host": "9.10.11.12",
    "username": "admin",
    "port": 2222,
    "privateKeyPath": "/home/bot/.ssh/myserver_key"
  }
}
```

Each user can only see and control their own servers!

## 🔄 Key Rotation

Regularly rotate SSH keys:

```bash
# Generate new key
ssh-keygen -t rsa -b 4096 -f ~/.ssh/bot_key_new

# Add to VPS
ssh-copy-id -i ~/.ssh/bot_key_new root@1.2.3.4

# Update bot config, test it works

# Remove old key from VPS
ssh-keygen -R ~/.ssh/bot_key

# Delete old key
rm ~/.ssh/bot_key ~/.ssh/bot_key.pub
```

## 🔍 Audit & Monitoring

To check who has access:
1. Look at `ALLOWED_USERS` environment variable
2. Check `user_data/` directory for user files
3. Review server configurations in each user file

To revoke access:
1. Remove user ID from `ALLOWED_USERS`
2. Delete their `user_data/{userId}.json` file

## 📝 Common Security Questions

**Q: Can users see each other's servers?**
A: No! Each user only sees their own `user_data/{userId}.json` file.

**Q: What if I add someone to the bot?**
A: They get their own blank `user_data/{userId}.json` when they first use `/addserver`.

**Q: How do I remove a user?**
A: Remove their ID from `ALLOWED_USERS` AND delete their `user_data/{userId}.json` file.

**Q: Can I use the same SSH key for multiple servers?**
A: Yes, but best practice is one key per server for better security.

**Q: Is the bot token secure?**
A: Keep it private! Anyone with it can control the bot. Don't commit it to git.

For more info, see README.md and DEPLOY.md
