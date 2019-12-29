const {MongoClient} = require('mongodb');


const dbUrl = 'mongodb://localhost:27017';
const dbName = process.env.TEST === 'true' ? 'scalp-test' : 'scalp';
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

const mongoClient = () => new Promise((resolve, reject) => MongoClient.connect(dbUrl, { useNewUrlParser: true }, (err, client) => {
    if(err) {
      reject(err);
    }
    resolve(client);
  })
);

// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
window.addEventListener('DOMContentLoaded', async () => {

  const modal = document.createElement('div');
  modal.id = 'modal';
  modal.innerHTML = '<img src="images/svg/spin.svg" width="50" height="50"></img><span>Loading...</span>';
  document.body.appendChild(modal);
  try {
    const client = await mongoClient();
    window.db = client.db(dbName);
    let binance;
    if(process.env.TEST === 'true') {
      binance = require('./binance-api-node-test').default(db);
    } else {
      binance = require('binance-api-node').default({
        apiKey: 'Q5LtPfSr9JKs09slnUk6XwGBSnMMotcd1KAhlAjil2VEbggIgqm1iw478Zx5x04a',
        apiSecret: 'NORxIW5SEv7YJOohqTxSI0v1NMNyuT4lcz4T0pvkCRuYhLYxPQsCn7Fey3SZsyQR',
        logToDb: window.db
      });
    }
    window.binance = binance;
  } catch (e) {
    console.error(e);
    throw e;
  }
  modal.remove();
});

