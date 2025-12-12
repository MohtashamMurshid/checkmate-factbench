import React from "react"
import { Box, Text, Newline } from "ink"

export function Header() {
  return (
    <>
      <Box width="100%" justifyContent="center">
        <Text bold underline>Checkmate FactBench</Text>
      </Box>
      <Newline />
    </>
  )
}

