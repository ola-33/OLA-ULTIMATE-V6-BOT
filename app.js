const $ = (id) => document.getElementById(id);
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function showNotice(message, isError = false) {
  $('notice').textContent = message;
  $('notice').style.color = isError ? '#ff9d9d' : '';
}
async function refresh() {
  try {
    const s = await api('/api/status');
    $('connection').textContent = s.connected ? 'Connected' : s.connecting ? 'Connecting' : 'Offline';
    $('led').classList.toggle('on', s.connected);
    $('statConnection').textContent = s.connected ? 'Online' : s.connecting ? 'Connecting' : 'Offline';
    $('lastEvent').textContent = s.lastEvent || 'No events yet';
    $('handled').textContent = String(s.messagesHandled ?? 0);
    const p = await api('/api/pairing-code');
    if (p.code) {
      $('pairCode').textContent = p.code;
      $('codeBox').classList.remove('hidden');
      showNotice('Pairing code ready. Enter it in WhatsApp Linked Devices.');
    }
  } catch (e) {
    showNotice(e.message, true);
  }
}
$('pairForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const phone = $('phone').value.trim();
  $('pairBtn').disabled = true;
  $('pairBtn').textContent = 'Requesting…';
  $('codeBox').classList.add('hidden');
  try {
    const result = await api('/api/pair', { method: 'POST', body: JSON.stringify({ phone }) });
    showNotice(result.message);
    setTimeout(refresh, 1500);
    setTimeout(refresh, 3500);
    setTimeout(refresh, 6000);
  } catch (e) {
    showNotice(e.message, true);
  } finally {
    $('pairBtn').disabled = false;
    $('pairBtn').textContent = 'Get code ↗';
  }
});
refresh();
setInterval(refresh, 5000);