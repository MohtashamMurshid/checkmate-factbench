import React, { useEffect, useState } from 'react'
import { type RunData } from '../types'
import ModelSummary from './ModelSummary'
import RunHeader from './RunHeader'

type Props = {
  runId: string
}

export default function RunViewer({ runId }: Props) {
  const [runData, setRunData] = useState<RunData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadRunData() {
      try {
        setLoading(true)
        const response = await fetch(`/api/runs/${runId}`)
        if (!response.ok) {
          throw new Error('Failed to load run data')
        }
        const data = await response.json()
        setRunData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    loadRunData()
  }, [runId])

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading run data...</p>
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

  if (!runData) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>No data available</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <RunHeader runData={runData} />
      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>
          Model Results
        </h2>
        {runData.summaries.map((summary) => (
          <ModelSummary key={summary.modelId} summary={summary} />
        ))}
      </div>
    </div>
  )
}

