import React from 'react'
import { type RunInfo } from '../types'

type Props = {
  runs: RunInfo[]
  selectedRunId: string | null
  onSelectRun: (runId: string) => void
}

export default function RunList({ runs, selectedRunId, onSelectRun }: Props) {
  return (
    <div>
      {runs.length === 0 ? (
        <div style={{ padding: '1.5rem', color: '#666', textAlign: 'center' }}>
          <p>No runs found</p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none' }}>
          {runs.map((run) => (
            <li key={run.id}>
              <button
                onClick={() => onSelectRun(run.id)}
                style={{
                  width: '100%',
                  padding: '1rem 1.5rem',
                  textAlign: 'left',
                  border: 'none',
                  background: selectedRunId === run.id ? '#e3f2fd' : 'transparent',
                  cursor: 'pointer',
                  borderLeft: selectedRunId === run.id ? '3px solid #2196f3' : '3px solid transparent',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (selectedRunId !== run.id) {
                    e.currentTarget.style.background = '#f5f5f5'
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedRunId !== run.id) {
                    e.currentTarget.style.background = 'transparent'
                  }
                }}
              >
                <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  {new Date(run.timestamp).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#666' }}>
                  {run.id}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

