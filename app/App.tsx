import React, { useEffect, useState } from 'react'
import RunList from './components/RunList'
import RunViewer from './components/RunViewer'
import { type RunInfo } from './types'

function App() {
  const [runs, setRuns] = useState<RunInfo[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadRuns() {
      try {
        const response = await fetch('/api/runs')
        if (!response.ok) {
          throw new Error('Failed to load runs')
        }
        const data = await response.json()
        setRuns(data)
        if (data.length > 0 && !selectedRunId) {
          setSelectedRunId(data[0].id)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    loadRuns()
  }, [])

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading runs...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#d32f2f' }}>
        <p>Error: {error}</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ width: '300px', background: '#fff', borderRight: '1px solid #e0e0e0', overflowY: 'auto' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #e0e0e0' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Checkmate FactBench
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#666' }}>Results Viewer</p>
        </div>
        <RunList
          runs={runs}
          selectedRunId={selectedRunId}
          onSelectRun={setSelectedRunId}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {selectedRunId ? (
          <RunViewer runId={selectedRunId} />
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
            <p>Select a run to view results</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App

