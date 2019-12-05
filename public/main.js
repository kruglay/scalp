const {fork} = require('child_process');
const chokidar = require('chokidar');
const {app, BrowserWindow} = require('electron');
const {default: installExtension, REACT_DEVELOPER_TOOLS} = require('electron-devtools-installer');

const browserWindows = [];

const softResetHandler = () => browserWindows.forEach(bw => bw.webContents.reloadIgnoringCache());
const watcher = chokidar.watch(['src/**']);

// Enable default soft reset
watcher.on('change', () => {
  const child = fork('scripts/build.js', ['--profile']);
  child.on('close', (code, signal) => {
    if(code === null) {
      softResetHandler();
    }
  });

  child.on('exit', (code, signal) => {
    if(code === 0) {
      softResetHandler();
    }
  });
});

app.on('browser-window-created', (e, bw) => {
  browserWindows.push(bw);

  // Remove closed windows from list of maintained items
  bw.on('closed', function () {
    const i = browserWindows.indexOf(bw); // Must use current index
    browserWindows.splice(i, 1);
  });
});


// Храните глобальную ссылку на объект окна, если вы этого не сделаете, окно будет
// автоматически закрываться, когда объект JavaScript собирает мусор.
let win;

function createWindow() {
  // Создаём окно браузера.
  win = new BrowserWindow({

    webPreferences: {
      nodeIntegration: true
    }
  });

  win.setFullScreen(true);

  console.log('-------------electron __dirname-----------', __dirname);
  installExtension(REACT_DEVELOPER_TOOLS)
    .then((name) => console.log(`Added Extension:  ${name}`))
    .catch((err) => console.log('An error occurred: ', err));

  // Отображаем средства разработчика.
  win.webContents.openDevTools();
  // and load the index.html of the app.
  win.loadURL(`file://${__dirname}/index.html`);

  // win.loadFile('build/index.html');



  // Будет вызвано, когда окно будет закрыто.
  win.on('closed', () => {
    // Разбирает объект окна, обычно вы можете хранить окна
    // в массиве, если ваше приложение поддерживает несколько окон в это время,
    // тогда вы должны удалить соответствующий элемент.
    win = null;
  });
}

// Этот метод будет вызываться, когда Electron закончит
// инициализацию и готов к созданию окон браузера.
// Некоторые API могут использоваться только после возникновения этого события.
app.on('ready', createWindow);

// Выходим, когда все окна будут закрыты.
app.on('window-all-closed', () => {
  // Для приложений и строки меню в macOS является обычным делом оставаться
  // активными до тех пор, пока пользователь не выйдет окончательно используя Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // На MacOS обычно пересоздают окно в приложении,
  // после того, как на иконку в доке нажали и других открытых окон нету.
  if (win === null) {
    // execSync('node scripts/build.js --profile');
    createWindow();
  }
});

