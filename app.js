const form = document.getElementById('bookingForm');
const statusEl = document.getElementById('formStatus');
const yearEl = document.getElementById('year');

yearEl.textContent = new Date().getFullYear();

// Set min date to today
const dateInput = form.querySelector('input[name="preferredDate"]');
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth()+1).padStart(2,'0');
const dd = String(today.getDate()).padStart(2,'0');
dateInput.min = `${yyyy}-${mm}-${dd}`;

function setStatus(msg, ok=true){
  statusEl.textContent = msg;
  statusEl.style.color = ok ? '#c8facc' : '#ffb3b3';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('Sending…');
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  // Basic client validation
  const required = ['name','email','phone','address','serviceType','preferredDate','preferredTime'];
  for (const key of required) {
    if (!payload[key] || String(payload[key]).trim() === ''){
      setStatus('Please fill all required fields.', false);
      btn.disabled = false;
      return;
    }
  }

  try {
    const res = await fetch('/api/bookings', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok){
      setStatus('Thanks! We received your request.');
      form.reset();
      dateInput.min = `${yyyy}-${mm}-${dd}`; // preserve min after reset
    } else {
      setStatus(data.error || 'Something went wrong.', false);
    }
  } catch (err){
    console.error(err);
    setStatus('Network error. Please try again.', false);
  } finally {
    btn.disabled = false;
  }
});
