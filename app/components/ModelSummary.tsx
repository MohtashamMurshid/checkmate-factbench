import React, { useState } from 'react'
import { type ModelSummary as ModelSummaryType } from '../types'
import ConfusionMatrixTable from './ConfusionMatrixTable'
import ModelItemsTable from './ModelItemsTable'

type Props = {
  summary: ModelSummaryType
}

const FEVER_LABELS = ['SUPPORTS', 'REFUTES', 'NOT ENOUGH INFO']

export default function ModelSummary({ summary }: Props) {
  const [showDetails, setShowDetails] = useState(false)

  const accuracyColor = summary.accuracy >= 0.7 ? '#4caf50' : summary.accuracy >= 0.5 ? '#ff9800' : '#f44336'
  const invalidColor = summary.invalidRate > 0.1 ? '#f44336' : summary.invalidRate > 0.05 ? '#ff9800' : '#4caf50'

  return (
    <div
      style={{
        background: '#fff',
        padding: '1.5rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: '1.5rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', fontFamily: 'monospace' }}>
            {summary.modelId}
          </h3>
          <div style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem' }}>
            <div>
              <strong>Accuracy:</strong>{' '}
              <span style={{ color: accuracyColor, fontWeight: 600 }}>
                {(summary.accuracy * 100).toFixed(1)}%
              </span>
              {' '}({summary.correct}/{summary.total})
            </div>
            <div>
              <strong>Invalid Rate:</strong>{' '}
              <span style={{ color: invalidColor, fontWeight: 600 }}>
                {(summary.invalidRate * 100).toFixed(1)}%
              </span>
              {' '}({summary.invalid}/{summary.total})
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid #e0e0e0',
            borderRadius: '4px',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Confusion Matrix</h4>
        <ConfusionMatrixTable confusion={summary.confusion} />
      </div>

      {showDetails && (
        <div style={{ marginTop: '1.5rem' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Individual Results</h4>
          <ModelItemsTable items={summary.items} />
        </div>
      )}
    </div>
  )
}

