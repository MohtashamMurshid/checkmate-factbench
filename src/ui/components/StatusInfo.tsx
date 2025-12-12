import React from "react"
import { Box, Text, Newline } from "ink"
import Spinner from "ink-spinner"
import type { AppState } from "../../hooks/useEvaluationRun"

interface StatusInfoProps {
  state: AppState
}

export function StatusInfo({ state }: StatusInfoProps) {
  if (!state.started) {
    return (
      <Box>
        <Text color="yellow">
          <Spinner type="dots" /> Starting...
        </Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text>
          <Text bold color="green">Status: </Text>
          <Text>Current: {state.currentModel ?? "-"} </Text>
          <Text dimColor>
            ({state.currentModelDone}/{state.examplesTotal})
          </Text>
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          <Text bold color="blue">Outputs: </Text>
          <Text>{state.outMdPath ?? "-"}</Text>
          <Newline />
          <Text dimColor>Raw: {state.outDir ?? "-"}/raw/</Text>
        </Text>
      </Box>
    </Box>
  )
}

