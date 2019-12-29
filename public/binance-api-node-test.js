
const orderExample = {
  'symbol': 'TRXBTC',
  'orderId': 135824056,
  'orderListId': -1,
  'clientOrderId': 'XmopOMlI4uzXOpCfKeairb',
  'transactTime': 1567159903191.0,
  'price': '0.00000160',
  'origQty': '1000.00000000',
  'executedQty': '0.00000000',
  'cummulativeQuoteQty': '0.00000000',
  'status': 'NEW',
  'timeInForce': 'GTC',
  'type': 'LIMIT',
  'side': 'BUY',
  'updateTime': 1547075016737,
  'fills': []
};

const userInfo = {
  "eventType" : "executionReport",
  "eventTime" : 1568145415999.0,
  "symbol" : "TRXBTC",
  "newClientOrderId" : "web_ae49df6836794e44bee3e58e00ba0cbd",
  "originalClientOrderId" : "null",
  "side" : "BUY",
  "orderType" : "LIMIT",
  "timeInForce" : "GTC",
  "quantity" : "1000.00000000",
  "price" : "0.00000150",
  "executionType" : "NEW",
  "stopPrice" : "0.00000000",
  "icebergQuantity" : "0.00000000",
  "orderStatus" : "NEW",
  "orderRejectReason" : "NONE",
  "orderId" : 138219648,
  "orderTime" : 1568145415995.0,
  "lastTradeQuantity" : "0.00000000",
  "totalTradeQuantity" : "0.00000000",
  "priceLastTrade" : "0.00000000",
  "commission" : "0",
  "commissionAsset" : null,
  "tradeId" : -1,
  "isOrderWorking" : true,
  "isBuyerMaker" : false,
  "creationTime" : 1568145415995.0,
  "totalQuoteTradeQuantity" : "0.00000000"
};

let throwErrorCounter = 0;

module.exports.default = (db) => {
  const throwError = (func) => {
    if(throwErrorCounter%2 === 0) {
      throwErrorCounter++;
      throw(Error(`some error in function ${func.name}`));
    } else {
      throwErrorCounter++;
    }
  };
  const order = async (params) => {
    throwError(order);
    const count = await db.collection('test_orders').count();
    //todo check params
    const newDoc = {
      ...orderExample,
      orderId: count,
      transactTime: Date.now(),
      price: params.price ? params.price.toString() : undefined,
      symbol: params.symbol,
      origQty: params.quantity.toString(),
      type: params.type,
      side: params.side,
      clientOrderId: orderExample.clientOrderId + count
    };
    const dbDoc = await db.collection('test_orders').insertOne(newDoc);

    return newDoc;
  };

  const cancelOrder = async (params) => {
    throwError(cancelOrder);
    //todo check params
    const $set = {status: 'CANCELED', updateTime: Date.now()};
    const doc = await db.collection('test_orders').updateOne({symbol: params.symbol, orderId: params.orderId}, {$set});

    return doc;
  };

  const exchangeInfo = async () => {
    throwError(exchangeInfo);

    // return await db.collection('exchangeInfo').findOne("5d68ed9a58ed606836df3c7b");
    return await db.collection('exchangeInfo').findOne();
  };

  const trades = async () => {
    // throwError(trades);
    const doc = await db.collection('trades').findOne();

    return doc.trades;
  };

  const ws = {
    partialDepth(params, callback) {

      const watchCursor = db.collection('depth').watch(
        [
          {$match: {'operationType': 'insert'}}
        ]
      );
      watchCursor.on('change', (next) => {
        const doc = next.fullDocument;
        delete doc._id;
        return callback(doc);
      });

      return () => {
        watchCursor.close();
      }
    },

    user(callback) {
      const watchCursor = db.collection('user').watch(
        [
          {$match: {'operationType': 'insert'}}
        ]
      );
      watchCursor.on('change', (next) => callback(next.fullDocument));

      const $match = {
        operationType: {$in: ['insert', 'update', 'replace']}
      };

      const watchOrder = db.collection('test_orders').watch(
        [{$match}],
        {fullDocument: 'updateLookup'}
      );

      watchOrder.on('change', (next) => {
        const {operationType, updateDescription, fullDocument} = next;
        const {side, symbol, orderId, status, type, transactTime, origQty, price, executedQty} = fullDocument;
        const doc = {
          ...userInfo,
          eventTime: Date.now(),
          quantity: origQty,
          price,
          orderType: type,
          orderStatus: status,
          orderId,
          orderTime: transactTime,
          creationTime: transactTime,
          totalTradeQuantity: executedQty,
          lastTradeQuantity: executedQty,
          symbol,
          side
        };

        db.collection('user').insertOne(doc);

      });
      return () => {
        watchOrder.close();
        watchCursor.close();
      }
    }
  };

  return {
    order,
    cancelOrder,
    exchangeInfo,
    trades,
    ws
  };
};
