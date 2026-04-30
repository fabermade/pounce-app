/**
 * GET /api/f/[slug]/embed.js — Embeddable Pounce form widget.
 *
 * Returns a self-contained JS script (< 15KB) that:
 * 1. Creates a styled container where the <script> tag is placed
 * 2. Renders the form inside the container (no iframe — direct DOM)
 * 3. Handles submission via fetch to /api/f/[slug]
 * 4. Shows loading/success/error states
 * 5. Auto-resizes to fit content
 * 6. Applies branding from form config
 *
 * Usage:
 *   <script src="https://www.pouncefirst.com/api/f/contact/embed.js"></script>
 *
 * Or with container options:
 *   <script src="https://www.pouncefirst.com/api/f/contact/embed.js"
 *           data-primary-color="#FF6B35"
 *           data-border-radius="12"></script>
 */

import type { APIRoute } from 'astro';
import { db, forms } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';

// Sanitize strings for embedding in JS template literals (prevent XSS)
function sanitizeForScript(str: string): string {
  return str
    .replace(/</g, '\\x3c')
    .replace(/>/g, '\\x3e')
    .replace(/`/g, '\\x60')
    .replace(/\$/g, '\\x24');
}

export const GET: APIRoute = async ({ params, url }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response('/* Invalid form slug */', {
      status: 400, headers: { 'Content-Type': 'application/javascript' },
    });
  }

  // Verify form exists and is active
  const [form] = await db
    .select()
    .from(forms)
    .where(eq(forms.slug, slug))
    .limit(1);

  if (!form || !form.active) {
    return new Response('/* Form not found or inactive */', {
      status: 404, headers: { 'Content-Type': 'application/javascript' },
    });
  }

  const fields = form.fields as Array<{
    name: string;
    type: string;
    label: string;
    required?: boolean;
    placeholder?: string;
    options?: string[];
  }>;

  const APP_URL = import.meta.env.APP_URL ?? process.env.APP_URL ?? 'https://www.pouncefirst.com';
  const submitUrl = `${APP_URL}/api/f/${slug}`;

  // Read customization from query params or use defaults (sanitize for script context)
  const primaryColor = sanitizeForScript(url.searchParams.get('primaryColor') ?? '#1E1E1E');
  const borderRadius = sanitizeForScript(url.searchParams.get('borderRadius') ?? '8');

  // Sanitize form data for embedding in JS (prevent XSS via </script> or template literals)
  const formName = sanitizeForScript(form.name);
  const submitMessage = sanitizeForScript(form.submitMessage ?? "Thank you! We'll be in touch soon.");
  const redirectUrl = form.redirectUrl ?? '';
  const fieldsJson = JSON.stringify(fields)
    .replace(/</g, '\\x3c')
    .replace(/>/g, '\\x3e');

  // Build the embed script — self-contained, no external dependencies
  const script = `(function(){
'use strict';

// ─── Config ──────────────────────────────────────────
var FORM_NAME = '${formName}';
var SUBMIT_URL = '${submitUrl}';
var SUBMIT_MSG = '${submitMessage}';
var REDIRECT_URL = '${redirectUrl}';
var FIELDS = ${fieldsJson};
var PRIMARY = '${primaryColor}';
var RADIUS = '${borderRadius}';

// ─── Styles ──────────────────────────────────────────
var css = document.createElement('style');
css.textContent = [
  '.pounce-form *{box-sizing:border-box;margin:0;padding:0}',
  '.pounce-form{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:500px;margin:0 auto;padding:24px;background:#fff;border-radius:'+RADIUS+'px;border:1px solid #e5e7eb}',
  '.pounce-form h2{font-size:20px;font-weight:600;color:#1E1E1E;margin-bottom:16px}',
  '.pounce-form label{display:block;font-size:14px;font-weight:500;color:#374151;margin-bottom:4px}',
  '.pounce-form input[type="text"],.pounce-form input[type="email"],.pounce-form input[type="tel"],.pounce-form textarea,.pounce-form select{width:100%;padding:10px 12px;font-size:14px;border:1px solid #d1d5db;border-radius:'+RADIUS+'px;background:#fff;color:#1E1E1E;outline:none;transition:border-color 0.2s}',
  '.pounce-form input:focus,.pounce-form textarea:focus,.pounce-form select:focus{border-color:'+PRIMARY+';box-shadow:0 0 0 3px rgba(30,30,30,0.1)}',
  '.pounce-form textarea{min-height:80px;resize:vertical}',
  '.pounce-form .pounce-field{margin-bottom:16px}',
  '.pounce-form .pounce-field-error{color:#dc2626;font-size:12px;margin-top:4px}',
  '.pounce-form .pounce-checkbox-wrap{display:flex;align-items:center;gap:8px}',
  '.pounce-form .pounce-checkbox-wrap input{width:18px;height:18px;accent-color:'+PRIMARY+'}',
  '.pounce-form .pounce-checkbox-wrap label{font-size:14px;color:#374151;margin-bottom:0}',
  '.pounce-form button[type="submit"]{width:100%;padding:12px;font-size:16px;font-weight:600;color:#fff;background:'+PRIMARY+';border:none;border-radius:'+RADIUS+'px;cursor:pointer;transition:opacity 0.2s}',
  '.pounce-form button[type="submit"]:hover{opacity:0.9}',
  '.pounce-form button[type="submit"]:disabled{opacity:0.6;cursor:not-allowed}',
  '.pounce-form .pounce-success{text-align:center;padding:32px 16px}',
  '.pounce-form .pounce-success h3{font-size:18px;font-weight:600;color:#1E1E1E;margin-bottom:8px}',
  '.pounce-form .pounce-success p{color:#6b7280;font-size:14px}',
  '.pounce-form .pounce-error{text-align:center;padding:32px 16px}',
  '.pounce-form .pounce-error h3{font-size:18px;font-weight:600;color:#dc2626;margin-bottom:8px}',
  '.pounce-form .pounce-error p{color:#6b7280;font-size:14px;margin-bottom:16px}',
  '.pounce-form .pounce-error button{padding:8px 16px;border:1px solid #d1d5db;border-radius:'+RADIUS+'px;background:#fff;cursor:pointer;font-size:14px}',
  '.pounce-form .pounce-loading{display:flex;align-items:center;justify-content:center;padding:32px}',
  '.pounce-form .pounce-spinner{width:24px;height:24px;border:3px solid #e5e7eb;border-top-color:'+PRIMARY+';border-radius:50%;animation:pounce-spin 0.8s linear infinite}',
  '@keyframes pounce-spin{to{transform:rotate(360deg)}}',
  '.pounce-hp{position:absolute;left:-9999px;opacity:0;height:0;width:0}'
].join('\\n');
document.head.appendChild(css);

// ─── Render ──────────────────────────────────────────
var scriptEl = document.currentScript || document.scripts[document.scripts.length - 1];
var container = document.createElement('div');
container.className = 'pounce-form';
scriptEl.parentNode.insertBefore(container, scriptEl);

function render() {
  container.innerHTML = '';
  var form = document.createElement('form');
  form.setAttribute('novalidate', '');

  // Title
  var title = document.createElement('h2');
  title.textContent = FORM_NAME;
  form.appendChild(title);

  // Honeypot (hidden spam trap)
  var hp = document.createElement('div');
  hp.className = 'pounce-hp';
  hp.setAttribute('aria-hidden', 'true');
  var hpInput = document.createElement('input');
  hpInput.type = 'text';
  hpInput.name = 'pounce_hp';
  hpInput.tabIndex = -1;
  hpInput.autocomplete = 'off';
  hp.appendChild(hpInput);
  form.appendChild(hp);

  // Fields
  FIELDS.forEach(function(field) {
    var wrap = document.createElement('div');
    wrap.className = 'pounce-field';

    if (field.type === 'checkbox') {
      var cbWrap = document.createElement('div');
      cbWrap.className = 'pounce-checkbox-wrap';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.name = field.name;
      cb.id = 'pounce-' + field.name;
      cb.value = 'true';
      if (field.required) cb.required = true;
      var cbLabel = document.createElement('label');
      cbLabel.htmlFor = 'pounce-' + field.name;
      cbLabel.textContent = field.label;
      cbWrap.appendChild(cb);
      cbWrap.appendChild(cbLabel);
      wrap.appendChild(cbWrap);
    } else {
      var label = document.createElement('label');
      label.htmlFor = 'pounce-' + field.name;
      label.textContent = field.label + (field.required ? ' *' : '');
      wrap.appendChild(label);

      var input;
      if (field.type === 'textarea') {
        input = document.createElement('textarea');
      } else if (field.type === 'select') {
        input = document.createElement('select');
        var defOpt = document.createElement('option');
        defOpt.value = '';
        defOpt.textContent = field.placeholder || 'Select...';
        input.appendChild(defOpt);
        (field.options || []).forEach(function(opt) {
          var o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          input.appendChild(o);
        });
      } else {
        input = document.createElement('input');
        input.type = field.type;
      }

      input.name = field.name;
      input.id = 'pounce-' + field.name;
      if (field.placeholder) input.placeholder = field.placeholder;
      if (field.required) input.required = true;
      wrap.appendChild(input);
    }

    form.appendChild(wrap);
  });

  // Submit button
  var btn = document.createElement('button');
  btn.type = 'submit';
  btn.textContent = 'Submit';
  btn.id = 'pounce-submit';
  form.appendChild(btn);

  // Error container
  var errDiv = document.createElement('div');
  errDiv.id = 'pounce-errors';
  form.appendChild(errDiv);

  form.addEventListener('submit', handleSubmit);
  container.appendChild(form);
}

function showLoading() {
  container.innerHTML = '<div class="pounce-loading"><div class="pounce-spinner"></div></div>';
}

function showSuccess() {
  if (REDIRECT_URL && REDIRECT_URL.startsWith('https://')) {
    window.location.href = REDIRECT_URL;
    return;
  }
  container.innerHTML = '';
  var wrap = document.createElement('div');
  wrap.className = 'pounce-success';
  var h3 = document.createElement('h3');
  h3.textContent = '\\u2713 ' + SUBMIT_MSG;
  var p = document.createElement('p');
  p.textContent = "We'll get back to you soon.";
  wrap.appendChild(h3);
  wrap.appendChild(p);
  container.appendChild(wrap);
}

function showError(msg) {
  container.innerHTML = '';
  var wrap = document.createElement('div');
  wrap.className = 'pounce-error';
  var h3 = document.createElement('h3');
  h3.textContent = 'Something went wrong';
  var p = document.createElement('p');
  p.textContent = msg || 'Please try again.';
  var btn = document.createElement('button');
  btn.textContent = 'Try Again';
  btn.onclick = function() { window.__pounceRetry(); };
  wrap.appendChild(h3);
  wrap.appendChild(p);
  wrap.appendChild(btn);
  container.appendChild(wrap);
}

window.__pounceRetry = render;

function handleSubmit(e) {
  e.preventDefault();
  var form = e.target;
  var data = {};

  // Check honeypot — if filled, silently "succeed" (it's a bot)
  var hp = form.querySelector('[name="pounce_hp"]');
  if (hp && hp.value) {
    showSuccess();
    return;
  }

  // Collect form data
  var formData = new FormData(form);
  formData.forEach(function(val, key) {
    if (key === 'pounce_hp') return; // skip honeypot
    data[key] = val;
  });

  // Convert checkbox values to boolean
  FIELDS.forEach(function(field) {
    if (field.type === 'checkbox') {
      data[field.name] = data[field.name] === 'true' ? true : false;
    }
  });

  showLoading();

  fetch(SUBMIT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(function(r) { return r.json(); })
  .then(function(result) {
    if (result.success) {
      showSuccess();
    } else {
      showError(result.error || result.message || 'Submission failed.');
    }
  })
  .catch(function() {
    showError('Network error. Please check your connection and try again.');
  });
}

render();
})();`;

  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
};