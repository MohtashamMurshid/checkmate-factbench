import React, { useMemo } from "react"
import { render, Box, Text, Newline } from "ink"
import Spinner from "ink-spinner"
import { parseArgs } from "./lib/args"
import { useEvaluationRun } from "./hooks/useEvaluationRun"
import { Header } from "./ui/components/Header"
import { ConfigInfo } from "./ui/components/ConfigInfo"
import { StatusInfo } from "./ui/components/StatusInfo"
import { ModelList } from "./ui/components/ModelList"

function App() {
  const args = useMemo(() => parseArgs(process.argv), [])
  const state = useEvaluationRun(args)

  if (state.error) {
    return (
      <Box flexDirection="column" padding={1} borderColor="red" borderStyle="round">
        <Text color="red" bold>ERROR:</Text>
        <Text color="red">{state.error}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Header />
      <ConfigInfo args={args} />
      <Newline />
      
      <StatusInfo state={state} />

      {state.started && (
        <Box flexDirection="column">
           <ModelList models={args.models} state={state} />
           <Box marginTop={1}>
             {state.done ? <Text color="green" bold>✔ Done.</Text> : <Text color="yellow"><Spinner type="dots" /> Running...</Text>}
           </Box>
        </Box>
      )}
    </Box>
  )
}

render(<App />)
