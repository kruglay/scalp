// const {mean, round} = require('mathjs');
import {mean, round} from 'mathjs';
import {observable} from 'mobx';
// const utils = require('./async');

import {asyncSetTimeOut} from './async';

// const bigNumber = require('bignumber.js');
import bigNumber from 'bignumber.js/bignumber.mjs';


// const openRate = 4, closeAsksRate = 0.5, closeBidsRate = 1.5, reopenAsksRate = 0.15, minQuantityRate = 2;

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
  @observable meanSellQty = 0;
  @observable state = {
    step: INIT,
    bidPrice: null,
    setStep: async (step, payload, callback) => {
      console.log('---setStep----', step);
      const logDoc = await this.db.collection('text_logs').insertOne({
        symbol: this.symbol,
        text: `---setStep---- ${step}`,
        time: Date.now(),
      });

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
          func,
          step
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
          this.snapShot(logDoc.insertedId, this.state.step, {
            order: res,
            depth: this.partialDepth,
          });
          this.db.collection('orders').insertOne(res);
        };

        this.tasksQueue.push({
          name: step,
          request,
          func,
          step
        });
      } else if (step === READY_TO_REOPEN_BID) {
        const {symbol, orderId} = payload.prevOrder;
        let request = async () => await this.binance.cancelOrder({
          symbol,
          orderId
        });


        let func = async (res) => {

          payload.prevOrder.status = 'CANCELED';
          try {
            await this.snapShot(logDoc.insertedId, 'CANCELED', {
              prevOrder: payload.prevOrder,
              depth: this.partialDepth
            });
          } catch (e) {
            console.error(e);
          }

          this.bidOrders = this.bidOrders.filter(el => el.orderId !== orderId);
        };

        this.tasksQueue.push({
          name: `${step}--cancel`,
          request,
          func,
          step
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
          func,
          step
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
            step
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
                func,
                step
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
                func,
                step
              });


            }
          }
        }

      }
    },
  };
  @observable stop = false;

  constructor({
                symbol,
                quantity,
                openRate,
                closeAsksRate,
                reopenAsksRate,
                closeBidsRate,
                minQuantityRate
              }, db, binance) {
    this.quantity = quantity;
    this.symbol = symbol;
    this.openRate = openRate;
    this.closeAsksRate = closeAsksRate;//для закрытия по маркету
    this.reopenAsksRate = reopenAsksRate;//
    this.closeBidsRate = closeBidsRate;
    this.minQuantityRate = minQuantityRate;
    this.askOrders = [];
    this.bidOrders = [];
    this.webSockets = [];
    this.partialDepth = {};
    this.bidData = {};
    this.count = 0;
    this.db = db;
    this.binance = binance;
    this.fills = []; // need for askorders - bidorders connection
    this.fillsQty = 0;
    this.tasksQueue = [];
    this.trades = [];
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
            func,
            step
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
            this.snapShot(logDoc.insertedId, this.state.step, {
              order: res,
              depth: this.partialDepth,
            });
            this.db.collection('orders').insertOne(res);
          };

          this.tasksQueue.push({
            name: step,
            request,
            func,
            step
          });
        } else if (step === READY_TO_REOPEN_BID) {
          const {symbol, orderId} = payload.prevOrder;
          let request = async () => await this.binance.cancelOrder({
            symbol,
            orderId
          });


          let func = async (res) => {

            payload.prevOrder.status = 'CANCELED';
            try {
              await this.snapShot(logDoc.insertedId, 'CANCELED', {
                prevOrder: payload.prevOrder,
                depth: this.partialDepth
              });
            } catch (e) {
              console.error(e);
            }

            this.bidOrders = this.bidOrders.filter(el => el.orderId !== orderId);
          };

          this.tasksQueue.push({
            name: `${step}--cancel`,
            request,
            func,
            step
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
            func,
            step
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
              step
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
                  func,
                  step
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
                  func,
                  step
                });


              }
            }
          }
        } else if (step === STOP) {
          this.tasksQueue = [];
          this.webSockets.forEach(socket => socket());//закрываем все сокеты
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
      const currentTask = this.tasksQueue[0];
      try {
        res = await currentTask.request();
        if (currentTask.func) {
          await currentTask.func(res);
        }
        this.tasksQueue.shift();
      } catch (e) {
        //если ордера не существует(может быть, если ордер исполнен, но выполнились так же условия переоткрытия ордера), удаляем таски
        if (e.code === -2011 && [READY_TO_REOPEN_BID, CLOSE_ASKS].includes(currentTask.step)) {
          this.tasksQueue = this.tasksQueue.filter(el => el.step !== currentTask.step);
        }
        this.logError(e);
      }

    }
  }

  async setMeanSell(data) {
    if(this.trades.length === 0) {
      this.trades = await this.binance.trades({symbol: this.symbol});
    } else {
      this.trades.shift();
      const el = {
        id: data.tradeId,
        price: data.price,
        qty: data.quantity,
        time: data.eventTime,
        isBuyerMaker: data.maker,
      };
      this.trades.push(el);
    }
    const volumes = [], volumesSell = [], volumesBuy = [];
    let meanBuyQty = 0;
    for (let el of this.trades) {
      volumes.push(Number(el.qty));
      const value = Number(el.qty);
      if (el.isBuyerMaker) {
        volumesSell.push(value);
      } else {
        volumesBuy.push(value);
      }
    }

    this.meanSellQty = mean(volumesSell.sort((a, b) => a - b).slice(-10));//среднее значение маскимальных 10 продаж
    // meanBuyQty = mean(volumesBuy.sort((a, b) => a - b).slice(-10));//среднее значение маскимальных 10 покупок

    // if (this.count === 0) {
    //   this.db.collection('trades').insertOne({
    //     symbol: this.symbol,
    //     volumesSell,
    //     volumesBuy,
    //     totalSell: volumesSell.reduce((prev, curr) => (prev + curr), 0),
    //     totalBuy: volumesBuy.reduce((prev, curr) => (prev + curr), 0),
    //     meanSellQty: this.meanSellQty,
    //     meanBuyQty
    //   });
    // } else if (this.count === 599) {
    //   this.count = 0;
    // } else {
    //   this.count++;
    // }

  }

  async start() {
    this.stop = false;
    const tick = async () => {
      await this.executeTask();
      //будем запускать ф-ию каждые 500 мс
      if (this.state.step !== STOP) {
        // await utils.asyncSetTimeOut(tick, 500);
        await asyncSetTimeOut(tick, 500);
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

      await this.setMeanSell();

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


            if (bigNumber(order.price).eq(bid.price) && (this.meanSellQty * this.closeBidsRate + Number(order.origQty) > Number(bid.quantity.toString()))) {
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

              //на текущий момент сделаем так, что пока полностью не выкуплен ордер открываться аск ордер не будет
              // if (this.fillsQty.gte(this.minQty)) {
              if (orderStatus === 'FILLED') {
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
                  this.state.setStep(this.stop ? STOP : START);
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

      this.webSockets.push(
        await this.binance.ws.trades(this.symbol, data => {
          this.setMeanSell(data);
        })
      );

      ////////////////////////websockets
      this.state.setStep(START);
    };

    this.tasksQueue.push({
      name: `start`,
      request,
      func,
      step: START,
    });

    await tick();
    return true;
  };

  async stopScalping(hard = false) {
    if (this.bidOrders.length > 0) {
      this.tasksQueue = [];//delete all tasks
      this.bidOrders.forEach(order => {
        let request = async () => await this.binance.cancelOrder({
          symbol: this.symbol,
          orderId: order.orderId
        });


        let func = async (res) => {

          try {
            await this.snapShot(undefined, 'STOP', {
              order: order,
              depth: this.partialDepth
            });
          } catch (e) {
            console.error(e);
          }

          this.bidOrders = this.bidOrders.filter(el => el.orderId !== order.orderId);
          if (this.bidOrders.length === 0) {
            this.state.setStep(STOP);
          }
        };

        this.tasksQueue.push({
          name: 'STOP',
          request,
          func,
          step: 'STOP'
        });
      });
      this.stop = true;
    } else if (this.askOrders.length > 0) {
      this.stop = true;
      if (hard) {
        this.state.setStep(STOP);
      }
    }
  };

  checkMinQty() {
    let maxQty = this.meanSellQty * this.openRate;
    console.log('maxQty', maxQty);
    const res = Number(this.partialDepth.bids[0].quantity) >= maxQty;

    return res;
  };

  getAsksToClose() {
    let close;
    let maxQty = this.meanSellQty * this.closeAsksRate;
    const byLimit = [], byMarket = [];
    for (let el of this.askOrders) {
      if (bigNumber(el.bidOrders[0].price).minus(this.partialDepth.bids[0].price).eq(this.tickSize)) {
        // в случае если количество упали ниже заданного алгоритмом будем закрывать по маркету
        if (Number(this.partialDepth.bids[0].quantity) <= Math.max(maxQty, this.minQuantityRate * (Number(el.origQty) - Number(el.executedQty)))) {
          byMarket.push({type: 'MARKET', order: el});
        } else if (!bigNumber(this.partialDepth.asks[0].price).eq(el.price) && Number(this.partialDepth.asks[0].quantity) >= Number(this.partialDepth.bids[0].quantity * this.reopenAsksRate)) {
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

  openBidOrder(prevOrder, price = this.bidData.price) {

    if (!prevOrder) {
      this.state.setStep(READY_TO_BID, {
        symbol: this.symbol,
        side: 'BUY',
        type: 'LIMIT',
        quantity: this.quantity,
        price: price.toFixed()
      });
    } else {
      this.state.setStep(READY_TO_REOPEN_BID, {
        newOrder: {
          symbol: this.symbol,
          side: 'BUY',
          type: 'LIMIT',
          quantity: this.quantity,
          price: price.toFixed()
        },
        prevOrder
      });
    }

  };

  snapShot(insertedId, action, tables, comment) {
    const {quantity, symbol, askOrders, bidOrders, webSockets, partialDepth, bidData, meanSellQty, fills, fillsQty, stop} = this;

    this.db.collection('log').insertOne({
      action,
      tables,
      instance: {quantity, symbol, askOrders, bidOrders, partialDepth, bidData, meanSellQty, fills, fillsQty, stop},
      comment
    }).then(
      res => {
        if(insertedId) {
          this.db.collection('text_logs').findOneAndUpdate({_id: insertedId}, {
            $set: {logId: res.insertedId}
          });
        }
      });
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


// MongoClient.connect(url, {useNewUrlParser: true}, function (err, client) {
//
//   assert.equal(null, err);
//   console.log('Connected successfully to server');
//
//   const db = client.db(dbName);
//   const args = meow();
//   if (!(args.flags.s && args.flags.q)) {
//     console.error('Enter arguments -s, -q');
//     process.exit(1);
//   }
//
//   const binance = require('binance-api-node').default({
//     apiKey: 'Q5LtPfSr9JKs09slnUk6XwGBSnMMotcd1KAhlAjil2VEbggIgqm1iw478Zx5x04a',
//     apiSecret: 'NORxIW5SEv7YJOohqTxSI0v1NMNyuT4lcz4T0pvkCRuYhLYxPQsCn7Fey3SZsyQR',
//     logToDb: db
//   });
//
//   // const binance = require('scalp-node').default();
//   // console.log('binance', binance);
//
//   const scalp = new Scalp(args.flags.s, db, binance);
//   scalp.start(Number(args.flags.q));
//
// });

// exports.default = Scalp;
export default Scalp;
