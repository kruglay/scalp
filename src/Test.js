import React, {useState, useRef} from 'react';
import {Button, Input} from 'antd';
import bigNumber from 'bignumber.js/bignumber.mjs';

import showMessage from 'utils/showMessage';
import {asyncSetTimeOut} from 'utils/async';

const Test = props => {
  const [loading, setLoading] = useState('');
  const [bidQuantity, setBidQuantity] = useState('0');
  const [askQuantity, setAskQuantity] = useState('0');

  const db = window.db;
  const bidPriceRef = useRef(bigNumber(0));
  const tickSize = '0.00000001';
  const onClickSetBid = async () => {
    setLoading('SetBid');
    try {
      await window.db.collection('depth').insertOne({
          'symbol': 'TRXBTC',
          'level': 5,
          'lastUpdateId': 221239009,
          'bids': [
            {
              'price': '0.00000162',
              'quantity': '3063582.00000000'
            },
            {
              'price': '0.00000161',
              'quantity': '5091760.00000000'
            },
            {
              'price': '0.00000160',
              'quantity': '7472885.00000000'
            },
            {
              'price': '0.00000159',
              'quantity': '1796498.00000000'
            },
            {
              'price': '0.00000158',
              'quantity': '3183659.00000000'
            }
          ],
          'asks': [
            {
              'price': '0.00000163',
              'quantity': '2460683.00000000'
            },
            {
              'price': '0.00000164',
              'quantity': '6297449.00000000'
            },
            {
              'price': '0.00000165',
              'quantity': '1860395.00000000'
            },
            {
              'price': '0.00000166',
              'quantity': '1441516.00000000'
            },
            {
              'price': '0.00000167',
              'quantity': '1620094.00000000'
            }
          ]
        }
      );
      bidPriceRef.current = bigNumber('0.00000162');
    } catch (e) {
      showMessage('error', e.message);
    }
    setLoading('');
  };

  const onClickRisePrice = async () => {
    setLoading('RisePrice');
    try {
      await window.db.collection('depth').insertOne({
          'symbol': 'TRXBTC',
          'level': 1,
          'lastUpdateId': 221239009,
          'bids': [
            {
              'price': bidPriceRef.current.plus(tickSize).toString(),
              'quantity': '3063582.00000000'
            },
          ],
          'asks': [
            {
              'price': bidPriceRef.current.plus('2').toString(),
              'quantity': '2460683.00000000'
            },
          ]
        }
      );
      bidPriceRef.current = bidPriceRef.current.plus(tickSize);
    } catch (e) {
      showMessage('error', e.message);
    }
    setLoading('');

  };

  const onClickBuyBid = async () => {
    setLoading('BuyBid');
    try {
      const doc = await db.collection('test_orders').findOneAndUpdate({
          status: 'NEW',
          type: 'LIMIT',
          side: 'BUY',
          symbol: 'TRXBTC',
        },
        {$set: {status: 'FILLED', executedQty: '500'}},
        {sort: {'updateTime': -1}});
      console.log('onClickBuyBid', doc._id)
    } catch (e) {
      showMessage('error', e.message);
    }
    setLoading('');
  };

  const onClickBuyPartBid = async () => {
    setLoading('BuyPartBid');
    try {
      const doc = await db.collection('test_orders').findOneAndUpdate({
          status: 'NEW',
          type: 'LIMIT',
          side: 'BUY',
          symbol: 'TRXBTC',
        },
        {$set: {status: 'PARTIALLY_FILLED', executedQty: '200'}},
        {sort: {'updateTime': -1}});
      console.log('onClickBuyPartBid', doc.value._id);

      await asyncSetTimeOut(() => db.collection('test_orders').updateOne(
        {_id: doc.value._id},
        {$set: {status: 'FILLED', executedQty: '500'}},
      ), 5000);

    } catch (e) {
      showMessage('error', e.message);
    }
    setLoading('');
  };

  const onClickSellAsk = async () => {
    setLoading('SellAsk');
    try {
      const doc = await db.collection('test_orders').findOneAndUpdate({
          status: 'NEW',
          type: 'LIMIT',
          side: 'SELL',
          symbol: 'TRXBTC',
        },
        {$set: {status: 'FILLED', executedQty: '500'}},
        {sort: {'updateTime': -1}});
    } catch (e) {
      showMessage('error', e.message);
    }
    setLoading('');
  };

  const onClickSellPartAsk = async () => {
    setLoading('PartAsk');
    try {
      const doc = await db.collection('test_orders').findOneAndUpdate({
          status: 'NEW',
          type: 'LIMIT',
          side: 'SELL',
          symbol: 'TRXBTC',
        },
        {$set: {status: 'PARTIALLY_FILLED', executedQty: '200'}},
        {sort: {'updateTime': -1}});
      console.log('onClickBuyPartBid', doc.value._id);

      asyncSetTimeOut(() => db.collection('test_orders').updateOne(
        {_id: doc.value._id},
        {$set: {status: 'FILLED', executedQty: '500'}},
      ), 5000);
    } catch (e) {
      showMessage('error', e.message);
    }
    setLoading('');
  };

  const onClickReducePrice = async () => {
    setLoading('ReducePrice');
    try {
      await window.db.collection('depth').insertOne({
          'symbol': 'TRXBTC',
          'level': 1,
          'lastUpdateId': 221239009,
          'bids': [
            {
              'price': bidPriceRef.current.minus(tickSize).toString(),
              'quantity': '3063582.00000000'
            },
          ],
          'asks': [
            {
              'price': bidPriceRef.current.toString(),
              'quantity': '2460683.00000000'
            },
          ]
        }
      );
      bidPriceRef.current = bidPriceRef.current.minus(tickSize);
    } catch (e) {
      showMessage('error', e.message);
    }
    setLoading('');
  };

  const onChangeBid = (e) => {
    setBidQuantity(e.target.value);
  };

  const onChangeAsk = (e) => {
    setAskQuantity(e.target.value);
  };

  const onClickBidQuantity = async () => {
    setLoading('setBidQuantity');
    try {
      await window.db.collection('depth').insertOne({
          'symbol': 'TRXBTC',
          'level': 1,
          'lastUpdateId': 221239009,
          'bids': [
            {
              'price': bidPriceRef.current.toString(),
              'quantity': bidQuantity
            },
          ],
          'asks': [
            {
              'price': bidPriceRef.current.plus(tickSize).toString(),
              'quantity': '2460683.00000000'
            },
          ]
        }
      );
    } catch (e) {
      showMessage('error', e.message);
    }
    setLoading('');
  };

  const onClickAskQuantity = async () => {
    setLoading('setAskQuantity');
    try {
      await window.db.collection('depth').insertOne({
          'symbol': 'TRXBTC',
          'level': 1,
          'lastUpdateId': 221239009,
          'bids': [
            {
              'price': bidPriceRef.current.toString(),
              'quantity': '3063582.00000000'
            },
          ],
          'asks': [
            {
              'price': bidPriceRef.current.plus(tickSize),
              'quantity': askQuantity
            },
          ]
        }
      );
    } catch (e) {
      showMessage('error', e.message);
    }
    setLoading('');
  };

  const onClickClear = async () => {
    try {
      setLoading('Clear');
      await db.collection("user").remove({});
      await db.collection("test_orders").remove({});
      await db.collection("orders").remove({});
    } catch (e) {
      showMessage('error', e.message);
      console.error(e);
    }
    setLoading('');
  };

  return (
    <div className="test">
      <Button onClick={onClickSetBid} loading={loading === 'SetBid'}>Set bid</Button>
      <Button onClick={onClickRisePrice} loading={loading === 'RisePrice'}>Rise price(reopen bid)</Button>
      <Button onClick={onClickBuyBid} loading={loading === 'BuyBid'}>Buy bid</Button>
      <Button onClick={onClickBuyPartBid}  loading={loading === 'BuyPartBid'}>Buy bid partially</Button>
      <Button onClick={onClickSellAsk} loading={loading === 'SellAsk'}>Sell Ask</Button>
      <Button onClick={onClickSellPartAsk} loading={loading === 'SellPartAsk'}>Sell Ask partially</Button>
      <Button onClick={onClickReducePrice} loading={loading === 'ReducePrice'}>Reduce price(reopen ask)</Button>
      <Button onClick={onClickClear} loading={loading === 'Clear'}>Clear</Button>
      <div className="bid-quantity">
        <Input onChange={onChangeBid} value={bidQuantity.toString()}/>
        <Button onClick={onClickBidQuantity} loading={loading === 'setBidQuantity'}>Set bid quantity</Button>
      </div>
      <div className="ask-quantity">
        <Input onChange={onChangeAsk} value={askQuantity.toString()}/>
        <Button onClick={onClickAskQuantity} loading={loading === 'setAskQuantity'}>Set ask quantity</Button>
      </div>
    </div>

  );
};

export default Test;
