/**
 * MINIMAL TEST APP
 * This is a stripped-down version to test if the build works
 */

export default function App() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0e1a 0%, #1e293b 100%)',
      color: 'white',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div>
        <h1 style={{ fontSize: '3rem', marginBottom: '20px', color: '#3b82f6' }}>
          🚀 IndexpilotAI
        </h1>
        <p style={{ fontSize: '1.2rem', color: '#94a3b8', marginBottom: '30px' }}>
          Minimal build test - If you see this, the build is working!
        </p>
        <button 
          onClick={() => alert('Build successful!')}
          style={{
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            padding: '12px 30px',
            borderRadius: '8px',
            fontSize: '1rem',
            cursor: 'pointer'
          }}
        >
          Test Button
        </button>
        <p style={{ marginTop: '30px', color: '#64748b', fontSize: '0.9rem' }}>
          Build time: {new Date().toLocaleString()}
        </p>
      </div>
    </div>
  );
}
