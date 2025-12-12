import React, { useState } from 'react'
import { type ModelEvalItem } from '../types'

type Props = {
  items: ModelEvalItem[]
}

export default function ModelItemsTable({ items }: Props) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

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
              ID
            </th>
            <th style={{ padding: '0.75rem', textAlign: 'left', border: '1px solid #e0e0e0', background: '#f5f5f5' }}>
              Claim
            </th>
            <th style={{ padding: '0.75rem', textAlign: 'center', border: '1px solid #e0e0e0', background: '#f5f5f5' }}>
              Gold
            </th>
            <th style={{ padding: '0.75rem', textAlign: 'center', border: '1px solid #e0e0e0', background: '#f5f5f5' }}>
              Predicted
            </th>
            <th style={{ padding: '0.75rem', textAlign: 'center', border: '1px solid #e0e0e0', background: '#f5f5f5' }}>
              Status
            </th>
            <th style={{ padding: '0.75rem', textAlign: 'center', border: '1px solid #e0e0e0', background: '#f5f5f5' }}>
              Latency
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const isCorrect = item.goldLabel === item.predictedLabel && item.ok
            const isExpanded = expandedRow === index

            return (
              <React.Fragment key={index}>
                <tr
                  style={{
                    cursor: 'pointer',
                    background: isExpanded ? '#f5f5f5' : index % 2 === 0 ? '#fff' : '#fafafa',
                  }}
                  onClick={() => setExpandedRow(isExpanded ? null : index)}
                >
                  <td style={{ padding: '0.75rem', border: '1px solid #e0e0e0' }}>{item.datasetId}</td>
                  <td
                    style={{
                      padding: '0.75rem',
                      border: '1px solid #e0e0e0',
                      maxWidth: '400px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={item.claim}
                  >
                    {item.claim}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center', border: '1px solid #e0e0e0' }}>
                    {item.goldLabel}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center', border: '1px solid #e0e0e0' }}>
                    <span
                      style={{
                        color: item.predictedLabel === 'INVALID' ? '#f44336' : isCorrect ? '#4caf50' : '#ff9800',
                        fontWeight: 600,
                      }}
                    >
                      {item.predictedLabel}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center', border: '1px solid #e0e0e0' }}>
                    {item.ok ? (
                      <span style={{ color: '#4caf50', fontWeight: 600 }}>✓</span>
                    ) : (
                      <span style={{ color: '#f44336', fontWeight: 600 }}>✗</span>
                    )}
                    {item.cached && (
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#666' }}>(cached)</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center', border: '1px solid #e0e0e0' }}>
                    {item.latencyMs}ms
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={6} style={{ padding: '1rem', border: '1px solid #e0e0e0', background: '#fafafa' }}>
                      <div style={{ marginBottom: '0.5rem' }}>
                        <strong>Claim:</strong> {item.claim}
                      </div>
                      {item.rawText && (
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong>Raw Response:</strong>
                          <div
                            style={{
                              marginTop: '0.25rem',
                              padding: '0.5rem',
                              background: '#fff',
                              borderRadius: '4px',
                              fontFamily: 'monospace',
                              fontSize: '0.75rem',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {item.rawText}
                          </div>
                        </div>
                      )}
                      {item.error && (
                        <div style={{ marginBottom: '0.5rem', color: '#f44336' }}>
                          <strong>Error:</strong> {item.error}
                        </div>
                      )}
                      {item.usage && (
                        <div style={{ fontSize: '0.75rem', color: '#666' }}>
                          <strong>Tokens:</strong> Prompt: {item.usage.promptTokens || 'N/A'}, Completion:{' '}
                          {item.usage.completionTokens || 'N/A'}, Total: {item.usage.totalTokens || 'N/A'}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

