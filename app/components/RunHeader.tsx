import React from 'react'
import { type RunData } from '../types'

type Props = {
  runData: RunData
}

export default function RunHeader({ runData }: Props) {
  return (
    <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '1rem' }}>
        Run: {runData.runId}
      </h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.875rem' }}>
        <div>
          <strong>Timestamp:</strong>
          <div style={{ color: '#666', marginTop: '0.25rem' }}>
            {new Date(runData.timestamp).toLocaleString()}
          </div>
        </div>
        <div>
          <strong>Dataset:</strong>
          <div style={{ color: '#666', marginTop: '0.25rem' }}>{runData.filePath}</div>
        </div>
        <div>
          <strong>Examples:</strong>
          <div style={{ color: '#666', marginTop: '0.25rem' }}>{runData.limit}</div>
        </div>
        <div>
          <strong>Concurrency:</strong>
          <div style={{ color: '#666', marginTop: '0.25rem' }}>{runData.concurrency}</div>
        </div>
        <div>
          <strong>Models:</strong>
          <div style={{ color: '#666', marginTop: '0.25rem' }}>{runData.models.length}</div>
        </div>
      </div>
      <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
        <strong>Models:</strong>
        <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {runData.models.map((model) => (
            <span
              key={model}
              style={{
                background: '#e3f2fd',
                color: '#1976d2',
                padding: '0.25rem 0.75rem',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
              }}
            >
              {model}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

