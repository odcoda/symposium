import { spawn } from 'node:child_process'

const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
  stdio: 'inherit',
  shell: false,
})

process.on('SIGINT', () => {
  server.kill('SIGINT')
})

process.on('exit', () => {
  server.kill()
})
