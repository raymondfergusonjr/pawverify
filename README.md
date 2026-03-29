# PawVerify — Pre-Production Deployment Guide

## What You're Deploying

```
pawverify-preprod/
├── public/
│   └── index.html          ← Full frontend (Cloudflare Pages)
└── worker/
    ├── index.js            ← Secure backend (Cloudflare Worker)
    ├── wrangler.toml       ← Worker configuration
    └── schema.sql          ← D1 database setup
```

## Architecture

```
Browser (index.html)
    ↓ POST /analyze or /simulate
Cloudflare Worker (index.js)
    → Rate limit check (D1)
    → PII scrub
    → Prompt injection defense
    → Claude API call
    → Return result
Browser renders result
```

Your API key lives ONLY in the Worker as a secret.
It is NEVER in the HTML file. NEVER in GitHub.

---

## Step 1 — Prerequisites

You need:
- Cloudflare account (free) — cloudflare.com
- GitHub account (free) — github.com
- Anthropic API key — console.anthropic.com
- Node.js installed — nodejs.org

---

## Step 2 — Register Your Domain

1. Go to cloudflare.com → Register a Domain
2. Search for "pawverify.org"
3. Purchase (~$9/year)
4. Cloudflare automatically handles DNS and SSL

---

## Step 3 — Create GitHub Repository

1. Go to github.com → New Repository
2. Name it "pawverify" — set to Private
3. Upload the contents of the `public/` folder
4. Create a `staging` branch for testing

---

## Step 4 — Deploy Frontend (Cloudflare Pages)

1. Cloudflare Dashboard → Pages → Create a Project
2. Connect to Git → Select your pawverify repo
3. Build settings:
   - Framework preset: None
   - Build command: (leave empty)
   - Build output directory: public
4. Add custom domain: pawverify.org
5. Repeat for staging branch → staging.pawverify.org

Every push to `main` auto-deploys to pawverify.org
Every push to `staging` auto-deploys to staging.pawverify.org

---

## Step 5 — Create D1 Database

In Cloudflare Dashboard → D1:

```bash
# Install Wrangler CLI
npm install -g wrangler
wrangler login

# Create the database
wrangler d1 create pawverify-db

# Copy the database_id from the output
# Paste it into worker/wrangler.toml where it says YOUR_D1_DATABASE_ID

# Run the schema
wrangler d1 execute pawverify-db --file=worker/schema.sql
```

---

## Step 6 — Deploy the Worker

```bash
# Navigate to worker directory
cd worker/

# Edit wrangler.toml:
# Replace YOUR_CLOUDFLARE_ACCOUNT_ID with your actual account ID
# (Find it: Cloudflare Dashboard → right sidebar)
# Replace YOUR_D1_DATABASE_ID with the ID from Step 5

# Deploy the Worker
wrangler deploy

# Add your Claude API key as a secret (NEVER put this in code)
wrangler secret put ANTHROPIC_API_KEY
# Paste your key when prompted — it's encrypted, never visible again

# Your Worker URL will look like:
# https://pawverify-worker.YOUR-SUBDOMAIN.workers.dev
```

---

## Step 7 — Connect Frontend to Worker

Open `public/index.html` and find this line near the top of the `<script>` section:

```javascript
const WORKER_URL = 'https://pawverify-worker.YOUR-SUBDOMAIN.workers.dev';
```

Replace with your actual Worker URL from Step 6.

Commit and push to GitHub — Pages auto-deploys.

---

## Step 8 — Set Spending Cap

In Cloudflare Dashboard → Account → Billing:
- Set a spending cap/notification at $10/month
- You will receive email notification before being charged

In Anthropic Console (console.anthropic.com):
- Add $10 credit to start
- Set up billing alert at $8 to get advance warning

The Worker's daily global caps (500 analyze + 200 simulate) mean
you will NEVER exceed roughly $3-5/day even at full capacity.

---

## Step 9 — Test Everything

```bash
# Test the health endpoint
curl https://pawverify-worker.YOUR-SUBDOMAIN.workers.dev/health

# Expected response:
# {"status":"ok","timestamp":1234567890}

# Test the analyzer
curl -X POST https://pawverify-worker.YOUR-SUBDOMAIN.workers.dev/analyze \
  -H "Content-Type: application/json" \
  -d '{"listing":"Chihuahua puppies for sale, $200, delivery only, CashApp payment"}'
```

Then visit staging.pawverify.org and test each section manually.

---

## Step 10 — Go Live

When staging tests pass:
1. Merge staging branch to main
2. Cloudflare Pages auto-deploys to pawverify.org
3. You're live.

---

## Rate Limits (Built Into Worker)

| Limit | Value | Purpose |
|-------|-------|---------|
| Analyze per IP per day | 20 | Prevents single user drain |
| Simulator per IP per day | 10 | Prevents single user drain |
| Global analyze per day | 500 | Hard cost cap |
| Global simulate per day | 200 | Hard cost cap |
| Max input length | 4,000 chars | Prevents oversized API calls |

When any limit is hit, users see a friendly message — not an error.

---

## Security Features

| Feature | Implementation |
|---------|---------------|
| API key protection | Worker secret — never in browser |
| DDoS protection | Cloudflare (automatic, free) |
| Rate limiting | D1 database counter per IP |
| Prompt injection defense | Input sanitization in Worker |
| PII scrubbing | Server-side before API call |
| CORS protection | Origin whitelist in Worker |
| Security headers | X-Frame-Options, nosniff, etc. |
| Zero data retention | No conversation storage |

---

## Cost Estimates

| Usage Level | Monthly Cost |
|-------------|-------------|
| Testing (0-50 users) | $0 |
| Early traction (100-500 users) | $1-5 |
| Growing (500-2000 users) | $5-15 |
| Hard cap hit | Never exceeds ~$30 |

Cloudflare Pages + Workers + D1: Free tier
Claude API: ~$0.003 per analyze, ~$0.01 per sim session
Domain: ~$9/year

---

## Monthly Maintenance

Once deployed, monthly tasks are minimal:

1. Check D1 for pending community reports → review and approve/reject
2. Review anonymous event logs for usage trends
3. Check Cloudflare analytics for traffic patterns
4. Verify no billing surprises (there shouldn't be)

That's it. Cloudflare handles everything else automatically.

---

## When You're Ready to File Nonprofit

See the conversation history for the full nonprofit roadmap.
Short version:
- Arkansas LLC: ~$50 one-time
- IRS 1023-EZ (501c3): $275 one-time
- Unlocks: Google.org Ad Grants ($10k/month), Anthropic nonprofit API access, animal welfare organization sponsorships

File AFTER you have documented usage data (emails, anonymous event counts) to prove impact.

---

## Emergency Contacts

If something breaks:
- Cloudflare Status: cloudflarestatus.com
- Anthropic Status: status.anthropic.com
- Worker logs: Cloudflare Dashboard → Workers → pawverify-worker → Logs

---

## Files Reference

| File | Purpose | Edit When |
|------|---------|-----------|
| public/index.html | Everything users see | Adding features, fixing UI |
| worker/index.js | Security, rate limits, API calls | Changing limits, adding endpoints |
| worker/wrangler.toml | Worker config | Changing routes or DB binding |
| worker/schema.sql | Database structure | Adding new data tables |

---

Built with care to protect pet buyers.
PawVerify — Free. No ads. No data collection. Just protection.
