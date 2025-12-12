import React from 'react'
import { type ConfusionMatrix } from '../types'

type Props = {
  confusion: ConfusionMatrix
}

const FEVER_LABELS = ['SUPPORTS', 'REFUTES', 'NOT ENOUGH INFO']

export default function ConfusionMatrixTable({ confusion }: Props) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.875rem',
        }}
      >
        <thead>
          <tr>
            <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e0e0e0', background: '#f5f5f5' }}>
              Gold \ Predicted
            </th>
            {FEVER_LABELS.map((label) => (
              <th
                key={label}
                style={{
                  padding: '0.75rem',
                  textAlign: 'center',
                  border: '1px solid #e0e0e0',
                  background: '#f5f5f5',
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FEVER_LABELS.map((goldLabel) => (
            <tr key={goldLabel}>
              <td
                style={{
                  padding: '0.75rem',
                  fontWeight: 600,
                  border: '1px solid #e0e0e0',
                  background: '#fafafa',
                }}
              >
                {goldLabel}
              </td>
              {FEVER_LABELS.map((predLabel) => {
                const goldRow = confusion[goldLabel as keyof ConfusionMatrix]
                const count = (typeof goldRow === 'object' && goldRow !== null && predLabel in goldRow)
                  ? (goldRow as Record<string, number>)[predLabel] || 0
                  : 0
                const isCorrect = goldLabel === predLabel
                return (
                  <td
                    key={predLabel}
                    style={{
                      padding: '0.75rem',
                      textAlign: 'center',
                      border: '1px solid #e0e0e0',
                      background: isCorrect && count > 0 ? '#e8f5e9' : count > 0 ? '#fff3e0' : '#fff',
                      fontWeight: count > 0 ? 600 : 400,
                      color: isCorrect && count > 0 ? '#2e7d32' : count > 0 ? '#e65100' : '#666',
                    }}
                  >
                    {count}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {confusion.invalid > 0 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
          Invalid predictions: <strong>{confusion.invalid}</strong>
        </div>
      )}
    </div>
  )
}

