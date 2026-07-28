export default function Home() {
  return (
    <main style={{ fontFamily: "monospace", padding: 24 }}>
      <h1>Forge API</h1>
      <p>This app exposes the Forge backend routes. The frontend lives in a separate app.</p>
      <ul>
        <li>POST /api/agents/register</li>
        <li>POST /api/jobs</li>
        <li>GET /api/jobs</li>
        <li>POST /api/jobs/:id/submit</li>
        <li>POST /api/jobs/:id/validate</li>
        <li>POST /api/payments/nano</li>
        <li>GET /api/reputation</li>
      </ul>
    </main>
  );
}
