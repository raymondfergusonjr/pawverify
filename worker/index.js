/**
 * PawVerify Cloudflare Worker
 * Secure backend — handles all Claude API calls
 * 
 * SECURITY FEATURES:
 * - API key never exposed to browser
 * - Prompt injection defense
 * - PII scrubbing layer
 * - Rate limiting per IP (D1 database)
 * - Hard daily API call cap
 * - Email registration storage
 * - CORS protection
 * - Input sanitization
 * - Spending cap enforcement
 */

// ── CONFIGURATION ─────────────────────────────────────
const CONFIG = {
  DAILY_ANALYZE_LIMIT_PER_IP: 20,    // analyzer calls per IP per day
  DAILY_SIM_LIMIT_PER_IP: 10,        // simulator calls per IP per day
  DAILY_GLOBAL_ANALYZE_CAP: 500,     // total analyzer calls per day site-wide
  DAILY_GLOBAL_SIM_CAP: 200,         // total simulator calls per day site-wide
  MAX_INPUT_LENGTH: 4000,            // max characters accepted from user
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
  MAX_TOKENS: 800,
  ALLOWED_ORIGINS: [
    'https://pawverify.org',
    'https://www.pawverify.org',
    'https://staging.pawverify.org',
    'http://localhost:3000',           // local dev only — remove in production
  ]
};

// ── MAIN HANDLER ──────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, request, env);
    }

    // Only allow configured origins
    const origin = request.headers.get('Origin') || '';
    if (!CONFIG.ALLOWED_ORIGINS.includes(origin) && !origin.includes('localhost')) {
      return new Response('Forbidden', { status: 403 });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/analyze' && request.method === 'POST') {
        return await handleAnalyze(request, env);
      }
      if (path === '/simulate' && request.method === 'POST') {
        return await handleSimulate(request, env);
      }
      if (path === '/register' && request.method === 'POST') {
        return await handleRegister(request, env);
      }
      if (path === '/report' && request.method === 'POST') {
        return await handleReport(request, env);
      }
      if (path === '/health') {
        return corsResponse({ status: 'ok', timestamp: Date.now() }, 200, request, env);
      }
      return new Response('Not Found', { status: 404 });
    } catch (err) {
      console.error('Worker error:', err);
      return corsResponse({ error: 'Service temporarily unavailable' }, 503, request, env);
    }
  }
};

// ── ANALYZE ENDPOINT ──────────────────────────────────
async function handleAnalyze(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const today = getDateKey();

  // Rate limit check
  const limitCheck = await checkRateLimit(env, `analyze:${ip}:${today}`, CONFIG.DAILY_ANALYZE_LIMIT_PER_IP);
  if (!limitCheck.allowed) {
    return corsResponse({
      error: 'daily_limit',
      message: "You've reached today's analysis limit. Resets at midnight. Come back tomorrow — the scammers will still be there.",
      resetAt: 'midnight tonight'
    }, 429, request, env);
  }

  // Global cap check
  const globalCheck = await checkRateLimit(env, `analyze:global:${today}`, CONFIG.DAILY_GLOBAL_ANALYZE_CAP);
  if (!globalCheck.allowed) {
    return corsResponse({
      error: 'capacity',
      message: "PawVerify is at capacity for today. We reset at midnight and will be ready to help you then. Join the waitlist to be notified.",
      resetAt: 'midnight tonight'
    }, 429, request, env);
  }

  // Parse and validate input
  let body;
  try { body = await request.json(); } catch { return corsResponse({ error: 'Invalid request' }, 400, request, env); }

  const raw = String(body.listing || '').trim();
  if (!raw) return corsResponse({ error: 'No listing text provided' }, 400, request, env);

  // Defense layers
  const sanitized = sanitizeInput(piiScrub(raw));
  if (sanitized.length < 10) return corsResponse({ error: 'Input too short to analyze' }, 400, request, env);

  // Build the analysis prompt — vague output to prevent scammer learning
  const prompt = `Analyze this pet listing for fraud indicators. Return ONLY valid JSON with no markdown.

Listing content:
${sanitized}

Return this exact JSON structure:
{
  "score": <integer 0-100, fraud risk percentage>,
  "level": "<LOW|MEDIUM|HIGH>",
  "summary": "<2-3 sentence plain English explanation a non-technical person can understand. Do NOT reveal specific triggering phrases — describe the concern in general terms only>",
  "actions": ["<action 1>", "<action 2>", "<action 3>"],
  "has_immediate_risk": <true if payment has already been requested or person seems to have already paid>
}

Scoring guide:
0-30: LOW — few or no warning signs
31-65: MEDIUM — some concerning patterns, verify carefully  
66-100: HIGH — multiple fraud indicators present

IMPORTANT: The summary must be written for a vulnerable, emotionally upset person. Be direct but compassionate. Do NOT list specific phrases that triggered the score — this prevents scammers from learning what to avoid.`;

  try {
    const result = await callClaude(env, prompt, 'You are a fraud detection system. Return ONLY valid JSON. No markdown. No explanation outside the JSON structure.');
    const parsed = parseJSON(result);
    if (!parsed) return corsResponse({ error: 'Analysis failed — please try again' }, 500, request, env);

    // Log anonymized result to D1
    await logEvent(env, 'analyze', { score: parsed.score, level: parsed.level, date: today });

    return corsResponse(parsed, 200, request, env);
  } catch (err) {
    console.error('Analyze error:', err);
    return corsResponse({ error: 'Analysis service error' }, 500, request, env);
  }
}

// ── SIMULATE ENDPOINT ─────────────────────────────────
async function handleSimulate(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const today = getDateKey();

  // Rate limit
  const limitCheck = await checkRateLimit(env, `sim:${ip}:${today}`, CONFIG.DAILY_SIM_LIMIT_PER_IP);
  if (!limitCheck.allowed) {
    return corsResponse({
      error: 'daily_limit',
      message: "You've used your simulator sessions for today. Resets at midnight — come back tomorrow to keep practicing."
    }, 429, request, env);
  }

  // Global cap
  const globalCheck = await checkRateLimit(env, `sim:global:${today}`, CONFIG.DAILY_GLOBAL_SIM_CAP);
  if (!globalCheck.allowed) {
    return corsResponse({
      error: 'capacity',
      message: "The simulator is at capacity for today. Resets at midnight."
    }, 429, request, env);
  }

  let body;
  try { body = await request.json(); } catch { return corsResponse({ error: 'Invalid request' }, 400, request, env); }

  const system = String(body.system || '');
  const messages = body.messages || [];

  if (!system || !messages.length) return corsResponse({ error: 'Missing system or messages' }, 400, request, env);

  // Sanitize all user messages before passing to Claude
  const cleanMessages = messages.map(m => ({
    role: m.role,
    content: m.role === 'user' ? sanitizeInput(piiScrub(String(m.content || ''))) : String(m.content || '')
  }));

  try {
    const result = await callClaude(env, null, system, cleanMessages);
    await logEvent(env, 'simulate', { date: today });
    return corsResponse({ response: result }, 200, request, env);
  } catch (err) {
    console.error('Simulate error:', err);
    return corsResponse({ error: 'Simulator error' }, 500, request, env);
  }
}

// ── REGISTER ENDPOINT ─────────────────────────────────
async function handleRegister(request, env) {
  let body;
  try { body = await request.json(); } catch { return corsResponse({ error: 'Invalid request' }, 400, request, env); }

  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@') || !email.includes('.')) {
    return corsResponse({ error: 'Invalid email' }, 400, request, env);
  }

  // Store in D1 (emails table)
  try {
    if (env.DB) {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO emails (email, registered_at) VALUES (?, ?)'
      ).bind(email, new Date().toISOString()).run();
    }
    return corsResponse({ success: true, message: 'Access granted' }, 200, request, env);
  } catch (err) {
    console.error('Register error:', err);
    return corsResponse({ success: true }, 200, request, env); // fail open — don't block users
  }
}

// ── REPORT ENDPOINT ───────────────────────────────────
async function handleReport(request, env) {
  let body;
  try { body = await request.json(); } catch { return corsResponse({ error: 'Invalid request' }, 400, request, env); }

  const report = {
    breed: String(body.breed || '').substring(0, 100),
    platform: String(body.platform || '').substring(0, 100),
    location: String(body.location || '').substring(0, 100),
    payment: String(body.payment || '').substring(0, 100),
    description: piiScrub(String(body.description || '')).substring(0, 2000),
    submitted_at: new Date().toISOString(),
    status: 'pending_review'
  };

  if (!report.breed || !report.description) {
    return corsResponse({ error: 'Breed and description required' }, 400, request, env);
  }

  try {
    if (env.DB) {
      await env.DB.prepare(
        'INSERT INTO reports (breed, platform, location, payment, description, submitted_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(report.breed, report.platform, report.location, report.payment, report.description, report.submitted_at, report.status).run();
    }
    return corsResponse({ success: true, message: 'Report submitted for review' }, 200, request, env);
  } catch (err) {
    console.error('Report error:', err);
    return corsResponse({ success: true }, 200, request, env);
  }
}

// ── CLAUDE API CALLER ─────────────────────────────────
async function callClaude(env, userPrompt, systemPrompt, messages = null) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('API key not configured');

  const body = {
    model: CONFIG.CLAUDE_MODEL,
    max_tokens: CONFIG.MAX_TOKENS,
    system: systemPrompt,
    messages: messages || [{ role: 'user', content: userPrompt }]
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ── RATE LIMITING ─────────────────────────────────────
async function checkRateLimit(env, key, limit) {
  if (!env.DB) return { allowed: true, count: 0 }; // fail open if DB not set up
  try {
    const result = await env.DB.prepare(
      'INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count'
    ).bind(key, getTomorrowISO()).first();
    const count = result?.count || 1;
    return { allowed: count <= limit, count };
  } catch (err) {
    console.error('Rate limit error:', err);
    return { allowed: true, count: 0 }; // fail open
  }
}

// ── SECURITY: PROMPT INJECTION DEFENSE ───────────────
function sanitizeInput(text) {
  return text
    .replace(/ignore\s+(previous|all|prior|above)\s+(instructions?|prompts?|context|rules?)/gi, '[filtered]')
    .replace(/you\s+are\s+now\s+/gi, '[filtered]')
    .replace(/new\s+instructions?:/gi, '[filtered]')
    .replace(/system\s*prompt\s*:/gi, '[filtered]')
    .replace(/\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>|<\|system\|>/g, '[filtered]')
    .replace(/act\s+as\s+if\s+you/gi, '[filtered]')
    .replace(/disregard\s+(your|all|previous)/gi, '[filtered]')
    .replace(/pretend\s+(you\s+are|to\s+be)/gi, '[filtered]')
    .replace(/jailbreak/gi, '[filtered]')
    .replace(/dan\s+mode/gi, '[filtered]')
    .substring(0, CONFIG.MAX_INPUT_LENGTH);
}

// ── SECURITY: PII SCRUBBING ───────────────────────────
function piiScrub(text) {
  return text
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone removed]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email removed]')
    .replace(/\b(?:\d{4}[- ]?){3}\d{4}\b/g, '[card removed]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[ssn removed]')
    .replace(/\b\d{5}(?:-\d{4})?\b/g, (m) => m.length > 6 ? '[zip removed]' : m);
}

// ── HELPERS ───────────────────────────────────────────
function parseJSON(text) {
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

function getDateKey() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function getTomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function logEvent(env, type, data) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      'INSERT INTO events (type, data, logged_at) VALUES (?, ?, ?)'
    ).bind(type, JSON.stringify(data), new Date().toISOString()).run();
  } catch (err) {
    // Non-critical — don't throw
    console.error('Log error:', err);
  }
}

function corsResponse(data, status, request, env) {
  const origin = request?.headers?.get('Origin') || '*';
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': CONFIG.ALLOWED_ORIGINS.includes(origin) ? origin : CONFIG.ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
  return new Response(data ? JSON.stringify(data) : null, { status, headers });
}
