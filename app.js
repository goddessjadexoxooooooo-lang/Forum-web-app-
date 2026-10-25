(() => {
  const form = document.getElementById('applicationForm');
  const pages = [...form.querySelectorAll('.page')];
  const steps = [...document.querySelectorAll('.step')];
  const backBtn = document.getElementById('backBtn');
  const nextBtn = document.getElementById('nextBtn');
  const navArea = document.getElementById('navArea');
  const status = document.getElementById('formStatus');
  const lastFormPage = pages.length - 2;
  const thanksPage = pages.length - 1;
  let current = 0;

  const signDate = document.getElementById('signDate');
  signDate.value = new Date().toISOString().slice(0, 10);

  const canvas = document.getElementById('signaturePad');
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let hasSignature = false;

  function sizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2d1f14';
    hasSignature = false;
  }

  function point(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasSignature = true;
    canvas.closest('.field').classList.remove('has-error');
  });
  const stop = () => { drawing = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  document.getElementById('clearSignature').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSignature = false;
  });

  function render() {
    pages.forEach((page, i) => { page.hidden = i !== current; });
    const stage = Number(pages[current].dataset.stage);
    steps.forEach((step, i) => {
      step.classList.toggle('is-active', i === stage);
      step.classList.toggle('is-done', i < stage);
      step.querySelector('.step-dot').innerHTML = i < stage
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'
        : '';
      if (i === stage) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    backBtn.hidden = current === 0 || current === thanksPage;
    navArea.hidden = current === thanksPage;
    nextBtn.innerHTML = current === lastFormPage
      ? 'Submit'
      : 'Next <span aria-hidden="true">&rarr;</span>';
    status.textContent = '';
    status.classList.remove('is-error');
    if (current === lastFormPage) requestAnimationFrame(sizeCanvas);
    window.scrollTo({ top: 0 });
  }

  function setError(field, hasError, message) {
    field.classList.toggle('has-error', hasError);
    const msg = field.querySelector('.error-msg');
    if (msg && message) msg.textContent = message;
    else if (msg && msg.dataset.default) msg.textContent = msg.dataset.default;
  }

  function validatePage(page) {
    let firstInvalid = null;
    const flag = (field, bad, message) => {
      setError(field, bad, message);
      if (bad && !firstInvalid) firstInvalid = field;
    };

    page.querySelectorAll('input[required], select[required], textarea[required]').forEach((el) => {
      flag(el.closest('.field'), !el.value.trim());
    });

    page.querySelectorAll('input[type="email"]').forEach((el) => {
      if (el.value.trim()) flag(el.closest('.field'), !el.checkValidity());
    });

    page.querySelectorAll('[data-required-group]').forEach((group) => {
      const name = group.dataset.requiredGroup;
      const checked = group.querySelector(`input[name="${name}"]:checked`);
      if (!checked) return flag(group, true);
      if (name === 'is18' && checked.value === 'No') {
        return flag(group, true, 'You must be at least 18 years old to apply.');
      }
      flag(group, false);
    });

    page.querySelectorAll('[data-required-checks]').forEach((group) => {
      const boxes = [...group.querySelectorAll('input[type="checkbox"]')];
      flag(group, !boxes.every((b) => b.checked));
    });

    page.querySelectorAll('[data-required-signature]').forEach((field) => {
      flag(field, !hasSignature);
    });

    if (firstInvalid) {
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = firstInvalid.querySelector('input, select, textarea');
      if (focusable) focusable.focus({ preventScroll: true });
      return false;
    }
    return true;
  }

  form.addEventListener('input', (e) => {
    const field = e.target.closest('.field');
    if (field && field.classList.contains('has-error')) setError(field, false);
  });
  form.addEventListener('change', (e) => {
    const field = e.target.closest('.field');
    if (field && field.classList.contains('has-error')) setError(field, false);
  });

  function collect() {
    const data = new FormData(form);
    const payload = {};
    for (const [key, value] of data.entries()) {
      if (key === 'terms') (payload.terms ||= []).push(value);
      else payload[key] = value;
    }
    payload.signature = canvas.toDataURL('image/png');
    payload.captchaToken = captchaToken();
    return payload;
  }

  const captchaField = document.getElementById('captchaField');
  const captchaError = document.getElementById('captchaError');
  let captchaWidgetId = null;
  let captchaSiteKey = null;

  async function loadCaptcha() {
    try {
      const res = await fetch('/api/captcha');
      if (!res.ok) throw new Error('Captcha unavailable');
      captchaSiteKey = (await res.json()).siteKey;
      renderCaptcha();
    } catch {
      captchaError.textContent = 'The captcha could not load. Please refresh the page.';
      setError(captchaField, true);
    }
  }

  function renderCaptcha() {
    if (captchaWidgetId !== null || !captchaSiteKey) return;
    if (!window.turnstile) {
      setTimeout(renderCaptcha, 200);
      return;
    }
    captchaWidgetId = window.turnstile.render('#captchaWidget', {
      sitekey: captchaSiteKey,
      theme: 'light',
      callback: () => setError(captchaField, false),
    });
  }

  function captchaToken() {
    return captchaWidgetId !== null && window.turnstile ? window.turnstile.getResponse(captchaWidgetId) || '' : '';
  }

  function resetCaptcha() {
    if (captchaWidgetId !== null && window.turnstile) window.turnstile.reset(captchaWidgetId);
  }

  loadCaptcha();

  async function submit() {
    if (!captchaToken()) {
      captchaError.textContent = 'Please complete the captcha.';
      setError(captchaField, true);
      captchaField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    nextBtn.disabled = true;
    status.textContent = 'Submitting...';
    status.classList.remove('is-error');
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collect()),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
      current = thanksPage;
      render();
    } catch (error) {
      resetCaptcha();
      status.textContent = error.message.startsWith('Captcha')
        ? error.message
        : 'Something went wrong submitting your application. Please try again.';
      status.classList.add('is-error');
    } finally {
      nextBtn.disabled = false;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validatePage(pages[current])) return;
    if (current === lastFormPage) return submit();
    current += 1;
    render();
  });

  backBtn.addEventListener('click', () => {
    if (current > 0) {
      current -= 1;
      render();
    }
  });

  window.addEventListener('resize', () => {
    if (current === lastFormPage && !hasSignature) sizeCanvas();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }

  render();
})();
