import './App.css';

import React, {useState, useEffect} from 'react';
import {MemoryRouter as Router, Route, NavLink} from 'react-router-dom';
import {Menu, Spin, Tabs} from 'antd';

import OrderHistory from 'components/OrderHistory';
import OpenOrders from 'components/OpenOrders';
import Scalp from 'components/ScalpComponent';
import showMessage from 'utils/showMessage';
import Test from 'Test';

const {TabPane} = Tabs;

const App = (props) => {
  const [selectedKey, setSelectedKey] = useState(['scalp']);
  const [spining, setSpining] = useState(false);

  // useEffect(() => {
  //   const func = async () => {
  //     setSpining(true);
  //     try {
  //       window.db = await mongoClient(dbName);
  //       window.binance = Binance({
  //         apiKey: 'Q5LtPfSr9JKs09slnUk6XwGBSnMMotcd1KAhlAjil2VEbggIgqm1iw478Zx5x04a',
  //         apiSecret: 'NORxIW5SEv7YJOohqTxSI0v1NMNyuT4lcz4T0pvkCRuYhLYxPQsCn7Fey3SZsyQR',
  //         logToDb: window.db
  //       })
  //     } catch (e) {
  //       showMessage('error', "Something wrong, try to reload app");
  //       console.error(e);
  //     }
  //     setSpining(false);
  //   };
  //   func();
  // }, []);

  return (
    <Spin className="App" spinning={spining} tip="Loading..." size="large">
      <Tabs
        defaultActiveKey={'scalp'}
      >
        <TabPane tab="Scalp" key="scalp">
          <Scalp/>
        </TabPane>
        {
          window.process.env.TEST &&
          <TabPane tab="Test" key="test">
            <Test/>
          </TabPane>
        }
        <TabPane tab="Order history" key="orderHistory">
          <OrderHistory/>
        </TabPane>

      </Tabs>
    </Spin>
  );
};

export default App;
