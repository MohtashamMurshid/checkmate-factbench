import React from "react"
import { Box, Text } from "ink"
import Spinner from "ink-spinner"
import type { AppState } from "../../hooks/useEvaluationRun"

interface ModelListProps {
  models: string[]
  state: AppState
}

export function ModelList({ models, state }: ModelListProps) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
      <Box>
        <Box width="40%">
          <Text bold underline>Model</Text>
        </Box>
        <Box width="20%">
          <Text bold underline>Accuracy</Text>
        </Box>
        <Box width="20%">
          <Text bold underline>Counts</Text>
        </Box>
        <Box width="20%">
          <Text bold underline>Invalid</Text>
        </Box>
      </Box>
      {models.map((m: string) => {
        const s = state.summaries[m]
        const truncatedName = m.length > 30 ? m.slice(0, 27) + "..." : m

        if (!s) {
          const isCurrent = state.currentModel === m
          return (
            <Box key={m}>
              <Box width="40%">
                <Text color={isCurrent ? "yellow" : "gray"}>{truncatedName}</Text>
              </Box>
              <Box width="60%">
                <Text dimColor>
                  {isCurrent ? (
                    <>
                      <Spinner type="dots" /> Processing
                    </>
                  ) : (
                    "Pending..."
                  )}
                </Text>
              </Box>
            </Box>
          )
        }
        const accPct = (s.accuracy * 100).toFixed(1)
        const invPct = (s.invalidRate * 100).toFixed(1)

        return (
          <Box key={m}>
            <Box width="40%">
              <Text color="green">{truncatedName}</Text>
            </Box>
            <Box width="20%">
              <Text>{accPct}%</Text>
            </Box>
            <Box width="20%">
              <Text>
                {s.correct}/{s.total}
              </Text>
            </Box>
            <Box width="20%">
              <Text>{invPct}%</Text>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

