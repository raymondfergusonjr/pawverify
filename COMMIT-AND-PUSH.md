# PawVerify — Commit & Push to GitHub

Everything is built and ready. When you sit down at your desktop,
follow these steps in order and you're done.

---

## Before You Start

You need:
- [ ] Git installed — git-scm.com (free)
- [ ] GitHub account — github.com (free)
- [ ] Your GitHub repo URL (the one you already created)
  - Looks like: https://github.com/raymondfergusonjr/pawverify

---

## Step 1 — Unzip

Unzip `pawverify-preprod.zip` wherever you want to keep the project.
Example: `C:\Projects\pawverify` or `~/Projects/pawverify`

---

## Step 2 — Open Terminal

**Windows:** Right-click inside the unzipped folder → "Open in Terminal"
or open PowerShell and `cd` to the folder

**Mac:** Right-click the folder → "New Terminal at Folder"

---

## Step 3 — Initialize Git & Push

Copy and run these commands one at a time:

```bash
git init
git add .
git commit -m "initial pre-production build"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/pawverify.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your actual GitHub username.

---

## Step 4 — Confirm It Worked

Go to your GitHub repo in the browser.
You should see these files:

```
pawverify/
├── public/
│   └── index.html
├── worker/
│   ├── index.js
│   ├── wrangler.toml
│   └── schema.sql
├── README.md
└── COMMIT-AND-PUSH.md
```

If you see them — you're done. The code is safe and backed up.

---

## Every Future Update

Once the initial push is done, updating is just three commands:

```bash
git add .
git commit -m "describe what you changed"
git push
```

If Cloudflare Pages is connected to the repo,
it auto-deploys to pawverify.org every time you push to main.

---

## Local Testing Before You Push

Want to preview the site before pushing?
Just open `public/index.html` directly in Chrome or Firefox.
No server needed — it opens like any file.

The UI, Learn modules, Quiz, and all navigation work immediately.
The analyzer and simulator need the Worker deployed to fully fire,
but everything else is testable right from the file.

---

## If You Get a GitHub Authentication Error

GitHub no longer accepts passwords in terminal.
You need a Personal Access Token:

1. GitHub → Settings → Developer Settings
2. Personal Access Tokens → Tokens (classic)
3. Generate new token → check "repo" scope
4. Copy the token — use it as your password when prompted

Or set up SSH keys — GitHub has a simple guide at:
docs.github.com/en/authentication/connecting-to-github-with-ssh

---

That's it. Unzip → terminal → five commands → pushed.
