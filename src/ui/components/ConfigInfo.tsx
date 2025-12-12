import React from "react"
import { Box, Text } from "ink"
import { FEVER_LABELS } from "../../lib/labels"

interface ConfigInfoProps {
  args: {
    filePath: string
    limit: number
    concurrency: number
    models: string[]
  }
}

export function ConfigInfo({ args }: ConfigInfoProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      <Text>
        <Text bold color="cyan">Config: </Text>
        <Text>File: {args.filePath} | Limit: {args.limit} | Concurrency: {args.concurrency}</Text>
      </Text>
      <Text>
        <Text bold color="cyan">Models: </Text>
        <Text dimColor>{args.models.join(", ")}</Text>
      </Text>
      <Text>
        <Text bold color="cyan">Labels: </Text>
        <Text dimColor>{FEVER_LABELS.join(", ")}</Text>
      </Text>
    </Box>
  )
}

