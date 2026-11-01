// scripts/startClean.js
// This script safely starts the SIS server on Windows.
// It checks whether port 3000 is already occupied.
// If the occupying process is a Node.js instance (i.e., our server), it terminates it.
// It deliberately avoids killing unrelated applications.

const { execSync, spawn } = require('child_process');
const path = require('path');

const PORT = 3000;

// Return the PID listening on the given port, or null if none.
function getPidOnPort(port) {
  // Try the more detailed netstat output first.
  try {
    const cmd = `netstat -a -n -o | findstr LISTENING | findstr :${port}`;
    const output = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const lines = output.split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid) return pid;
    }
  } catch (e) {
    // ignore – no listener found with this command
  }
  // Fallback to simpler netstat -ano output.
  try {
    const output = execSync(`netstat -ano -p tcp | findstr :${port}`).toString();
    const lines = output.split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid) return pid;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function isNodeProcess(pid) {
  try {
    const tasklist = execSync(`tasklist /FI "PID eq ${pid}" /FO LIST`).toString();
    return /Image Name:\s*node\.exe/i.test(tasklist);
  } catch (e) {
    return false;
  }
}

function killPid(pid) {
  try {
    execSync(`taskkill /PID ${pid} /F`);
    console.log(`Killed process PID ${pid} (node) to free port ${PORT}.`);
  } catch (e) {
    console.warn(`Failed to kill PID ${pid}:`, e.message);
  }
}

function startServer() {
  const serverPath = path.join(__dirname, '..', 'server', 'app.js');
  const child = spawn('node', [serverPath], { stdio: 'inherit' });
  child.on('close', code => {
    console.log(`Server process exited with code ${code}`);
  });
}

(async () => {
  const pid = getPidOnPort(PORT);
  if (pid) {
    if (isNodeProcess(pid)) {
      console.log(`Port ${PORT} is occupied by a node process (PID ${pid}).`);
      killPid(pid);
      // Wait a short moment for the OS to release the port.
      await new Promise(res => setTimeout(res, 800));
      const stillPid = getPidOnPort(PORT);
      if (stillPid) {
        console.warn(`Port ${PORT} still in use after kill (PID ${stillPid}).`);
      } else {
        console.log(`Port ${PORT} is now free.`);
      }
    } else {
      console.log(`Port ${PORT} is occupied by a non-node process (PID ${pid}). Not terminating it.`);
    }
  } else {
    console.log(`Port ${PORT} is free.`);
  }
  startServer();
})();
