import { run } from './run.js'

// Thin wrapper: parse real argv (minus `node` + script), run, propagate the exit code.
// All I/O defaults inside run() to process.env / process.stdout / process.stderr.
run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    process.stderr.write(`error UNEXPECTED: ${String(error?.message ?? error)}\n`)
    process.exitCode = 1
  })
