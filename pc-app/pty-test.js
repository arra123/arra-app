try { const pty=require('node-pty'); const p=pty.spawn('powershell.exe',[],{cols:80,rows:24}); console.log('PTY_OK pid='+p.pid); p.kill(); }
catch(e){ console.log('PTY_FAIL '+e.message); }
