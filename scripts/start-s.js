const {exec, spawn, spawnSync} = require('child_process');

// exec('yarn build-c', (error, stdout, stderr) => {
//   if (error) {
//     console.error(`exec error: ${error}`);
//     return;
//   }
//   console.log(`webpack: ${stdout}`);
//   exec('electron .', (error, stdout, stderr) => {
//     if (error) {
//       console.error(`exec error: ${error}`);
//       return;
//     }
//
//     console.log(`electron: ${stdout}`);
//   });
//
// });

// ls.stdout.on('data', (data) => {
//   console.log(`stdout: ${data}`);
// });
//
// ls.stderr.on('data', (data) => {
//   console.log(`stderr: ${data}`);
// });
//
// ls.on('close', (code) => {
//   console.log(`child process exited with code ${code}`);
// });

let ex = exec('electron .', (error, stdout, stderr) => {
  if (error) {
    console.error(`exec error: ${error}`);
    return;
  }

  console.log(`electron: ${stdout}`);
});

ex.stdout.on('data', (data) => {
  console.log(`#STDOUT ${data}`);
});

console.log(ex.eventNames());

// let ex = exec('node scripts/build.js --profile', (error, stdout, stderr) => {
//   if (error) {
//     console.error(`exec error: ${error}`);
//     return;
//   }
//   console.log(`webpack: ${stdout}`);
//
// });

ex.on('close', (code, signal) => {
  console.log(`#CLOSE code--${code}, signal--${signal}`);

  //
});

ex.on('disconnect', () => {
  console.log(`#DISCONNECT`);
});

ex.on('error', (error) => {
  console.log(`#ERROR error--${error}`);
});

ex.on('exit', (code, signal) => {
  console.log(`#EXIT code--${code}, signal--${signal}`);
});

ex.on('message', (message, sendHandler) => {
  console.log(`#MESSAGE message--${message}, sendHandler--${sendHandler}`);
});

// console.log('webpack: ', String(JSON.stringify(sp)));
// sp = spawnSync('electron .');
// console.log('electron: ', String(sp.stdout));
