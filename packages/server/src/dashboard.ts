export const dashboardHtml = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>blockrate dashboard</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
  h1 { margin-bottom: 0.25rem; }
  .muted { color: #888; }
  form { display: flex; gap: 0.5rem; margin: 1rem 0; flex-wrap: wrap; }
  input, select, button { padding: 0.4rem 0.6rem; font: inherit; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid #8884; }
  th { background: #8881; }
  .bar { position: relative; height: 8px; background: #8883; border-radius: 4px; overflow: hidden; }
  .bar > div { position: absolute; inset: 0; width: var(--w); background: linear-gradient(90deg, #f59e0b, #ef4444); }
  .err { color: #ef4444; }
</style>
</head>
<body>
<h1>blockrate</h1>
<p class="muted">Per-provider block rate across your services.</p>
<form id="f">
  <input name="key" type="password" placeholder="API key" required>
  <input name="service" placeholder="service (optional)">
  <select name="since">
    <option value="1">last 24h</option>
    <option value="7" selected>last 7 days</option>
    <option value="30">last 30 days</option>
  </select>
  <button type="submit">Load</button>
</form>
<div id="out"></div>
<script>
const f = document.getElementById("f");
const out = document.getElementById("out");
const stored = localStorage.getItem("br_key");
if (stored) f.key.value = stored;
f.addEventListener("submit", async (e) => {
  e.preventDefault();
  const key = f.key.value.trim();
  localStorage.setItem("br_key", key);
  const params = new URLSearchParams({ since: f.since.value });
  if (f.service.value) params.set("service", f.service.value);
  out.innerHTML = "Loading...";
  try {
    const res = await fetch("/stats?" + params, {
      headers: { "x-blockrate-key": key },
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    if (!data.stats.length) {
      out.innerHTML = "<p class='muted'>No data yet.</p>";
      return;
    }
    const rows = data.stats
      .sort((a, b) => b.blockRate - a.blockRate)
      .map((s) => {
        const pct = (s.blockRate * 100).toFixed(1);
        return \`<tr>
          <td>\${s.provider}</td>
          <td>\${s.total.toLocaleString()}</td>
          <td>\${pct}%</td>
          <td><div class="bar"><div style="--w:\${pct}%"></div></div></td>
          <td>\${s.avgLatency}ms</td>
        </tr>\`;
      })
      .join("");
    out.innerHTML = \`
      <p class="muted">Tenant: <b>\${data.tenant}</b> · \${data.service ?? "all services"} · last \${data.sinceDays}d</p>
      <table>
        <thead><tr><th>Provider</th><th>Checks</th><th>Block rate</th><th></th><th>Avg latency</th></tr></thead>
        <tbody>\${rows}</tbody>
      </table>\`;
  } catch (err) {
    out.innerHTML = "<p class='err'>" + err.message + "</p>";
  }
});
</script>
</body>
</html>`;
