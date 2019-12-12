const path = require('path');
const fs = require('fs');
const mongo = require('mongodb').MongoClient;

const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
const {mean, round} = require('mathjs');
const meow = require('meow');
const utils = require('./utils');

const bigNumber = require('bignumber.js');

// Connection URL
const url = 'mongodb://localhost:27017';

const openRate = 4, closeAsksRate = 0.5, closeBidsRate = 1.5, reopenAsksRate = 0.15, minQuantityRate = 2;

//consts
const READY_TO_REOPEN_BID = 'READY_TO_REOPEN_BID',
  READY_TO_BID = 'READY_TO_BID',
  BID_SET = 'BID_SET',
  READY_TO_ASK = 'READY_TO_ASK',
  ASK_SET = 'ASK_SET',
  INIT = 'INIT',
  START = 'START',
  CLOSE_ASKS = 'CLOSE_ASKS',
  STOP = 'STOP',
  ASK_CANCELLED = 'ASK_CANCELLED'
;

// Database Name
// const dbName = 'scalp';
const dbName = 'scalp-test';

const profitPercent = 0.005;// процент прибыли

const asset = 'TRXBTC', assetQuantity = '5000';

const severalAttempts = async (func, attempts = 5) => {
  let err;
  for (let i = 0; i < attempts; i++) {
    try {
      return await func();
    } catch (e) {
      console.error(e);
      err = e;
    }
  }
  throw err;
};

const reducePrice = (price, tickSize) => bigNumber(price).minus(tickSize);


// const algorithm = (data, bidQty) => {
//   const volumes = [], volumesSell = [];
//   for (let el of data) {
//     volumes.push(Number(el.qty));
//     const value = Number(el.qty);
//     if (el.isBuyerMaker) {
//       volumesSell.push(value);
//     }
//   }
//
//   const meanValue = mean(volumesSell.sort((a, b) => a - b).slice(-10));//среднее значение маскимальных 10 продаж
//   return meanValue >= bidQty;
// };

const algorithm = (price, tickSize) => bigNumber(price).plus(tickSize);

class Scalp {
  constructor(symbol, db, binance) {
    this.quantity = null;
    this.symbol = symbol;
    this.askOrders = [];
    this.bidOrders = [];
    this.webSockets = [];
    this.partialDepth = {};
    this.bidData = {};
    this.count = 0;
    this.meanSellQty = 0;
    this.tradeSubscribtion = null;
    this.db = db;
    this.binance = binance;
    this.fills = []; // need for askorders - bidorders connection
    this.fillsQty = 0;
    this.stop = false;
    this.tasksQueue = [];
    this.state = {
      step: INIT,
      bidPrice: null,
      setStep: async (step, payload, callback) => {
        console.log('---setStep----', step);
        const logDoc = await this.db.collection('text_logs').insertOne({
          symbol: this.symbol,
          text: `---setStep---- ${step}`,
          time: Date.now(),
        });
        //проблема с асинхронными запросами при закрытии асков, поэтому не будем пропускать если тот же шаг
        if (this.state.step === step) {
          return;
        }
        this.state.step = step;
        if (step === READY_TO_BID) {
          const request = async () => await this.binance.order(payload);
          const func = async (res) => {
            res.restQty = res.origQty;
            this.bidOrders.push(res);
            this.state.bidPrice = payload.price;
            this.state.setStep(BID_SET);
            this.db.collection('orders').insertOne(res);
            //snapshot to DB
            this.snapShot(logDoc.insertedId, step, {
              order: res,
              depth: this.partialDepth
            });
          };
          this.tasksQueue.push({
            name: step,
            request,
            func
          });
        } else if (step === READY_TO_ASK) {
          const request = async () => await this.binance.order(payload);

          const func = async (res) => {
            res.bidOrders = this.fills.sort((a, b) => bigNumber(b.price).comparedTo(a.price)).slice(); //берем из филлс, а не из bidOrders, т.к. бид ордер может быть переоткрыт, но часть ордера уже выкуплена
            callback();
            this.fills = [];
            this.fillsQty = 0;
            this.askOrders.push(res);
            this.state.setStep(ASK_SET);
            this.snapShot(this.state.step, {
              order: res,
              depth: this.partialDepth,
            });
            this.db.collection('orders').insertOne(res);
          };

          this.tasksQueue.push({
            name: step,
            request,
            func
          });
        } else if (step === READY_TO_REOPEN_BID) {
          const {symbol, orderId} = payload.prevOrder;
          let request = async () => await this.binance.cancelOrder({
            symbol,
            orderId
          });

          let func = async (res) => {
            payload.prevOrder.status = 'CANCELED';
            await this.snapShot('CANCELED', {
              prevOrder: payload.prevOrder,
              depth: this.partialDepth
            });

            this.bidOrders = this.bidOrders.filter(el => el.orderId !== orderId);
          };

          this.tasksQueue.push({
            name: `${step}--cancel`,
            request,
            func
          });

          request = async () => await this.binance.order(payload.newOrder);
          func = async (res) => {
            res.restQty = res.origQty;

            this.bidOrders.push(res);
            this.state.bidPrice = payload.newOrder.price;
            this.state.setStep(BID_SET);
            //snapshot to DB
            this.snapShot(logDoc.insertedId, step, {
                order: res,
                depth: this.partialDepth,
              },
              `reopen after ${orderId}`
            );
          };

          this.tasksQueue.push({
            name: `${step}--newOrder`,
            request,
            func
          });

        } else if (step === CLOSE_ASKS) {
          const {asksToClose: {byMarket, byLimit}} = payload;
          let totalQtyToCloseByMarket = bigNumber(0);
          let totalQtyToCloseByLimit = bigNumber(0);
          const ids = [];
          const bids = [];
          const asksToClose = byMarket.concat(byLimit);
          let i = 0;

          let resMarket, resLimit, orderTable = [];

          for (let el of asksToClose) {

            const {orderId, price, origQty, executedQty, bidOrders} = el.order;
            const request = async () => {
              return await this.binance.cancelOrder({symbol: this.symbol, orderId});
            };

            this.tasksQueue.push({
              name: `${step}--CANCEL`,
              request,
            });

            if (el.type === 'LIMIT') {
              totalQtyToCloseByLimit = totalQtyToCloseByLimit.plus(bigNumber(origQty).minus(executedQty));
              bids.push(...bidOrders);
            } else if (el.type === 'MARKET') {
              totalQtyToCloseByMarket = totalQtyToCloseByMarket.plus(bigNumber(origQty).minus(executedQty));
            }

            this.askOrders = this.askOrders.filter(el => el.orderId !== orderId);
            ids.push(orderId);
            i++;

            if (i === asksToClose.length) {
              if (totalQtyToCloseByMarket.gt(0)) {
                const request = async () => await this.binance.order({
                  symbol: this.symbol,
                  type: 'MARKET',
                  side: 'SELL',
                  quantity: totalQtyToCloseByMarket.toFixed(),
                });

                const func = async (res) => {
                  //если больше ордеров для закрытия больше нет, меняем шаг
                  if (totalQtyToCloseByLimit.eq(0)) {
                    if (this.askOrders.length === 0 && this.bidOrders.length === 0) {
                      this.state.setStep(START);
                    }
                  }

                  this.snapShot(logDoc.insertedId, step, {
                      order: res,
                      depth: this.partialDepth,
                    },
                    `close ask orders by market`
                  );
                };

                this.tasksQueue.push({
                  name: `${step}--market`,
                  request,
                  func
                });
              }

              if (totalQtyToCloseByLimit.gt(0)) {
                const request = async () => await this.binance.order({
                  symbol: this.symbol,
                  type: 'LIMIT',
                  side: 'SELL',
                  quantity: totalQtyToCloseByLimit.toFixed(),
                  price: payload.price || this.partialDepth.asks[0].price,
                });

                const func = async (res) => {
                  res.bidOrders = bids;
                  this.askOrders.push(res);


                  this.state.setStep(ASK_CANCELLED);

                  this.snapShot(logDoc.insertedId, step, {
                      order: res,
                      depth: this.partialDepth,
                    },
                    `close ask orders by limit`
                  );
                };

                this.tasksQueue.push({
                  name: `${step}--limit`,
                  request,
                  func
                });


              }
            }
          }

        }
      },
    };


  }

  get tickSize() {
    return bigNumber(this.symbolInfo.filters.find(el => el.filterType === 'PRICE_FILTER').tickSize);
  }

  get minQty() {
    return bigNumber(this.symbolInfo.filters.find(el => el.filterType === 'LOT_SIZE').minQty);
  }

  async executeTask() {

    if (this.tasksQueue.length > 0) {
      console.log('----this.tasksQueue----', [...this.tasksQueue]);
      // const {request, func} = this.tasksQueue[0];
      let res;

      try {
        res = await this.tasksQueue[0].request();
        if(this.tasksQueue[0].func) {
          await this.tasksQueue[0].func(res);
        }
        this.tasksQueue.shift();
      } catch (e) {
        this.logError(e);
      }

    }
  }

  async setMeanSell() {
    const trades = await this.binance.trades({symbol: this.symbol});
    const volumes = [], volumesSell = [], volumesBuy = [];
    let meanBuyQty = 0;
    for (let el of trades) {
      volumes.push(Number(el.qty));
      const value = Number(el.qty);
      if (el.isBuyerMaker) {
        volumesSell.push(value);
      } else {
        volumesBuy.push(value);
      }
    }

    this.meanSellQty = mean(volumesSell.sort((a, b) => a - b).slice(-10));//среднее значение маскимальных 10 продаж
    meanBuyQty = mean(volumesBuy.sort((a, b) => a - b).slice(-10));//среднее значение маскимальных 10 покупок
    if (this.count === 0) {
      this.db.collection('trades').insertOne({
        symbol: this.symbol,
        volumesSell,
        volumesBuy,
        totalSell: volumesSell.reduce((prev, curr) => (prev + curr), 0),
        totalBuy: volumesBuy.reduce((prev, curr) => (prev + curr), 0),
        meanSellQty: this.meanSellQty,
        meanBuyQty
      });
    } else if (this.count === 599) {
      this.count = 0;
    } else {
      this.count++;
    }

  }

  async start(quantity) {
    if (!quantity) {
      throw 'Enter any quantity';
    }

    this.quantity = quantity;


    const tick = async () => {
      await this.executeTask();
      //будем запускать ф-ию каждые 500 мс
      if (!this.stop) {
        await utils.asyncSetTimeOut(tick, 500);
      }
    };



    const request = async () => await this.binance.exchangeInfo();
    const func = async (res) => {
      this.symbolInfo = res.symbols.find(el => el.symbol === this.symbol);
      if (!this.symbolInfo) {
        throw `Wrong symbol "${this.symbol}"`;
      }

      this.bidData = {
        price: bigNumber(0),
        quantity: 0,
        setPrice(price) {
          const oldPrice = this.price;
          this.price = bigNumber(price);
        },

        setQuantity(quantity) {
          const oldQuantity = this.quantity;
          this.quantity = bigNumber(quantity);
        }
      };

      this.setMeanSell();
      this.tradeSubscribtion = setInterval(this.setMeanSell.bind(this), 10000);

      /////////////////websockets
      this.webSockets.push(
        await this.binance.ws.partialDepth({symbol: this.symbol, level: 5}, data => {
          const bid = data.bids[0],
            ask = data.asks[0];

          if (!this.bidData.price.eq(bid.price) || !this.bidData.quantity.eq(bid.quantity)) {
            this.bidData.setPrice(bid.price);
            this.bidData.setQuantity(bid.quantity);
          }

          this.partialDepth = data;
          if (this.state.step === START) {
            if (this.checkMinQty()) {
              this.openBidOrder();
            }
          }

          if (this.bidOrders.length > 0) {
            const order = this.bidOrders[0];
            //check for reopen bid order
            if (bigNumber(order.price).lt(bid.price)) {
              if (this.checkMinQty()) {
                this.openBidOrder(order);
              }
            }


            if (bigNumber(order.price).eq(bid.price) && (this.meanSellQty * closeBidsRate + Number(order.origQty) > Number(bid.quantity.toString()))) {
              this.openBidOrder(order, reducePrice(order.price, this.tickSize));
            }
          }

          //check for close ask orders and sell by market
          if (this.askOrders.length > 0 && this.state.step !== CLOSE_ASKS) {
            const asksToClose = this.getAsksToClose();
            if (asksToClose) {
              this.state.setStep(CLOSE_ASKS, {asksToClose});
            }
          }

        })
      );

      this.webSockets.push(
        await this.binance.ws.user(data => {
          if (!(data.eventType === 'executionReport' && data.symbol === this.symbol)) {
            return;
          }

          const {orderStatus, lastTradeQuantity, totalTradeQuantity, side, orderType, orderId, price} = data;
          if (['FILLED', 'PARTIALLY_FILLED'].includes(orderStatus)) {
            if (orderType === 'LIMIT' && side === 'BUY') {
              this.fills.push(data);
              this.fillsQty = bigNumber(lastTradeQuantity).plus(this.fillsQty);

              if (orderStatus === 'PARTIALLY_FILLED') {
                const order = this.bidOrders.find(el => el.orderId === orderId);
                order.restQty = bigNumber(order.restQty).minus(totalTradeQuantity);
              }

              // if (orderStatus === 'FILLED') {
              //   this.bidOrders = this.bidOrders.filter(el => el.orderId !== orderId);
              // }

              if (this.fillsQty.gte(this.minQty)) {
                this.openAskOrder(price, orderStatus);
              }
            }
            if (orderType === 'LIMIT' && side === 'SELL') {
              let comment = 'ask order partially filled';
              const order = this.askOrders.find(el => el.orderId === orderId);
              if (order) {
                order.executedQty = totalTradeQuantity;
              }
              if (orderStatus === 'FILLED') {
                this.askOrders = this.askOrders.filter(el => el.orderId !== orderId);
                if (this.askOrders.length === 0 && this.bidOrders.length === 0) {
                  comment = 'ask order closed';
                  this.state.setStep(START);
                }
              }


              this.snapShot('ASK_ORDER_BUY', {
                  order,
                  depth: this.partialDepth,
                },
                comment
              );
            }

          }


          const $set = {orderStatus};
          this.db.collection('orders').findOneAndUpdate({orderId}, {$set});

        })
      );

      ////////////////////////websockets
      this.state.setStep(START);
    };

    this.tasksQueue.push({
      name: `start`,
      request,
      func
    });

    tick();
  };

  async stopScalping() {
    clearTimeout(this.timerId);
    this.state.setStep(STOP);
    clearInterval(this.tradeSubscribtion);
    this.webSockets.forEach(socket => socket());//закрываем все сокеты
  };

  checkMinQty() {
    let maxQty = this.meanSellQty * openRate;
    console.log('maxQty', maxQty);
    const res = Number(this.partialDepth.bids[0].quantity) >= maxQty;

    return res;
  };

  getAsksToClose() {
    let close;
    let maxQty = this.meanSellQty * closeAsksRate;
    const byLimit = [], byMarket = [];
    for (let el of this.askOrders) {
      if (bigNumber(el.bidOrders[0].price).minus(this.partialDepth.bids[0].price).eq(this.tickSize)) {
        // в случае если количество упали ниже задонного алгоритмом будем закрывать по маркету
        if (Number(this.partialDepth.bids[0].quantity) <= Math.max(maxQty, minQuantityRate * (Number(el.origQty) - Number(el.executedQty)))) {
          byMarket.push({type: 'MARKET', order: el});
        } else if (!bigNumber(this.partialDepth.asks[0].price).eq(el.price) && Number(this.partialDepth.asks[0].quantity) >= Number(this.partialDepth.bids[0].quantity * reopenAsksRate)) {
          byLimit.push({type: 'LIMIT', order: el});
        }
      } else if (bigNumber(el.bidOrders[0].price).minus(this.partialDepth.bids[0].price).gte(this.tickSize * 2)) {
        byMarket.push({type: 'MARKET', order: el});
      }
    }

    if (byLimit.length || byMarket.length) {
      return {byLimit, byMarket};
    }

    return null;
  };

  openAskOrder(price, bidOrderStatus) {

    const askPrice = algorithm(price, this.tickSize).toFixed();
    this.state.setStep(READY_TO_ASK, {
        symbol: this.symbol,
        side: 'SELL',
        type: 'LIMIT',
        quantity: this.fillsQty,
        price: askPrice
      },
      () => {
        if (bidOrderStatus === 'FILLED') {
          this.bidOrders = this.bidOrders.filter(el => el.orderId !== this.fills.pop().orderId); //удалим из бид ордеров последний проторгованный бид ордер
        }
      });

  };

  openBidOrder(prevOrder, price = this.bidData.price.toFixed()) {

    if (!prevOrder) {
      this.state.setStep(READY_TO_BID, {
        symbol: this.symbol,
        side: 'BUY',
        type: 'LIMIT',
        quantity: this.quantity,
        price: this.bidData.price.toFixed()
      });
    } else {
      this.state.setStep(READY_TO_REOPEN_BID, {
        newOrder: {
          symbol: this.symbol,
          side: 'BUY',
          type: 'LIMIT',
          quantity: this.quantity,
          price
        },
        prevOrder
      });
    }

  };

  snapShot(insertedId, action, tables, comment) {
    const {quantity, symbol, askOrders, bidOrders, webSockets, partialDepth, bidData, meanSellQty, tradeSubscribtion, fills, fillsQty, stop} = this;

    this.db.collection('log').insertOne({
      action,
      tables,
      instance: {quantity, symbol, askOrders, bidOrders, partialDepth, bidData, meanSellQty, fills, fillsQty, stop},
      comment
    }).then(
      res => this.db.collection('text_logs').findOneAndUpdate({_id: insertedId}, {
        $set: {logId: res.insertedId}
      }));
  };

  logError(err) {
    this.db.collection('error').insertOne({
      symbol: this.symbol,
      error: {
        stack: err.stack,
        message: err.message,
      }
    });
  }
};


MongoClient.connect(url, {useNewUrlParser: true}, function (err, client) {

  assert.equal(null, err);
  console.log('Connected successfully to server');

  const db = client.db(dbName);
  const args = meow();
  if (!(args.flags.s && args.flags.q)) {
    console.error('Enter arguments -s, -q');
    process.exit(1);
  }
  const binance = require('./binance-api-node-test').default(db);
  // console.log('binance', binance);

  const scalp = new Scalp(args.flags.s, db, binance);
  scalp.start(Number(args.flags.q));

});